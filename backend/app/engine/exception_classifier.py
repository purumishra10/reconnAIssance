import uuid
from typing import List
from sqlmodel import Session

from ..models.schemas import (
    CanonicalTransaction,
    ReconciliationException,
    AuditLog,
)


class ExceptionClassifier:
    def __init__(self, run_id: str):
        self.run_id = run_id

    def classify_and_save(
        self, session: Session, unmatched_records: List[CanonicalTransaction]
    ) -> List[ReconciliationException]:
        """Classify all remaining unmatched records and persist structured exceptions and audit logs."""
        exceptions: List[ReconciliationException] = []
        audit_logs: List[AuditLog] = []

        # Count occurrences of reference IDs to spot duplicates
        ref_counts = {}
        for r in unmatched_records:
            ref_counts[r.normalized_ref] = ref_counts.get(r.normalized_ref, 0) + 1

        for r in unmatched_records:
            exc_id = str(uuid.uuid4())

            # Determine reason code and descriptive text
            if ref_counts.get(r.normalized_ref, 0) > 1:
                reason_code = "DUPLICATE_SUSPECTED"
                reason_text = (
                    f"Duplicate transaction detected: Reference '{r.normalized_ref}' "
                    f"appears multiple times in {r.source} dataset."
                )
            elif r.source == "ledger":
                reason_code = "NO_COUNTERPART_FOUND"
                reason_text = (
                    f"Unresolved Order: Sales ledger record '{r.normalized_ref}' for ₹{r.amount_paise/100:.2f} "
                    f"has no matching Razorpay settlement report or bank statement credit."
                )
            elif r.source == "settlement":
                reason_code = "AMOUNT_MISMATCH"
                reason_text = (
                    f"Unmatched Settlement: Payout reference '{r.normalized_ref}' for net ₹{r.amount_paise/100:.2f} "
                    f"could not be reconciled against merchant sales ledger entries."
                )
            else:  # bank
                reason_code = "NO_COUNTERPART_FOUND"
                reason_text = (
                    f"Unmatched Bank Credit: Statement entry '{r.normalized_ref}' for ₹{r.amount_paise/100:.2f} "
                    f"has no corresponding settlement batch in Razorpay reports."
                )

            exc = ReconciliationException(
                id=exc_id,
                run_id=self.run_id,
                canonical_transaction_id=r.id,
                reason_code=reason_code,
                reason_text=reason_text,
                unresolved_after_tier="ai_assisted",
            )
            exceptions.append(exc)

            audit_logs.append(
                AuditLog(
                    run_id=self.run_id,
                    canonical_transaction_id=r.id,
                    tier="ai_assisted",
                    action="flagged_exception",
                    confidence=1.0,
                    reason=f"Flagged as exception [{reason_code}]: {reason_text}",
                )
            )

        session.add_all(exceptions)
        session.add_all(audit_logs)
        session.commit()

        return exceptions
