import pytest
import uuid
import json
from sqlmodel import Session, create_engine, SQLModel
from sqlalchemy.pool import StaticPool

from app.models.schemas import CanonicalTransaction
from app.engine.tier1_exact import Tier1ExactMatcher
from app.engine.tier2_fuzzy import Tier2FuzzyMatcher


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


def test_tier1_exact_match(test_session):
    run_id = "test_run_1"
    tx1 = CanonicalTransaction(
        id=str(uuid.uuid4()),
        dataset_version="v1",
        source="ledger",
        source_row_id=1,
        normalized_ref="ord-10001",
        amount_paise=100000,
        event_date="2026-08-01",
        batch_id=None,
        raw_payload_json="{}",
        dataset_split="holdout",
    )
    tx2 = CanonicalTransaction(
        id=str(uuid.uuid4()),
        dataset_version="v1",
        source="settlement",
        source_row_id=1,
        normalized_ref="ord-10001",
        amount_paise=97640,
        event_date="2026-08-03",
        batch_id="STL-1001",
        raw_payload_json="{}",
        dataset_split="holdout",
    )
    test_session.add_all([tx1, tx2])
    test_session.commit()

    matcher = Tier1ExactMatcher(run_id)
    groups, unmatched = matcher.match(test_session, [tx1, tx2])

    assert len(groups) == 1
    assert groups[0].tier == "exact"
    assert groups[0].confidence == 1.0
    assert len(unmatched) == 0


def test_tier2_fuzzy_match_on_typo_and_fee(test_session):
    run_id = "test_run_2"
    # Order ID with minor transposition (ord-10023 vs ord-10032)
    tx1 = CanonicalTransaction(
        id=str(uuid.uuid4()),
        dataset_version="v1",
        source="ledger",
        source_row_id=2,
        normalized_ref="ord-10023",
        amount_paise=200000,
        event_date="2026-08-05",
        batch_id=None,
        raw_payload_json="{}",
        dataset_split="holdout",
    )
    # Settlement net amount = 200000 - 2% fee (4000) - 18% GST (720) = 195280
    tx2 = CanonicalTransaction(
        id=str(uuid.uuid4()),
        dataset_version="v1",
        source="settlement",
        source_row_id=2,
        normalized_ref="ord-10032",
        amount_paise=195280,
        event_date="2026-08-07",
        batch_id="STL-1002",
        raw_payload_json="{}",
        dataset_split="holdout",
    )
    test_session.add_all([tx1, tx2])
    test_session.commit()

    matcher = Tier2FuzzyMatcher(run_id)
    groups, unmatched = matcher.match(test_session, [tx1, tx2])

    assert len(groups) == 1
    assert groups[0].tier == "fuzzy"
    assert groups[0].confidence >= 0.70
    assert len(unmatched) == 0
