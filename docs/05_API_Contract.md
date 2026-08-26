# RAZORPAY HACKATHON — TRACK 04 · AI FINANCE CONTROLLER

### reconnAIssance
### API Contract Document

This contract is what lets the dashboard (frontend) and the matching pipeline (backend) be built in parallel, per ADR-005. Freeze this shape before writing deep implementation — the frontend should be buildable against these response shapes using mock data, before the backend logic is finished.

> [!NOTE]
> **Learning Note**: An API contract doc describes the request/response shape of each endpoint independent of how it is implemented — it is a promise between two halves of a team about what data looks like crossing the boundary, so both sides can build against it simultaneously instead of waiting on each other.

**Base URL (local dev):** `http://localhost:8000`  
All request/response bodies are JSON. All money values are returned in paise (see data model doc §7) — the frontend is responsible for formatting to rupees for display.

---

## 1. Dataset Endpoints

### `POST /datasets/generate`
Trigger the synthetic data generator with a given seed and size.

**Request Body:**
```json
{
  "seed": 42,
  "record_count": 2000,
  "split_ratio": 0.8
}
```

**Response (`201 Created`):**
```json
{
  "dataset_version": "ds_2000_seed42",
  "record_count": 2000,
  "tuning_count": 1600,
  "holdout_count": 400
}
```

---

### `GET /datasets/{dataset_version}`
Fetch summary stats for a previously generated dataset.

---

## 2. Reconciliation Run Endpoints

### `POST /reconcile/run`
Start a reconciliation run against a dataset (tuning or holdout split).

**Request Body:**
```json
{
  "dataset_version": "ds_2000_seed42",
  "split": "holdout"
}
```

**Response (`202 Accepted` - run started, async):**
```json
{
  "run_id": "run_8f1a...",
  "status": "running"
}
```

---

### `GET /reconcile/{run_id}/summary`
Poll run status and, once complete, headline metrics.

**Response (`200 OK`):**
```json
{
  "run_id": "run_8f1a...",
  "status": "completed",
  "record_count": 400,
  "match_rate": 0.93,
  "precision": 0.97,
  "recall": 0.91,
  "throughput_rps": 118.4,
  "tier_breakdown": {
    "exact": 312,
    "fuzzy": 58,
    "ai_assisted": 12
  },
  "exception_count": 18
}
```

---

### `GET /reconcile/{run_id}/matches`
Paginated list of match groups for this run.

**Query Parameters:**
`?page=1&page_size=50&tier=fuzzy`

**Response (`200 OK`):**
```json
{
  "page": 1,
  "page_size": 50,
  "total": 370,
  "results": [
    {
      "group_id": "grp_...",
      "tier": "fuzzy",
      "confidence": 0.88,
      "reason": "amount within 2% tolerance, date within 3-day window, ref similarity 0.91",
      "members": [
        { "role": "ledger_entry", "canonical_id": "..." },
        { "role": "settlement_entry", "canonical_id": "..." },
        { "role": "bank_entry", "canonical_id": "..." }
      ]
    }
  ]
}
```

---

### `GET /reconcile/{run_id}/exceptions`
Paginated list of unresolved exceptions for this run.

**Query Parameters:**
`?page=1&page_size=50&reason_code=AMOUNT_MISMATCH`

**Response (`200 OK`):**
```json
{
  "page": 1,
  "page_size": 50,
  "total": 18,
  "results": [
    {
      "exception_id": "exc_...",
      "canonical_transaction_id": "...",
      "reason_code": "AMOUNT_MISMATCH",
      "reason_text": "Ledger shows ₹4,500 but matched settlement net is ₹4,412 — difference exceeds fee-adjusted tolerance.",
      "unresolved_after_tier": "ai_assisted"
    }
  ]
}
```

---

### `GET /reconcile/{run_id}/audit-log`
Full audit trail for a run, filterable by transaction.

**Query Parameters:**
`?canonical_transaction_id=...`

**Response (`200 OK`):**
```json
{
  "results": [
    {
      "tier": "ai_assisted",
      "action": "matched",
      "confidence": 0.82,
      "reason": "Reference IDs differ by one transposed digit; amount and date align within tolerance.",
      "created_at": "2026-08-20T10:14:02Z"
    }
  ]
}
```

---

### `GET /reconcile/{run_id}/exceptions/export`
Returns the exception list as a downloadable CSV (FR-9).

---

## 3. Settlement Q&A Endpoint (Stretch Goal, FR-7)

### `POST /qa/ask`
Ask a natural-language question about a completed reconciliation run.

**Request Body:**
```json
{
  "run_id": "run_8f1a...",
  "question": "Why did settlement batch STL-2291 fall short of ₹50,000?"
}
```

**Response (`200 OK`):**
```json
{
  "answer": "Batch STL-2291 had a gross value of ₹50,000. Razorpay deducted ₹1,000 in commission and ₹180 in GST on that fee, and one order (ORD-10432) was partially refunded for ₹590 before settlement, bringing the net credit to ₹48,230.",
  "cited_audit_log_ids": [1042, 1043, 1058]
}
```

---

## 4. Health and Meta

### `GET /health`
Liveness check for the API — returns 200 if the service and DB connection are healthy.

### `GET /docs`
FastAPI auto-generated OpenAPI/Swagger UI — the always-accurate live reference (see ADR-005).

---

## 5. Error Shape (Applies to all endpoints)

**Response (`4xx` / `5xx`):**
```json
{
  "error": {
    "code": "RUN_NOT_FOUND",
    "message": "No run with id run_xyz."
  }
}
```

**Standard error codes to implement:**
- `VALIDATION_ERROR` (400)
- `RUN_NOT_FOUND` (404)
- `DATASET_NOT_FOUND` (404)
- `RUN_NOT_COMPLETED` (409, when matches/exceptions are requested before a run finishes)
- `AI_TIER_UNAVAILABLE` (502, surfaced but non-fatal — see HLD §6 error handling)

---

## 6. Versioning

No versioning prefix (e.g. `/v1/`) is used for the hackathon build — out of scope per the requirements doc's non-goals. If this project continues past the hackathon, introduce `/v1/` before any breaking contract change.
