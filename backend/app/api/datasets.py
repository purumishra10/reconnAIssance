from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select, func

from ..core.database import get_session
from ..generator.data_generator import SyntheticDataGenerator
from ..models.schemas import RawLedgerRow, RawSettlementRow, RawBankRow

router = APIRouter(prefix="/datasets", tags=["Datasets"])


class DatasetGenerateRequest(BaseModel):
    seed: int = Field(default=42, description="RNG seed for reproducibility")
    record_count: int = Field(default=2000, ge=10, le=50000, description="Total base orders to generate")
    split_ratio: float = Field(default=0.8, ge=0.1, le=0.95, description="Fraction allocated to tuning split")


class DatasetGenerateResponse(BaseModel):
    dataset_version: str
    record_count: int
    tuning_count: int
    holdout_count: int
    ledger_count: int
    settlement_count: int
    bank_count: int
    batches_count: int


@router.post("/generate", response_model=DatasetGenerateResponse, status_code=status.HTTP_201_CREATED)
def generate_dataset(
    req: DatasetGenerateRequest,
    session: Session = Depends(get_session),
):
    """Generate deterministic synthetic datasets with injected financial noise patterns."""
    generator = SyntheticDataGenerator(
        seed=req.seed,
        record_count=req.record_count,
        split_ratio=req.split_ratio,
    )
    result = generator.generate(session)
    return DatasetGenerateResponse(
        dataset_version=result["dataset_version"],
        record_count=result["record_count"],
        tuning_count=result["tuning_count"],
        holdout_count=result["holdout_count"],
        ledger_count=result["ledger_count"],
        settlement_count=result["settlement_count"],
        bank_count=result["bank_count"],
        batches_count=result["batches_count"],
    )


@router.get("/{dataset_version}")
def get_dataset_summary(
    dataset_version: str,
    session: Session = Depends(get_session),
):
    """Fetch summary statistics for a previously generated dataset."""
    ledger_count = session.exec(
        select(func.count(RawLedgerRow.id)).where(RawLedgerRow.dataset_version == dataset_version)
    ).one()

    if ledger_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "DATASET_NOT_FOUND", "message": f"Dataset '{dataset_version}' not found."}},
        )

    settlement_count = session.exec(
        select(func.count(RawSettlementRow.id)).where(RawSettlementRow.dataset_version == dataset_version)
    ).one()
    bank_count = session.exec(
        select(func.count(RawBankRow.id)).where(RawBankRow.dataset_version == dataset_version)
    ).one()

    tuning_count = session.exec(
        select(func.count(RawLedgerRow.id)).where(
            RawLedgerRow.dataset_version == dataset_version,
            RawLedgerRow.dataset_split == "tuning",
        )
    ).one()

    holdout_count = session.exec(
        select(func.count(RawLedgerRow.id)).where(
            RawLedgerRow.dataset_version == dataset_version,
            RawLedgerRow.dataset_split == "holdout",
        )
    ).one()

    return {
        "dataset_version": dataset_version,
        "record_count": ledger_count,
        "tuning_count": tuning_count,
        "holdout_count": holdout_count,
        "ledger_count": ledger_count,
        "settlement_count": settlement_count,
        "bank_count": bank_count,
    }
