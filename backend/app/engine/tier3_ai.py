import json
import logging
import uuid
from datetime import date
from typing import List, Tuple, Set, Dict, Optional
from rapidfuzz import fuzz
from sqlmodel import Session

from ..models.schemas import (
    CanonicalTransaction,
    MatchGroup,
    MatchGroupMember,
    AuditLog,
)
from ..services.llm_client import get_llm_client

logger = logging.getLogger(__name__)


def _pre_score_candidate(
    ledger: CanonicalTransaction, settlement: CanonicalTransaction
) -> float:
    """Lightweight pre-scorer: date proximity + partial ref overlap + fee-adjusted amount closeness."""
    score = 0.0

    # 1. Reference similarity (0-40 points)
    ref_sim = fuzz.ratio(ledger.normalized_ref, settlement.normalized_ref) / 100.0
    score += ref_sim * 40.0

    # 2. Fee-adjusted amount closeness (0-35 points)
    gross = ledger.amount_paise
    net = settlement.amount_paise
    if gross > 0 and net > 0:
        # Expected net after 2% MDR + 18% GST on fee
        fee = int(round(gross * 0.02))
        gst = int(round(fee * 0.18))
        expected_net = gross - fee - gst
        diff = abs(net - expected_net)
        deviation_pct = diff / max(expected_net, 1)
        amt_score = max(0.0, 1.0 - (deviation_pct / 0.05))
        score += amt_score * 35.0

    # 3. Date proximity (0-25 points) — T+2 is expected
    try:
        d1 = date.fromisoformat(ledger.event_date[:10])
        d2 = date.fromisoformat(settlement.event_date[:10])
        day_diff = abs((d1 - d2).days)
        # Perfect score at <=2 days, degrades to 0 at 7+ days
        date_score = max(0.0, 1.0 - (max(0, day_diff - 2) / 5.0))
        score += date_score * 25.0
    except Exception:
        pass

    return score


class Tier3AIMatcher:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.llm_client = get_llm_client("match")

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

        # Prepare candidate pairs for AI evaluation using pre-scoring
        candidate_pairs: List[Dict] = []
        pair_mappings: List[Tuple[CanonicalTransaction, CanonicalTransaction]] = []

        for l in ledger_records:
            if l.id in matched_canonical_ids:
                continue

            # Pre-score ALL unmatched settlements and pick the best candidate
            scored_candidates: List[Tuple[float, CanonicalTransaction]] = []
            for s in settlement_records:
                if s.id in matched_canonical_ids:
                    continue
                pre_score = _pre_score_candidate(l, s)
                # Only consider candidates with a minimum pre-score threshold
                if pre_score >= 20.0:
                    scored_candidates.append((pre_score, s))

            if not scored_candidates:
                continue

            # Sort by pre-score descending and take the best candidate
            scored_candidates.sort(key=lambda x: x[0], reverse=True)
            best_candidate = scored_candidates[0][1]

            # Build the pair payload for the LLM
            try:
                payload_a = json.loads(l.raw_payload_json)
            except Exception:
                payload_a = {"ref": l.normalized_ref, "amount_paise": l.amount_paise, "date": l.event_date}

            try:
                payload_b = json.loads(best_candidate.raw_payload_json)
            except Exception:
                payload_b = {"ref": best_candidate.normalized_ref, "amount_paise": best_candidate.amount_paise, "date": best_candidate.event_date}

            candidate_pairs.append({
                "item_a": payload_a,
                "item_b": payload_b,
            })
            pair_mappings.append((l, best_candidate))

        if not candidate_pairs:
            return [], records

        # Evaluate candidate pairs with LLM client in batches of 5
        batch_size = 5
        for i in range(0, len(candidate_pairs), batch_size):
            batch_pairs = candidate_pairs[i : i + batch_size]
            batch_mappings = pair_mappings[i : i + batch_size]

            try:
                decisions = await self.llm_client.match_candidates(batch_pairs)
            except Exception:
                logger.exception("Tier 3 AI match_candidates batch failed")
                decisions = [{"match": False, "confidence": 0.0, "reason": "AI evaluation failed"}] * len(batch_pairs)

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
