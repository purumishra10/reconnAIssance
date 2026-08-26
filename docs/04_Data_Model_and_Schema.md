# RAZORPAY HACKATHON — TRACK 04 · AI FINANCE CONTROLLER

### reconnAIssance

Data model & schema design

This schema is written in portable SQL types so it works unmodified in SQLite (per ADR-004) and migrates cleanly to Postgres later. Money fields are stored as integer paise, not floating-point rupees, to avoid rounding bugs in a financial system — this is a deliberate, non-obvious choice explained in §7.

> [!NOTE]
> **Learning Note**: storing money as an integer count of the smallest unit (paise, or cents in USD) instead of a decimal rupee amount is standard practice in financial software, because binary floating-point cannot represent most decimal fractions exactly — repeatedly adding ₹0.10 in float arithmetic eventually produces tiny errors that compound into real discrepancies.

## 1. Entity overview

Three raw source tables capture data exactly as each system would export it. A canonical_transaction table normalizes all three into one shape the matching engine works against. match_group and match_group_member represent the outcome of matching (including many-to-one and one-to-many cases from bundled/split settlements). exception captures rows that could not be resolved. audit_log captures every decision. reconciliation_run tracks each end-to-end run and its scored metrics.

## 2. Raw source tables

#### raw_ledger_row — the merchant's internal sales ledger

| Field | Type | Description |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment row id. |
| order_id | TEXT | Merchant-generated order reference, e.g. ORD-10293. ~5% of rows carry an injected typo/case variant per ADR-002. |
| order_date | DATE | Date the order was placed / captured in the merchant's system. |
| amount_paise | INTEGER | Gross order amount the customer paid, in paise. |
| payment_method | TEXT | card / upi / netbanking / wallet. |
| status | TEXT | captured / refunded / partially_refunded. |
| dataset_split | TEXT | tuning / holdout — set once at generation time, never changed. |

#### raw_settlement_row — Razorpay settlement report

| Field | Type | Description |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment row id. |
| settlement_batch_id | TEXT | Batch this row was paid out in, e.g. STL-2291. Many orders can share one batch id (bundled settlement). |
| utr | TEXT | Unique Transaction Reference for the bank credit this settlement rides on. |
| order_ref | TEXT | Razorpay's copy of the order/payment reference — should map back to raw_ledger_row.order_id, subject to the same typo noise. |
| gross_amount_paise | INTEGER | Amount before fee deduction. |
| fee_amount_paise | INTEGER | Razorpay commission (modeled at 2% of gross). |
| gst_on_fee_paise | INTEGER | GST charged on the fee itself (modeled at 18% of fee_amount_paise), per real Razorpay-style settlement statements. |
| net_amount_paise | INTEGER | gross_amount_paise − fee_amount_paise − gst_on_fee_paise. What actually gets paid out. |
| settlement_date | DATE | Date this batch was settled — order_date + 2 days under the T+2 assumption in the requirements doc. |
| dataset_split | TEXT | tuning / holdout. |

#### raw_bank_row — the merchant's bank statement

| Field | Type | Description |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment row id. |
| bank_txn_id | TEXT | Bank's own transaction id for this credit line. |
| value_date | DATE | Date the credit appeared in the account. |
| credit_amount_paise | INTEGER | Amount credited — should equal the sum of net_amount_paise for all settlement rows in the matching batch. |
| narration | TEXT | Free-text bank description, usually containing a partial or reformatted UTR — the messiest field, deliberately. |
| dataset_split | TEXT | tuning / holdout. |

## 3. Canonical transaction table

Every raw row, from any of the three sources, is normalized into this shared shape before matching begins. This is what the matching engine actually operates on — it never touches the raw tables directly.

| Field | Type | Description |
| --- | --- | --- |
| id | TEXT PK (UUID) | Canonical id, stable across the whole pipeline. |
| source | TEXT | ledger / settlement / bank. |
| source_row_id | INTEGER | FK back to the originating raw_*_row.id, for traceability. |
| normalized_ref | TEXT | Cleaned/normalized reference id (case-folded, whitespace-trimmed) used as the Tier 1 exact-match key. |
| amount_paise | INTEGER | The relevant amount for this source (gross for ledger, net for settlement, credit for bank). |
| event_date | DATE | The relevant date for this source. |
| batch_id | TEXT, nullable | Settlement batch id, if applicable — links bundled/split cases together. |
| raw_payload_json | TEXT (JSON) | The full original row, kept for audit/display so nothing is lost in normalization. |
| dataset_split | TEXT | Copied through from the raw row — never recomputed. |

## 4. Matching outcome tables

#### match_group — one real-world settlement event

A group, not a pair, because bundled settlements are many ledger rows to one bank credit, and split settlements are one ledger row to multiple settlement rows. A simple pairwise match_result table cannot represent this correctly, which is why the schema uses groups.

| Field | Type | Description |
| --- | --- | --- |
| id | TEXT PK (UUID) | Group id. |
| run_id | TEXT FK | Which reconciliation_run produced this group. |
| tier | TEXT | exact / fuzzy / ai_assisted — the highest tier needed to close this group. |
| confidence | REAL (0–1) | Match confidence. 1.0 for exact; a computed score for fuzzy; the LLM-returned score for ai_assisted. |
| reason | TEXT | Human-readable explanation of why these rows were grouped together. |
| created_at | TIMESTAMP | When this group was formed. |

#### match_group_member — links canonical rows into a group

| Field | Type | Description |
| --- | --- | --- |
| group_id | TEXT FK | References match_group.id. |
| canonical_transaction_id | TEXT FK | References canonical_transaction.id. |
| role | TEXT | ledger_entry / settlement_entry / bank_entry — which side of the three-way match this row represents. |

#### exception — rows that could not be resolved

| Field | Type | Description |
| --- | --- | --- |
| id | TEXT PK (UUID) | Exception id. |
| run_id | TEXT FK | Which run produced this exception. |
| canonical_transaction_id | TEXT FK | The unresolved row. |
| reason_code | TEXT | Machine-readable category, e.g. NO_COUNTERPART_FOUND, AMOUNT_MISMATCH, DUPLICATE_SUSPECTED, AI_TIER_UNAVAILABLE. |
| reason_text | TEXT | Human-readable explanation, shown directly in the dashboard. |
| unresolved_after_tier | TEXT | Which tier gave up on this row last. |

## 5. Audit and evaluation tables

#### audit_log — one row per decision, of any kind

| Field | Type | Description |
| --- | --- | --- |
| id | INTEGER PK | Auto-increment. |
| run_id | TEXT FK | Which run this decision belongs to. |
| canonical_transaction_id | TEXT FK, nullable | The row this decision concerns, if applicable. |
| tier | TEXT | exact / fuzzy / ai_assisted / evaluation. |
| action | TEXT | matched / rejected / flagged_exception / scored. |
| confidence | REAL, nullable | Confidence at the moment of this decision. |
| reason | TEXT | Why this decision was made — this is the field the dashboard and Q&A agent surface directly. |
| raw_llm_response_json | TEXT (JSON), nullable | Full LLM response for ai_assisted decisions, kept for debugging and trust — never shown raw in the UI, but retrievable. |
| created_at | TIMESTAMP | When this decision was logged. |

#### reconciliation_run — one row per end-to-end run

| Field | Type | Description |
| --- | --- | --- |
| id | TEXT PK (UUID) | Run id. |
| dataset_version | TEXT | Which generated dataset (seed/version) this run used. |
| started_at / completed_at | TIMESTAMP | For computing throughput. |
| record_count | INTEGER | Total canonical rows processed. |
| match_rate | REAL | Matched rows ÷ total rows, on the held-out split only. |
| precision | REAL | Of the matches the system made, the fraction that were correct against ground truth. |
| recall | REAL | Of the true matches that exist, the fraction the system found. |
| throughput_rps | REAL | record_count ÷ (completed_at − started_at), in records per second. |
| status | TEXT | running / completed / failed. |

#### qa_session / qa_message (stretch goal support)

Only needed if the Settlement Q&A agent ships. A minimal two-table structure: qa_session(id, run_id, started_at) and qa_message(id, session_id, role, content, cited_audit_log_ids_json, created_at) — enough to show a running conversation and which audit log entries backed each answer.

## 6. Relationships summary

- raw_ledger_row / raw_settlement_row / raw_bank_row → canonical_transaction: one-to-one, via source_row_id.
- canonical_transaction → match_group: many-to-many, through match_group_member (this is what allows bundled and split settlements to be modeled correctly).
- canonical_transaction → exception: one-to-one — a row that never made it into any match_group.
- reconciliation_run → match_group, exception, audit_log: one-to-many — everything produced by a run is scoped to it, so re-running never mixes results across runs.

## 7. Notes on the money-as-integer decision

All amount fields are suffixed _paise and stored as integers (1 rupee = 100 paise). Every fee calculation (2% commission, 18% GST on the fee) is done in integer paise with explicit rounding rules decided once and documented in the matching engine code, not left to whatever the language's default float rounding happens to do. The dashboard converts to rupees only at display time.
