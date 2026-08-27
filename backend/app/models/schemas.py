from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class RawLedgerRow(SQLModel, table=True):
    __tablename__ = "raw_ledger_row"

    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_version: str = Field(index=True)
    order_id: str = Field(index=True)
    order_date: str
    amount_paise: int
    payment_method: str
    status: str
    dataset_split: str = Field(index=True)


class RawSettlementRow(SQLModel, table=True):
    __tablename__ = "raw_settlement_row"

    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_version: str = Field(index=True)
    settlement_batch_id: str = Field(index=True)
    utr: str = Field(index=True)
    order_ref: str = Field(index=True)
    gross_amount_paise: int
    fee_amount_paise: int
    gst_on_fee_paise: int
    net_amount_paise: int
    settlement_date: str
    dataset_split: str = Field(index=True)


class RawBankRow(SQLModel, table=True):
    __tablename__ = "raw_bank_row"

    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_version: str = Field(index=True)
    bank_txn_id: str = Field(index=True)
    value_date: str
    credit_amount_paise: int
    narration: str
    dataset_split: str = Field(index=True)


class CanonicalTransaction(SQLModel, table=True):
    __tablename__ = "canonical_transaction"

    id: str = Field(primary_key=True)
    dataset_version: str = Field(index=True)
    source: str = Field(index=True)  # ledger / settlement / bank
    source_row_id: int
    normalized_ref: str = Field(index=True)
    amount_paise: int
    event_date: str
    batch_id: Optional[str] = Field(default=None, index=True)
    raw_payload_json: str
    dataset_split: str = Field(index=True)


class MatchGroup(SQLModel, table=True):
    __tablename__ = "match_group"

    id: str = Field(primary_key=True)
    run_id: str = Field(index=True)
    tier: str = Field(index=True)  # exact / fuzzy / ai_assisted
    confidence: float
    reason: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class MatchGroupMember(SQLModel, table=True):
    __tablename__ = "match_group_member"

    id: Optional[int] = Field(default=None, primary_key=True)
    group_id: str = Field(foreign_key="match_group.id", index=True)
    canonical_transaction_id: str = Field(foreign_key="canonical_transaction.id", index=True)
    role: str  # ledger_entry / settlement_entry / bank_entry


class ReconciliationException(SQLModel, table=True):
    __tablename__ = "exception"

    id: str = Field(primary_key=True)
    run_id: str = Field(index=True)
    canonical_transaction_id: str = Field(foreign_key="canonical_transaction.id", index=True)
    reason_code: str = Field(index=True)  # NO_COUNTERPART_FOUND, AMOUNT_MISMATCH, etc.
    reason_text: str
    unresolved_after_tier: str


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    run_id: str = Field(index=True)
    canonical_transaction_id: Optional[str] = Field(default=None, index=True)
    group_id: Optional[str] = Field(default=None, index=True)
    tier: str = Field(index=True)  # exact / fuzzy / ai_assisted / evaluation / ingestion
    action: str = Field(index=True)  # matched / rejected / flagged_exception / scored
    confidence: Optional[float] = None
    reason: str
    raw_llm_response_json: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ReconciliationRun(SQLModel, table=True):
    __tablename__ = "reconciliation_run"

    id: str = Field(primary_key=True)
    dataset_version: str = Field(index=True)
    split: str = Field(default="holdout")  # tuning / holdout / all
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None
    record_count: int = 0
    match_rate: float = 0.0
    precision: float = 0.0
    recall: float = 0.0
    throughput_rps: float = 0.0
    status: str = Field(default="running")  # running / completed / failed
    exact_matches: int = 0
    fuzzy_matches: int = 0
    ai_matches: int = 0
    exception_count: int = 0
    error_message: Optional[str] = None


class QASession(SQLModel, table=True):
    __tablename__ = "qa_session"

    id: str = Field(primary_key=True)
    run_id: str = Field(index=True)
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class QAMessage(SQLModel, table=True):
    __tablename__ = "qa_message"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(foreign_key="qa_session.id", index=True)
    role: str  # user / assistant
    content: str
    cited_audit_log_ids_json: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
