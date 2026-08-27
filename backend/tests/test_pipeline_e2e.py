import pytest
import asyncio
from sqlmodel import Session, create_engine, SQLModel
from sqlalchemy.pool import StaticPool

from app.generator.data_generator import SyntheticDataGenerator
from app.engine.pipeline import ReconciliationPipeline
from app.models.schemas import ReconciliationRun, MatchGroup, ReconciliationException, AuditLog


@pytest.fixture
def test_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.mark.asyncio
async def test_full_reconciliation_pipeline_e2e(test_session):
    # 1. Generate small dataset
    seed = 42
    record_count = 100
    gen = SyntheticDataGenerator(seed=seed, record_count=record_count, split_ratio=0.8)
    res = gen.generate(test_session)
    dataset_version = res["dataset_version"]

    # 2. Run Pipeline
    run_id = "test_run_e2e"
    pipeline = ReconciliationPipeline(run_id=run_id, dataset_version=dataset_version, split="holdout")
    summary = await pipeline.execute(test_session)

    assert summary["status"] == "completed"
    assert summary["record_count"] > 0
    assert 0.70 <= summary["match_rate"] <= 1.0
    assert summary["precision"] >= 0.85
    assert summary["recall"] >= 0.70
    assert summary["throughput_rps"] > 0
    assert summary["tier_breakdown"]["exact"] > 0
    assert summary["exception_count"] >= 0
