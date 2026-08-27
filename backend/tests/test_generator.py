import pytest
from sqlmodel import Session, create_engine, SQLModel
from sqlalchemy.pool import StaticPool

from app.generator.data_generator import SyntheticDataGenerator
from app.models.schemas import RawLedgerRow, RawSettlementRow, RawBankRow


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


def test_synthetic_data_generator_deterministic(test_session):
    gen1 = SyntheticDataGenerator(seed=42, record_count=50, split_ratio=0.8)
    res1 = gen1.generate(test_session)

    assert res1["record_count"] >= 50
    assert res1["ledger_count"] >= 50
    assert res1["settlement_count"] > 0
    assert res1["bank_count"] > 0
    assert res1["tuning_count"] > 0
    assert res1["holdout_count"] > 0
