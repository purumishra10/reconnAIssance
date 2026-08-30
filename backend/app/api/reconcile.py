import asyncio
import csv
import io
import json
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select, func

from ..core.database import get_session, engine
from ..models.schemas import (
    ReconciliationRun,
    MatchGroup,
    MatchGroupMember,
    CanonicalTransaction,
    ReconciliationException,
    AuditLog,
)
from ..engine.pipeline import ReconciliationPipeline

router = APIRouter(prefix="/reconcile", tags=["Reconciliation"])


class ReconcileRunRequest(BaseModel):
    dataset_version: str = Field(default="ds_2000_seed42", description="Dataset identifier")
    split: str = Field(default="holdout", description="tuning / holdout / all")


class ReconcileRunResponse(BaseModel):
    run_id: str
    status: str


def run_pipeline_task(run_id: str, dataset_version: str, split: str):
    """Background execution task for reconciliation pipeline (sync wrapper for SQLite safety)."""
    with Session(engine) as session:
        pipeline = ReconciliationPipeline(run_id, dataset_version, split)
        asyncio.run(pipeline.execute(session))


@router.post("/run", response_model=ReconcileRunResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_reconciliation_run(
    req: ReconcileRunRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Start an asynchronous reconciliation run against a dataset split."""
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    run = ReconciliationRun(
        id=run_id,
        dataset_version=req.dataset_version,
        split=req.split,
        status="running",
    )
    session.add(run)
    session.commit()

    background_tasks.add_task(run_pipeline_task, run_id, req.dataset_version, req.split)

    return ReconcileRunResponse(run_id=run_id, status="running")


@router.get("/runs")
def list_reconciliation_runs(
    session: Session = Depends(get_session),
):
    """List all previous reconciliation runs."""
    runs = session.exec(
        select(ReconciliationRun).order_by(ReconciliationRun.started_at.desc())
    ).all()
    return {"results": runs}


@router.get("/{run_id}/summary")
def get_run_summary(
    run_id: str,
    session: Session = Depends(get_session),
):
    """Fetch run status and scored headline metrics."""
    run = session.exec(
        select(ReconciliationRun).where(ReconciliationRun.id == run_id)
    ).first()

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run '{run_id}' not found."}},
        )

    return {
        "run_id": run.id,
        "dataset_version": run.dataset_version,
        "split": run.split,
        "status": run.status,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "record_count": run.record_count,
        "match_rate": run.match_rate,
        "precision": run.precision,
        "recall": run.recall,
        "throughput_rps": run.throughput_rps,
        "tier_breakdown": {
            "exact": run.exact_matches,
            "fuzzy": run.fuzzy_matches,
            "ai_assisted": run.ai_matches,
        },
        "exception_count": run.exception_count,
        "error_message": run.error_message,
    }


@router.get("/{run_id}/matches")
def get_run_matches(
    run_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    tier: Optional[str] = Query(default=None, description="exact / fuzzy / ai_assisted"),
    session: Session = Depends(get_session),
):
    """Fetch paginated match groups for a reconciliation run with member details."""
    query = select(MatchGroup).where(MatchGroup.run_id == run_id)
    if tier:
        query = query.where(MatchGroup.tier == tier)

    count_query = select(func.count(MatchGroup.id)).where(MatchGroup.run_id == run_id)
    if tier:
        count_query = count_query.where(MatchGroup.tier == tier)
    total = session.exec(count_query).one()

    offset = (page - 1) * page_size
    groups = session.exec(query.offset(offset).limit(page_size)).all()

    # Load member details for each group
    group_ids = [g.id for g in groups]
    members_data = session.exec(
        select(MatchGroupMember, CanonicalTransaction)
        .join(CanonicalTransaction, MatchGroupMember.canonical_transaction_id == CanonicalTransaction.id)
        .where(MatchGroupMember.group_id.in_(group_ids))
    ).all() if group_ids else []

    member_map: Dict[str, List[Dict[str, Any]]] = {}
    for m, c in members_data:
        try:
            raw_payload = json.loads(c.raw_payload_json)
        except Exception:
            raw_payload = {}

        member_map.setdefault(m.group_id, []).append({
            "role": m.role,
            "canonical_id": c.id,
            "source": c.source,
            "normalized_ref": c.normalized_ref,
            "amount_paise": c.amount_paise,
            "amount_rupees": round(c.amount_paise / 100.0, 2),
            "event_date": c.event_date,
            "batch_id": c.batch_id,
            "details": raw_payload,
        })

    results = []
    for g in groups:
        results.append({
            "group_id": g.id,
            "tier": g.tier,
            "confidence": g.confidence,
            "reason": g.reason,
            "created_at": g.created_at,
            "members": member_map.get(g.id, []),
        })

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "results": results,
    }


@router.get("/{run_id}/exceptions")
def get_run_exceptions(
    run_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    reason_code: Optional[str] = Query(default=None),
    session: Session = Depends(get_session),
):
    """Fetch paginated unresolved exceptions with reason codes and transaction payload."""
    query = (
        select(ReconciliationException, CanonicalTransaction)
        .join(CanonicalTransaction, ReconciliationException.canonical_transaction_id == CanonicalTransaction.id)
        .where(ReconciliationException.run_id == run_id)
    )

    if reason_code:
        query = query.where(ReconciliationException.reason_code == reason_code)

    count_query = select(func.count(ReconciliationException.id)).where(ReconciliationException.run_id == run_id)
    if reason_code:
        count_query = count_query.where(ReconciliationException.reason_code == reason_code)
    total = session.exec(count_query).one()

    offset = (page - 1) * page_size
    records = session.exec(query.offset(offset).limit(page_size)).all()

    results = []
    for exc, c in records:
        try:
            raw_payload = json.loads(c.raw_payload_json)
        except Exception:
            raw_payload = {}

        results.append({
            "exception_id": exc.id,
            "canonical_transaction_id": c.id,
            "source": c.source,
            "normalized_ref": c.normalized_ref,
            "amount_paise": c.amount_paise,
            "amount_rupees": round(c.amount_paise / 100.0, 2),
            "event_date": c.event_date,
            "reason_code": exc.reason_code,
            "reason_text": exc.reason_text,
            "unresolved_after_tier": exc.unresolved_after_tier,
            "details": raw_payload,
        })

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "results": results,
    }


@router.get("/{run_id}/audit-log")
def get_run_audit_log(
    run_id: str,
    canonical_transaction_id: Optional[str] = Query(default=None),
    tier: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
):
    """Fetch inspectable audit trail entries for a run with optional filtering."""
    query = select(AuditLog).where(AuditLog.run_id == run_id)
    if canonical_transaction_id:
        query = query.where(AuditLog.canonical_transaction_id == canonical_transaction_id)
    if tier:
        query = query.where(AuditLog.tier == tier)
    if action:
        query = query.where(AuditLog.action == action)

    count_query = select(func.count(AuditLog.id)).where(AuditLog.run_id == run_id)
    if canonical_transaction_id:
        count_query = count_query.where(AuditLog.canonical_transaction_id == canonical_transaction_id)
    if tier:
        count_query = count_query.where(AuditLog.tier == tier)
    if action:
        count_query = count_query.where(AuditLog.action == action)
    total = session.exec(count_query).one()

    offset = (page - 1) * page_size
    entries = session.exec(query.order_by(AuditLog.id.asc()).offset(offset).limit(page_size)).all()

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "results": entries,
    }


@router.get("/{run_id}/exceptions/export")
def export_exceptions_csv(
    run_id: str,
    session: Session = Depends(get_session),
):
    """Export unresolved exceptions as a downloadable CSV file."""
    records = session.exec(
        select(ReconciliationException, CanonicalTransaction)
        .join(CanonicalTransaction, ReconciliationException.canonical_transaction_id == CanonicalTransaction.id)
        .where(ReconciliationException.run_id == run_id)
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Exception ID",
        "Canonical ID",
        "Source",
        "Reference ID",
        "Amount (Rupees)",
        "Amount (Paise)",
        "Event Date",
        "Reason Code",
        "Reason Description",
        "Unresolved After Tier",
    ])

    for exc, c in records:
        writer.writerow([
            exc.id,
            c.id,
            c.source,
            c.normalized_ref,
            f"{c.amount_paise / 100.0:.2f}",
            c.amount_paise,
            c.event_date,
            exc.reason_code,
            exc.reason_text,
            exc.unresolved_after_tier,
        ])

    csv_data = output.getvalue()
    filename = f"reconnaissance_exceptions_{run_id}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
