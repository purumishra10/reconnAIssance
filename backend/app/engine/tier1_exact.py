import uuid
from typing import List, Tuple, Set, Dict
from sqlmodel import Session

from ..models.schemas import (
    CanonicalTransaction,
    MatchGroup,
    MatchGroupMember,
    AuditLog,
)


class Tier1ExactMatcher:
    def __init__(self, run_id: str):
        self.run_id = run_id

    def match(
        self, session: Session, records: List[CanonicalTransaction]
    ) -> Tuple[List[MatchGroup], List[CanonicalTransaction]]:
        """Run Tier 1 deterministic exact matching on normalized reference IDs."""
        ledger_records = [r for r in records if r.source == "ledger"]
        settlement_records = [r for r in records if r.source == "settlement"]
        bank_records = [r for r in records if r.source == "bank"]

        # Map settlement batch IDs and normalized refs
        settlement_by_ref: Dict[str, List[CanonicalTransaction]] = {}
        for s in settlement_records:
            settlement_by_ref.setdefault(s.normalized_ref, []).append(s)

        bank_by_batch: Dict[str, CanonicalTransaction] = {}
        for b in bank_records:
            if b.batch_id:
                bank_by_batch[b.batch_id.lower()] = b
            elif b.normalized_ref:
                bank_by_batch[b.normalized_ref.lower()] = b

        matched_canonical_ids: Set[str] = set()
        match_groups: List[MatchGroup] = []
        members: List[MatchGroupMember] = []
        audit_logs: List[AuditLog] = []

        # 1. Pair Ledger <-> Settlement on exact normalized_ref
        for l in ledger_records:
            if l.id in matched_canonical_ids:
                continue

            candidates = settlement_by_ref.get(l.normalized_ref, [])
            # Find an unconsumed candidate
            valid_s = None
            for s in candidates:
                if s.id not in matched_canonical_ids:
                    valid_s = s
                    break

            if valid_s:
                group_id = str(uuid.uuid4())
                matched_canonical_ids.add(l.id)
                matched_canonical_ids.add(valid_s.id)

                group = MatchGroup(
                    id=group_id,
                    run_id=self.run_id,
                    tier="exact",
                    confidence=1.0,
                    reason=f"Tier 1 Exact Match on normalized reference key '{l.normalized_ref}'",
                )
                match_groups.append(group)

                m_ledger = MatchGroupMember(
                    group_id=group_id,
                    canonical_transaction_id=l.id,
                    role="ledger_entry",
                )
                m_settle = MatchGroupMember(
                    group_id=group_id,
                    canonical_transaction_id=valid_s.id,
                    role="settlement_entry",
                )
                members.extend([m_ledger, m_settle])

                # Check if corresponding Bank statement entry exists for this batch
                if valid_s.batch_id and valid_s.batch_id.lower() in bank_by_batch:
                    bank_entry = bank_by_batch[valid_s.batch_id.lower()]
                    m_bank = MatchGroupMember(
                        group_id=group_id,
                        canonical_transaction_id=bank_entry.id,
                        role="bank_entry",
                    )
                    members.append(m_bank)
                    matched_canonical_ids.add(bank_entry.id)

                audit_logs.append(
                    AuditLog(
                        run_id=self.run_id,
                        canonical_transaction_id=l.id,
                        group_id=group_id,
                        tier="exact",
                        action="matched",
                        confidence=1.0,
                        reason=f"Exact 1:1 key match resolved for order '{l.normalized_ref}' with settlement '{valid_s.normalized_ref}'",
                    )
                )

        # Persist matches
        session.add_all(match_groups)
        session.add_all(members)
        session.add_all(audit_logs)
        session.commit()

        unmatched = [r for r in records if r.id not in matched_canonical_ids]
        return match_groups, unmatched
