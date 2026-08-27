import uuid
from datetime import date
from typing import List, Tuple, Set, Dict, Optional
from rapidfuzz import fuzz
from sqlmodel import Session

from ..core.config import settings
from ..models.schemas import (
    CanonicalTransaction,
    MatchGroup,
    MatchGroupMember,
    AuditLog,
)


def compute_date_diff(d1_str: str, d2_str: str) -> int:
    """Calculate absolute difference in days between two ISO date strings."""
    try:
        dt1 = date.fromisoformat(d1_str[:10])
        dt2 = date.fromisoformat(d2_str[:10])
        return abs((dt1 - dt2).days)
    except Exception:
        return 999


def compute_fee_aware_amount_score(gross_paise: int, net_paise: int) -> Tuple[float, float]:
    """
    Calculate expected net after standard Razorpay fee (2% commission + 18% GST on fee).
    Returns (amount_score [0..1], percent_deviation [0..1]).
    """
    if gross_paise <= 0 or net_paise <= 0:
        return 0.0, 1.0

    fee = int(round(gross_paise * 0.02))
    gst = int(round(fee * 0.18))
    expected_net = gross_paise - fee - gst

    diff = abs(net_paise - expected_net)
    deviation_pct = diff / max(expected_net, 1)

    # Score falls from 1.0 down to 0 as deviation reaches 5%
    amt_score = max(0.0, 1.0 - (deviation_pct / 0.05))
    return amt_score, deviation_pct


class Tier2FuzzyMatcher:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.ref_threshold = settings.TIER2_REF_SIMILARITY_THRESHOLD
        self.max_date_diff = settings.TIER2_DATE_WINDOW_DAYS
        self.confidence_floor = settings.TIER2_CONFIDENCE_FLOOR

    def match(
        self, session: Session, records: List[CanonicalTransaction]
    ) -> Tuple[List[MatchGroup], List[CanonicalTransaction]]:
        """Run Tier 2 fuzzy & fee-aware matching across unresolved records."""
        ledger_records = [r for r in records if r.source == "ledger"]
        settlement_records = [r for r in records if r.source == "settlement"]
        bank_records = [r for r in records if r.source == "bank"]

        matched_canonical_ids: Set[str] = set()
        match_groups: List[MatchGroup] = []
        members: List[MatchGroupMember] = []
        audit_logs: List[AuditLog] = []

        # Find best candidate for each unmatched ledger row
        for l in ledger_records:
            if l.id in matched_canonical_ids:
                continue

            best_candidate: Optional[CanonicalTransaction] = None
            best_confidence = 0.0
            best_metrics = {}

            for s in settlement_records:
                if s.id in matched_canonical_ids:
                    continue

                # 1. Reference similarity (0.0 to 1.0)
                ref_sim = fuzz.ratio(l.normalized_ref, s.normalized_ref) / 100.0

                # 2. Date difference check
                day_diff = compute_date_diff(l.event_date, s.event_date)
                if day_diff > self.max_date_diff:
                    continue

                # Date score (1.0 for <=2 days, degrading to 0 at max window)
                date_score = max(0.0, 1.0 - (max(0, day_diff - 2) / (self.max_date_diff - 2 + 1e-5)))

                # 3. Amount tolerance check (fee-aware)
                amt_score, dev_pct = compute_fee_aware_amount_score(l.amount_paise, s.amount_paise)

                # Skip if reference is completely unrelated and amount is invalid
                if ref_sim < 0.70 and amt_score < 0.80:
                    continue

                # Composite confidence: 40% Ref similarity, 35% Amount score, 25% Date score
                composite_conf = (0.40 * ref_sim) + (0.35 * amt_score) + (0.25 * date_score)

                if composite_conf > best_confidence:
                    best_confidence = composite_conf
                    best_candidate = s
                    best_metrics = {
                        "ref_sim": ref_sim,
                        "day_diff": day_diff,
                        "dev_pct": dev_pct,
                        "amt_score": amt_score,
                    }

            # If confidence passes floor, create fuzzy match group
            if best_candidate and best_confidence >= self.confidence_floor:
                group_id = str(uuid.uuid4())
                matched_canonical_ids.add(l.id)
                matched_canonical_ids.add(best_candidate.id)

                conf_val = round(best_confidence, 2)
                reason_str = (
                    f"Tier 2 Fuzzy Match: Ref similarity {best_metrics['ref_sim']*100:.0f}%, "
                    f"amount deviation {best_metrics['dev_pct']*100:.1f}% within fee window, "
                    f"date lag {best_metrics['day_diff']} days (confidence {conf_val:.2f})"
                )

                group = MatchGroup(
                    id=group_id,
                    run_id=self.run_id,
                    tier="fuzzy",
                    confidence=conf_val,
                    reason=reason_str,
                )
                match_groups.append(group)

                m_ledger = MatchGroupMember(
                    group_id=group_id,
                    canonical_transaction_id=l.id,
                    role="ledger_entry",
                )
                m_settle = MatchGroupMember(
                    group_id=group_id,
                    canonical_transaction_id=best_candidate.id,
                    role="settlement_entry",
                )
                members.extend([m_ledger, m_settle])

                # Check if Bank statement entry is available
                for b in bank_records:
                    if b.id not in matched_canonical_ids and best_candidate.batch_id:
                        if (
                            b.batch_id and b.batch_id.lower() == best_candidate.batch_id.lower()
                        ) or (b.normalized_ref and best_candidate.batch_id.lower() in b.normalized_ref.lower()):
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
                        tier="fuzzy",
                        action="matched",
                        confidence=conf_val,
                        reason=reason_str,
                    )
                )

        # Persist fuzzy matches
        session.add_all(match_groups)
        session.add_all(members)
        session.add_all(audit_logs)
        session.commit()

        unmatched = [r for r in records if r.id not in matched_canonical_ids]
        return match_groups, unmatched
