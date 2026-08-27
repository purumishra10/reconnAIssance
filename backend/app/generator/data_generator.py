import json
import os
import random
import uuid
from datetime import date, timedelta
from typing import Dict, Any, List, Tuple
from sqlmodel import Session, select, delete

from ..models.schemas import RawLedgerRow, RawSettlementRow, RawBankRow
from .noise_injector import (
    inject_ref_typo,
    inject_amount_drift,
    inject_date_drift,
    generate_messy_narration,
)


class SyntheticDataGenerator:
    def __init__(
        self,
        seed: int = 42,
        record_count: int = 2000,
        split_ratio: float = 0.8,
    ):
        self.seed = seed
        self.record_count = record_count
        self.split_ratio = split_ratio
        self.rng = random.Random(seed)
        self.dataset_version = f"ds_{record_count}_seed{seed}"
        self.base_date = date(2026, 8, 1)

    def generate(self, session: Session) -> Dict[str, Any]:
        """Generate synthetic ledger, settlement, and bank datasets with injected noise and ground truth."""
        # 1. Clean existing records for this version if re-generating
        session.exec(
            delete(RawLedgerRow).where(RawLedgerRow.dataset_version == self.dataset_version)
        )
        session.exec(
            delete(RawSettlementRow).where(
                RawSettlementRow.dataset_version == self.dataset_version
            )
        )
        session.exec(
            delete(RawBankRow).where(RawBankRow.dataset_version == self.dataset_version)
        )
        session.commit()

        ledger_rows: List[RawLedgerRow] = []
        settlement_rows: List[RawSettlementRow] = []
        bank_rows: List[RawBankRow] = []

        # Ground truth structures
        # Map: order_id -> {expected_settlement_ids: [], expected_bank_ids: [], is_noise: bool, noise_types: []}
        ground_truth: Dict[str, Any] = {
            "dataset_version": self.dataset_version,
            "seed": self.seed,
            "record_count": self.record_count,
            "matches": {},  # order_id -> {"settlement_refs": [], "batch_id": ..., "status": ...}
            "missing_in_settlement": [],
            "missing_in_ledger": [],
            "duplicates": [],
            "split_settlements": [],
        }

        # Determine batch count and batch sizing (~15-25 transactions per settlement batch)
        batch_counter = 1001
        current_batch_id = f"STL-{batch_counter}"
        current_utr = f"UTR2608{batch_counter:04d}RZP"
        current_batch_orders = 0
        batch_target_size = self.rng.randint(15, 25)

        batches: Dict[str, Dict[str, Any]] = {
            current_batch_id: {
                "utr": current_utr,
                "net_total_paise": 0,
                "settlement_date": None,
                "split": "tuning",
            }
        }

        # 2. Generate Base Orders and Settlements
        for i in range(1, self.record_count + 1):
            order_id = f"ORD-{10000 + i}"
            day_offset = self.rng.randint(0, 25)
            order_date = self.base_date + timedelta(days=day_offset)
            order_date_str = order_date.isoformat()

            # Assign dataset split (tuning vs holdout)
            dataset_split = "tuning" if self.rng.random() < self.split_ratio else "holdout"

            # Realistic e-commerce amount in paise (₹200 to ₹25,000, median ~₹1,800)
            # Log-normal distribution
            raw_amount_rupees = self.rng.lognormvariate(mu=7.2, sigma=0.8)
            raw_amount_rupees = max(199.0, min(raw_amount_rupees, 25000.0))
            amount_paise = int(round(raw_amount_rupees)) * 100

            # Payment method breakdown: UPI (45%), Card (30%), Netbanking (15%), Wallet (10%)
            pm_roll = self.rng.random()
            if pm_roll < 0.45:
                payment_method = "upi"
            elif pm_roll < 0.75:
                payment_method = "card"
            elif pm_roll < 0.90:
                payment_method = "netbanking"
            else:
                payment_method = "wallet"

            # Status breakdown: captured (92%), partially_refunded (5%), refunded (3%)
            status_roll = self.rng.random()
            is_partial_refund = False
            refund_amount_paise = 0
            if status_roll < 0.92:
                status = "captured"
            elif status_roll < 0.97:
                status = "partially_refunded"
                is_partial_refund = True
                refund_fraction = self.rng.uniform(0.1, 0.5)
                refund_amount_paise = int(round(amount_paise * refund_fraction))
            else:
                status = "refunded"

            # Calculate Razorpay fees: 2% commission + 18% GST on fee
            gross_amount_paise = amount_paise
            fee_amount_paise = int(round(gross_amount_paise * 0.02))
            gst_on_fee_paise = int(round(fee_amount_paise * 0.18))
            effective_net_paise = (
                gross_amount_paise - fee_amount_paise - gst_on_fee_paise - refund_amount_paise
            )

            # T+2 Settlement Date
            settlement_date = order_date + timedelta(days=2)
            settlement_date_str = settlement_date.isoformat()

            # Manage Batch Assignment
            current_batch_orders += 1
            if current_batch_orders > batch_target_size:
                batch_counter += 1
                current_batch_id = f"STL-{batch_counter}"
                current_utr = f"UTR2608{batch_counter:04d}RZP"
                current_batch_orders = 1
                batch_target_size = self.rng.randint(15, 25)
                batches[current_batch_id] = {
                    "utr": current_utr,
                    "net_total_paise": 0,
                    "settlement_date": settlement_date_str,
                    "split": dataset_split,
                }

            if batches[current_batch_id]["settlement_date"] is None:
                batches[current_batch_id]["settlement_date"] = settlement_date_str

            # Create Ledger Row
            ledger_order_id = order_id
            # 5% chance of typo in ledger order_id
            if self.rng.random() < 0.05:
                ledger_order_id = inject_ref_typo(order_id, self.rng)

            l_row = RawLedgerRow(
                dataset_version=self.dataset_version,
                order_id=ledger_order_id,
                order_date=order_date_str,
                amount_paise=amount_paise,
                payment_method=payment_method,
                status=status,
                dataset_split=dataset_split,
            )
            ledger_rows.append(l_row)

            # 3% chance of missing in settlement
            if self.rng.random() < 0.03:
                ground_truth["missing_in_settlement"].append(order_id)
                continue  # Skip settlement creation

            # Settlement Order Reference
            settlement_order_ref = order_id
            if self.rng.random() < 0.05:
                settlement_order_ref = inject_ref_typo(order_id, self.rng)

            # 2% chance of Split Settlement (one order split across 2 settlement batches)
            if self.rng.random() < 0.02 and effective_net_paise > 1000:
                split_half_1 = effective_net_paise // 2
                split_half_2 = effective_net_paise - split_half_1

                s_row_1 = RawSettlementRow(
                    dataset_version=self.dataset_version,
                    settlement_batch_id=current_batch_id,
                    utr=current_utr,
                    order_ref=settlement_order_ref,
                    gross_amount_paise=gross_amount_paise // 2,
                    fee_amount_paise=fee_amount_paise // 2,
                    gst_on_fee_paise=gst_on_fee_paise // 2,
                    net_amount_paise=split_half_1,
                    settlement_date=settlement_date_str,
                    dataset_split=dataset_split,
                )
                batches[current_batch_id]["net_total_paise"] += split_half_1
                settlement_rows.append(s_row_1)

                # Next batch
                next_batch_id = f"STL-{batch_counter + 1}"
                if next_batch_id not in batches:
                    batches[next_batch_id] = {
                        "utr": f"UTR2608{batch_counter + 1:04d}RZP",
                        "net_total_paise": 0,
                        "settlement_date": (settlement_date + timedelta(days=1)).isoformat(),
                        "split": dataset_split,
                    }
                s_row_2 = RawSettlementRow(
                    dataset_version=self.dataset_version,
                    settlement_batch_id=next_batch_id,
                    utr=batches[next_batch_id]["utr"],
                    order_ref=settlement_order_ref,
                    gross_amount_paise=gross_amount_paise - (gross_amount_paise // 2),
                    fee_amount_paise=fee_amount_paise - (fee_amount_paise // 2),
                    gst_on_fee_paise=gst_on_fee_paise - (gst_on_fee_paise // 2),
                    net_amount_paise=split_half_2,
                    settlement_date=(settlement_date + timedelta(days=1)).isoformat(),
                    dataset_split=dataset_split,
                )
                batches[next_batch_id]["net_total_paise"] += split_half_2
                settlement_rows.append(s_row_2)
                ground_truth["split_settlements"].append(order_id)
                continue

            # Standard Settlement Row
            net_paise_final = effective_net_paise
            # 3% chance of 1-5 paise rounding drift
            if self.rng.random() < 0.03:
                net_paise_final = inject_amount_drift(net_paise_final, self.rng)

            s_row = RawSettlementRow(
                dataset_version=self.dataset_version,
                settlement_batch_id=current_batch_id,
                utr=current_utr,
                order_ref=settlement_order_ref,
                gross_amount_paise=gross_amount_paise,
                fee_amount_paise=fee_amount_paise,
                gst_on_fee_paise=gst_on_fee_paise,
                net_amount_paise=net_paise_final,
                settlement_date=settlement_date_str,
                dataset_split=dataset_split,
            )
            settlement_rows.append(s_row)
            batches[current_batch_id]["net_total_paise"] += net_paise_final

            # Record match in ground truth
            ground_truth["matches"][order_id] = {
                "ledger_order_id": ledger_order_id,
                "settlement_order_ref": settlement_order_ref,
                "batch_id": current_batch_id,
                "utr": current_utr,
                "split": dataset_split,
            }

        # 3. Add 1% missing rows in ledger (unsolicited settlement credits)
        missing_ledger_count = max(2, int(self.record_count * 0.01))
        for j in range(missing_ledger_count):
            extra_order_ref = f"ORD-EXTRA-{9000 + j}"
            extra_gross = self.rng.randint(50000, 300000)
            extra_fee = int(round(extra_gross * 0.02))
            extra_gst = int(round(extra_fee * 0.18))
            extra_net = extra_gross - extra_fee - extra_gst
            extra_split = "tuning" if self.rng.random() < self.split_ratio else "holdout"

            s_extra = RawSettlementRow(
                dataset_version=self.dataset_version,
                settlement_batch_id=current_batch_id,
                utr=current_utr,
                order_ref=extra_order_ref,
                gross_amount_paise=extra_gross,
                fee_amount_paise=extra_fee,
                gst_on_fee_paise=extra_gst,
                net_amount_paise=extra_net,
                settlement_date=(self.base_date + timedelta(days=20)).isoformat(),
                dataset_split=extra_split,
            )
            settlement_rows.append(s_extra)
            batches[current_batch_id]["net_total_paise"] += extra_net
            ground_truth["missing_in_ledger"].append(extra_order_ref)

        # 4. Add 2% duplicate rows in ledger
        duplicate_count = max(2, int(self.record_count * 0.02))
        for _ in range(duplicate_count):
            if ledger_rows:
                source_row = self.rng.choice(ledger_rows)
                dup_row = RawLedgerRow(
                    dataset_version=self.dataset_version,
                    order_id=source_row.order_id,
                    order_date=source_row.order_date,
                    amount_paise=source_row.amount_paise,
                    payment_method=source_row.payment_method,
                    status=source_row.status,
                    dataset_split=source_row.dataset_split,
                )
                ledger_rows.append(dup_row)
                ground_truth["duplicates"].append(source_row.order_id)

        # 5. Generate Bank Statement Rows from Settlement Batches
        bank_txn_counter = 1
        for batch_id, batch_data in batches.items():
            if batch_data["net_total_paise"] <= 0:
                continue

            bank_txn_id = f"TXN-BNK-{100000 + bank_txn_counter}"
            bank_txn_counter += 1

            value_date = batch_data["settlement_date"] or (self.base_date + timedelta(days=2)).isoformat()
            # 5% date drift in bank statement
            if self.rng.random() < 0.05:
                value_date = inject_date_drift(value_date, self.rng, max_days=1)

            # Bank narration
            narration = generate_messy_narration(batch_data["utr"], batch_id, self.rng)

            credit_amount = batch_data["net_total_paise"]
            # 3% chance of minor rounding drift on bank line
            if self.rng.random() < 0.03:
                credit_amount = inject_amount_drift(credit_amount, self.rng)

            b_row = RawBankRow(
                dataset_version=self.dataset_version,
                bank_txn_id=bank_txn_id,
                value_date=value_date,
                credit_amount_paise=credit_amount,
                narration=narration,
                dataset_split=batch_data["split"],
            )
            bank_rows.append(b_row)

        # 6. Save all generated rows into database
        session.add_all(ledger_rows)
        session.add_all(settlement_rows)
        session.add_all(bank_rows)
        session.commit()

        # 7. Persist ground truth JSON file for evaluation harness
        gt_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data", "ground_truth")
        os.makedirs(gt_dir, exist_ok=True)
        gt_path = os.path.join(gt_dir, f"{self.dataset_version}_ground_truth.json")
        with open(gt_path, "w", encoding="utf-8") as f:
            json.dump(ground_truth, f, indent=2)

        tuning_ledger = sum(1 for r in ledger_rows if r.dataset_split == "tuning")
        holdout_ledger = sum(1 for r in ledger_rows if r.dataset_split == "holdout")

        return {
            "dataset_version": self.dataset_version,
            "seed": self.seed,
            "record_count": len(ledger_rows),
            "tuning_count": tuning_ledger,
            "holdout_count": holdout_ledger,
            "ledger_count": len(ledger_rows),
            "settlement_count": len(settlement_rows),
            "bank_count": len(bank_rows),
            "batches_count": len(batches),
            "ground_truth_path": gt_path,
        }
