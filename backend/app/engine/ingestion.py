import json
import re
import uuid
from typing import List, Tuple
from sqlmodel import Session, select, delete

from ..models.schemas import (
    RawLedgerRow,
    RawSettlementRow,
    RawBankRow,
    CanonicalTransaction,
    AuditLog,
)


def normalize_ref_string(ref: str) -> str:
    """Standardize reference IDs by trimming, lowercasing, and normalizing punctuation."""
    if not ref:
        return ""
    # Strip whitespace, lowercase, normalize underscores/spaces to hyphens
    cleaned = ref.strip().lower()
    cleaned = re.sub(r"[\s_]+", "-", cleaned)
    return cleaned


def extract_utr_and_batch_from_narration(narration: str) -> Tuple[str, str]:
    """Extract potential UTR and Batch ID from unstructured bank narration."""
    utr = ""
    batch_id = ""

    # Look for UTR patterns like UTR26081001RZP or UTR:XYZ
    utr_match = re.search(r"(UTR\w+RZP|UTR[:\s-]*\w+)", narration, re.IGNORECASE)
    if utr_match:
        utr = utr_match.group(1).replace(":", "").replace(" ", "").strip().upper()

    # Look for Batch ID patterns like STL-1001
    batch_match = re.search(r"(STL-\d+)", narration, re.IGNORECASE)
    if batch_match:
        batch_id = batch_match.group(1).upper()

    return utr, batch_id


class IngestionEngine:
    def __init__(self, run_id: str, dataset_version: str, split: str = "holdout"):
        self.run_id = run_id
        self.dataset_version = dataset_version
        self.split = split

    def ingest(self, session: Session) -> List[CanonicalTransaction]:
        """Load raw rows for the specified split and normalize into CanonicalTransaction records."""
        # 1. Clean any existing canonical rows for this run
        session.exec(
            delete(CanonicalTransaction).where(CanonicalTransaction.dataset_version == self.dataset_version)
        )
        session.commit()

        canonical_records: List[CanonicalTransaction] = []
        audit_logs: List[AuditLog] = []

        # 2. Ingest Ledger Rows
        ledger_query = select(RawLedgerRow).where(RawLedgerRow.dataset_version == self.dataset_version)
        if self.split in ["tuning", "holdout"]:
            ledger_query = ledger_query.where(RawLedgerRow.dataset_split == self.split)

        ledger_rows = session.exec(ledger_query).all()
        for row in ledger_rows:
            canon_id = str(uuid.uuid4())
            normalized_ref = normalize_ref_string(row.order_id)
            payload = {
                "source": "ledger",
                "raw_id": row.id,
                "order_id": row.order_id,
                "order_date": row.order_date,
                "amount_paise": row.amount_paise,
                "payment_method": row.payment_method,
                "status": row.status,
            }
            c_row = CanonicalTransaction(
                id=canon_id,
                dataset_version=self.dataset_version,
                source="ledger",
                source_row_id=row.id or 0,
                normalized_ref=normalized_ref,
                amount_paise=row.amount_paise,
                event_date=row.order_date,
                batch_id=None,
                raw_payload_json=json.dumps(payload),
                dataset_split=row.dataset_split,
            )
            canonical_records.append(c_row)

        # 3. Ingest Settlement Rows
        settlement_query = select(RawSettlementRow).where(
            RawSettlementRow.dataset_version == self.dataset_version
        )
        if self.split in ["tuning", "holdout"]:
            settlement_query = settlement_query.where(RawSettlementRow.dataset_split == self.split)

        settlement_rows = session.exec(settlement_query).all()
        for row in settlement_rows:
            canon_id = str(uuid.uuid4())
            normalized_ref = normalize_ref_string(row.order_ref)
            payload = {
                "source": "settlement",
                "raw_id": row.id,
                "settlement_batch_id": row.settlement_batch_id,
                "utr": row.utr,
                "order_ref": row.order_ref,
                "gross_amount_paise": row.gross_amount_paise,
                "fee_amount_paise": row.fee_amount_paise,
                "gst_on_fee_paise": row.gst_on_fee_paise,
                "net_amount_paise": row.net_amount_paise,
                "settlement_date": row.settlement_date,
            }
            c_row = CanonicalTransaction(
                id=canon_id,
                dataset_version=self.dataset_version,
                source="settlement",
                source_row_id=row.id or 0,
                normalized_ref=normalized_ref,
                amount_paise=row.net_amount_paise,  # Net amount for reconciliation with bank/ledger
                event_date=row.settlement_date,
                batch_id=row.settlement_batch_id,
                raw_payload_json=json.dumps(payload),
                dataset_split=row.dataset_split,
            )
            canonical_records.append(c_row)

        # 4. Ingest Bank Rows
        bank_query = select(RawBankRow).where(RawBankRow.dataset_version == self.dataset_version)
        if self.split in ["tuning", "holdout"]:
            bank_query = bank_query.where(RawBankRow.dataset_split == self.split)

        bank_rows = session.exec(bank_query).all()
        for row in bank_rows:
            canon_id = str(uuid.uuid4())
            utr, batch_id = extract_utr_and_batch_from_narration(row.narration)
            normalized_ref = normalize_ref_string(batch_id or utr or row.bank_txn_id)
            payload = {
                "source": "bank",
                "raw_id": row.id,
                "bank_txn_id": row.bank_txn_id,
                "value_date": row.value_date,
                "credit_amount_paise": row.credit_amount_paise,
                "narration": row.narration,
                "extracted_utr": utr,
                "extracted_batch_id": batch_id,
            }
            c_row = CanonicalTransaction(
                id=canon_id,
                dataset_version=self.dataset_version,
                source="bank",
                source_row_id=row.id or 0,
                normalized_ref=normalized_ref,
                amount_paise=row.credit_amount_paise,
                event_date=row.value_date,
                batch_id=batch_id or None,
                raw_payload_json=json.dumps(payload),
                dataset_split=row.dataset_split,
            )
            canonical_records.append(c_row)

        # Persist canonical rows
        session.add_all(canonical_records)

        # Ingestion audit log
        audit_log = AuditLog(
            run_id=self.run_id,
            tier="ingestion",
            action="ingested",
            confidence=1.0,
            reason=f"Ingested {len(ledger_rows)} ledger, {len(settlement_rows)} settlement, and {len(bank_rows)} bank records into {len(canonical_records)} canonical rows for split '{self.split}'",
        )
        session.add(audit_log)
        session.commit()

        return canonical_records
