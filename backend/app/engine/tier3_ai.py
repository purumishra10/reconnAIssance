import json
import uuid
from typing import List, Tuple, Set, Dict, Optional
from sqlmodel import Session

from ..models.schemas import (
    CanonicalTransaction,
    MatchGroup,
    MatchGroupMember,
    AuditLog,
)
from ..services.llm_client import get_llm_client


class Tier3AIMatcher:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.llm_client = get_llm_client()

    async def match(
        self, session: Session, records: List[CanonicalTransaction]
    ) -> Tuple[List[MatchGroup], List[CanonicalTransaction]]:
        """Run Tier 3 AI-assisted contextual matching on remaining ambiguous rows."""
        ledger_records = [r for r in records if r.source == "ledger"]
        settlement_records = [r for r in records if r.source == "settlement"]
        bank_records = [r for r in records if r.source == "bank"]

        if not ledger_records or not settlement_records:
            return [], records

        matched_canonical_ids: Set[str] = set()
        match_groups: List[MatchGroup] = []
        members: List[MatchGroupMember] = []
        audit_logs: List[AuditLog] = []

        # Prepare candidate pairs for AI evaluation (group up to 10 at a time)
        candidate_pairs: List[Dict] = []
        pair_mappings: List[Tuple[CanonicalTransaction, CanonicalTransaction]] = []

        for l in ledger_records:
            if l.id in matched_canonical_ids:
                continue

            # Find closest candidate in settlement records
            for s in settlement_records:
                if s.id in matched_canonical_ids:
                    continue

                # Add as candidate pair for AI inspection
                try:
                    payload_a = json.loads(l.raw_payload_json)
                except Exception:
                    payload_a = {"ref": l.normalized_ref, "amount_paise": l.amount_paise, "date": l.event_date}

                try:
                    payload_b = json.loads(s.raw_payload_json)
                except Exception:
                    payload_b = {"ref": s.normalized_ref, "amount_paise": s.amount_paise, "date": s.event_date}

                candidate_pairs.append({
                    "item_a": payload_a,
                    "item_b": payload_b,
                })
                pair_mappings.append((l, s))
                # Only take 1 best candidate per ledger row for Tier 3 to keep token usage small
                break

        if not candidate_pairs:
            return [], records

        # Evaluate candidate pairs with LLM client in batches of 5
        batch_size = 5
        for i in range(0, len(candidate_pairs), batch_size):
            batch_pairs = candidate_pairs[i : i + batch_size]
            batch_mappings = pair_mappings[i : i + batch_size]

            try:
                decisions = await self.llm_client.match_candidates(batch_pairs)
            except Exception as e:
                decisions = [{"match": False, "confidence": 0.0, "reason": f"AI evaluation failed: {e}"}] * len(batch_pairs)

            for decision, (l, s) in zip(decisions, batch_mappings):
                if l.id in matched_canonical_ids or s.id in matched_canonical_ids:
                    continue

                if decision.get("match", False):
                    group_id = str(uuid.uuid4())
                    matched_canonical_ids.add(l.id)
                    matched_canonical_ids.add(s.id)

                    conf = float(decision.get("confidence", 0.80))
                    reason = decision.get("reason", "AI-assisted reconciliation match verified.")

                    group = MatchGroup(
                        id=group_id,
                        run_id=self.run_id,
                        tier="ai_assisted",
                        confidence=conf,
                        reason=f"Tier 3 AI Match: {reason}",
                    )
                    match_groups.append(group)

                    m_ledger = MatchGroupMember(
                        group_id=group_id,
                        canonical_transaction_id=l.id,
                        role="ledger_entry",
                    )
                    m_settle = MatchGroupMember(
                        group_id=group_id,
                        canonical_transaction_id=s.id,
                        role="settlement_entry",
                    )
                    members.extend([m_ledger, m_settle])

                    # Check Bank statement entry
                    for b in bank_records:
                        if b.id not in matched_canonical_ids and s.batch_id:
                            if (b.batch_id and b.batch_id.lower() == s.batch_id.lower()) or (
                                b.normalized_ref and s.batch_id.lower() in b.normalized_ref.lower()
                            ):
                                m_bank = MatchGroupMember(
                                    group_id=group_id,
                                    canonical_transaction_id=b.id,
                                    role="bank_entry",
                                )
                                members.append(m_bank)
                                matched_canonical_ids.add(b.id)
                                break

                    audit_logs.append(
                        AuditLog(
                            run_id=self.run_id,
                            canonical_transaction_id=l.id,
                            group_id=group_id,
                            tier="ai_assisted",
                            action="matched",
                            confidence=conf,
                            reason=reason,
                            raw_llm_response_json=json.dumps(decision),
                        )
                    )
                else:
                    # Log rejection in audit log
                    audit_logs.append(
                        AuditLog(
                            run_id=self.run_id,
                            canonical_transaction_id=l.id,
                            tier="ai_assisted",
                            action="rejected",
                            confidence=float(decision.get("confidence", 0.20)),
                            reason=decision.get("reason", "AI rejected match."),
                            raw_llm_response_json=json.dumps(decision),
                        )
                    )

        # Persist AI tier matches and audit log
        session.add_all(match_groups)
        session.add_all(members)
        session.add_all(audit_logs)
        session.commit()

        unmatched = [r for r in records if r.id not in matched_canonical_ids]
        return match_groups, unmatched
