import json
import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..core.config import settings
from ..core.database import get_session
from ..models.schemas import (
    ReconciliationRun,
    AuditLog,
    ReconciliationException,
    QASession,
    QAMessage,
)
from ..services.llm_client import get_llm_client, question_in_product_scope, OFF_TOPIC_REFUSAL

router = APIRouter(prefix="/qa", tags=["Settlement Q&A"])


class QAAskRequest(BaseModel):
    run_id: str = Field(description="Target reconciliation run ID")
    question: str = Field(description="Natural language question regarding settlements, deductions, or recon status")
    session_id: Optional[str] = Field(default=None, description="Optional existing Q&A conversation session ID")


class QAAskResponse(BaseModel):
    session_id: str
    question: str
    answer: str
    cited_audit_log_ids: List[int]
    llm_live: bool = False


@router.post("/ask", response_model=QAAskResponse)
async def ask_settlement_question(
    req: QAAskRequest,
    session: Session = Depends(get_session),
):
    """Ask a natural-language question regarding a completed reconciliation run."""
    run = session.exec(
        select(ReconciliationRun).where(ReconciliationRun.id == req.run_id)
    ).first()

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "RUN_NOT_FOUND", "message": f"Run '{req.run_id}' not found."}},
        )

    # 1. Manage QASession
    session_id = req.session_id
    if not session_id:
        session_id = f"sess_{uuid.uuid4().hex[:10]}"
        qa_sess = QASession(id=session_id, run_id=req.run_id)
        session.add(qa_sess)
        session.commit()

    if not question_in_product_scope(req.question):
        if not session_id:
            session_id = f"sess_{uuid.uuid4().hex[:10]}"
            session.add(QASession(id=session_id, run_id=req.run_id))
            session.commit()
        answer = OFF_TOPIC_REFUSAL
        session.add_all([
            QAMessage(session_id=session_id, role="user", content=req.question),
            QAMessage(session_id=session_id, role="assistant", content=answer, cited_audit_log_ids_json="[]"),
        ])
        session.commit()
        live = bool(settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")) and settings.LLM_MODE != "mock"
        return QAAskResponse(
            session_id=session_id,
            question=req.question,
            answer=answer,
            cited_audit_log_ids=[],
            llm_live=live,
        )

    # 2. Retrieve relevant context from DB
    audit_logs = session.exec(
        select(AuditLog).where(AuditLog.run_id == req.run_id).limit(8)
    ).all()

    exceptions = session.exec(
        select(ReconciliationException).where(ReconciliationException.run_id == req.run_id).limit(5)
    ).all()

    context = {
        "run_id": run.id,
        "metrics": {
            "record_count": run.record_count,
            "match_rate": run.match_rate,
            "precision": run.precision,
            "recall": run.recall,
            "throughput_rps": run.throughput_rps,
            "exact_matches": run.exact_matches,
            "fuzzy_matches": run.fuzzy_matches,
            "ai_matches": run.ai_matches,
            "exception_count": run.exception_count,
        },
        "audit_logs": [
            {
                "id": a.id,
                "tier": a.tier,
                "action": a.action,
                "reason": (a.reason or "")[:180],
                "confidence": a.confidence,
            }
            for a in audit_logs
        ],
        "exceptions": [
            {"id": e.id, "reason_code": e.reason_code, "reason_text": e.reason_text}
            for e in exceptions
        ],
    }

    history_rows = session.exec(
        select(QAMessage)
        .where(QAMessage.session_id == session_id)
        .order_by(QAMessage.id.asc())
    ).all()
    history = [{"role": m.role, "content": m.content} for m in history_rows[-6:]]

    llm_client = get_llm_client()
    qa_result = await llm_client.answer_question(req.question, context, history)

    answer = qa_result.get("answer", "No answer generated.")
    cited_ids = qa_result.get("cited_audit_log_ids", [])

    # 4. Save messages to history
    msg_user = QAMessage(
        session_id=session_id,
        role="user",
        content=req.question,
    )
    msg_bot = QAMessage(
        session_id=session_id,
        role="assistant",
        content=answer,
        cited_audit_log_ids_json=json.dumps(cited_ids),
    )
    session.add_all([msg_user, msg_bot])
    session.commit()

    live = bool(settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")) and settings.LLM_MODE != "mock"

    return QAAskResponse(
        session_id=session_id,
        question=req.question,
        answer=answer,
        cited_audit_log_ids=cited_ids,
        llm_live=live,
    )


@router.get("/history/{session_id}")
def get_qa_history(
    session_id: str,
    session: Session = Depends(get_session),
):
    """Retrieve chat history for a given Q&A session."""
    messages = session.exec(
        select(QAMessage).where(QAMessage.session_id == session_id).order_by(QAMessage.id.asc())
    ).all()

    return {
        "session_id": session_id,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "cited_audit_log_ids": json.loads(m.cited_audit_log_ids_json) if m.cited_audit_log_ids_json else [],
                "created_at": m.created_at,
            }
            for m in messages
        ],
    }
