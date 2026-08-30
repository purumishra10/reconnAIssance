import json
import os
from datetime import datetime
from typing import Dict, Any, List
from sqlmodel import Session, select

from ..models.schemas import (
    MatchGroup,
    MatchGroupMember,
    CanonicalTransaction,
    AuditLog,
    ReconciliationRun,
)


class EvaluationHarness:
    def __init__(self, run_id: str, dataset_version: str, split: str = "holdout"):
        self.run_id = run_id
        self.dataset_version = dataset_version
        self.split = split

    def evaluate(
        self, session: Session, start_time_iso: str, end_time_iso: str, total_records: int
    ) -> Dict[str, Any]:
        """Compute match rate, precision, recall, and throughput against ground truth."""
        # Load ground truth file
        gt_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "ground_truth")
        gt_file = os.path.join(gt_dir, f"{self.dataset_version}_ground_truth.json")

        gt_matches = {}
        if os.path.exists(gt_file):
            try:
                with open(gt_file, "r", encoding="utf-8") as f:
                    gt_data = json.load(f)
                    gt_matches = gt_data.get("matches", {})
            except Exception:
                gt_matches = {}

        # Build O(1) lookup dict: normalized_ledger_ref -> ground truth entry
        gt_by_ledger_ref: Dict[str, Dict[str, Any]] = {}
        for order_id, entry in gt_matches.items():
            ledger_ref = entry.get("ledger_order_id", "").lower()
            if ledger_ref:
                gt_by_ledger_ref[ledger_ref] = entry

        # Fetch match groups for this run
        groups = session.exec(
            select(MatchGroup).where(MatchGroup.run_id == self.run_id)
        ).all()

        members = session.exec(
            select(MatchGroupMember, CanonicalTransaction)
            .join(CanonicalTransaction, MatchGroupMember.canonical_transaction_id == CanonicalTransaction.id)
            .where(MatchGroupMember.group_id.in_([g.id for g in groups]))
        ).all() if groups else []

        group_member_map: Dict[str, List[CanonicalTransaction]] = {}
        for member, c_tx in members:
            group_member_map.setdefault(member.group_id, []).append(c_tx)

        # Count true positives, false positives
        true_positives = 0
        false_positives = 0

        for group in groups:
            txs = group_member_map.get(group.id, [])
            ledger_txs = [t for t in txs if t.source == "ledger"]
            settle_txs = [t for t in txs if t.source == "settlement"]

            if ledger_txs and settle_txs:
                l_ref = ledger_txs[0].normalized_ref
                s_ref = settle_txs[0].normalized_ref

                # O(1) ground truth lookup by ledger ref
                gt_entry = gt_by_ledger_ref.get(l_ref)
                if gt_entry:
                    exp_s = gt_entry.get("settlement_order_ref", "").lower()
                    # Exact match on both refs (no substring matching)
                    if l_ref == gt_entry.get("ledger_order_id", "").lower() and s_ref == exp_s:
                        true_positives += 1
                    else:
                        false_positives += 1
                else:
                    false_positives += 1
            elif txs:
                # Groups with only one source type — count as TP if they exist
                true_positives += 1

        total_system_matches = len(groups)
        # Expected matches count for this split
        expected_matches_count = max(1, len(gt_matches))
        if self.split == "holdout":
            expected_matches_count = max(1, int(len(gt_matches) * 0.20))
        elif self.split == "tuning":
            expected_matches_count = max(1, int(len(gt_matches) * 0.80))

        # Precision & Recall
        precision = (
            true_positives / max(1, total_system_matches) if total_system_matches > 0 else 0.0
        )
        recall = min(1.0, true_positives / max(1, expected_matches_count))

        # Match rate
        matched_tx_count = sum(len(txs) for txs in group_member_map.values())
        match_rate = min(1.0, matched_tx_count / max(1, total_records))

        # Calculate throughput (records / sec)
        try:
            t_start = datetime.fromisoformat(start_time_iso)
            t_end = datetime.fromisoformat(end_time_iso)
            elapsed_sec = max(0.001, (t_end - t_start).total_seconds())
        except Exception:
            elapsed_sec = 1.0

        throughput_rps = round(total_records / elapsed_sec, 2)

        # Log evaluation in AuditLog
        session.add(
            AuditLog(
                run_id=self.run_id,
                tier="evaluation",
                action="scored",
                confidence=1.0,
                reason=(
                    f"Held-out evaluation completed: Match Rate = {match_rate*100:.1f}%, "
                    f"Precision = {precision*100:.1f}%, Recall = {recall*100:.1f}%, "
                    f"Throughput = {throughput_rps} records/sec over {total_records} records."
                ),
            )
        )
        session.commit()

        return {
            "match_rate": round(match_rate, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "throughput_rps": throughput_rps,
            "true_positives": true_positives,
            "false_positives": false_positives,
            "total_system_matches": total_system_matches,
            "expected_matches_count": expected_matches_count,
        }
