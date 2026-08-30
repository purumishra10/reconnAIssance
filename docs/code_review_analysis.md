# reconnAIssance — Full Code Review & Analysis

> **Date:** 2026-08-28  
> **Scope:** All files across the 5 commits (backend + frontend)  
> **Purpose:** Document every identified bug, design issue, and improvement opportunity so work can resume seamlessly.

---

## 1. Repository Structure Overview

```
reconnAIssance/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry, CORS, lifespan
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic Settings (env-based)
│   │   │   └── database.py      # SQLite engine, session factory
│   │   ├── models/
│   │   │   └── schemas.py       # 10 SQLModel tables
│   │   ├── generator/
│   │   │   ├── data_generator.py # Synthetic 3-source dataset builder
│   │   │   └── noise_injector.py # 4 noise injection functions
│   │   ├── engine/
│   │   │   ├── ingestion.py     # Raw → Canonical normalization
│   │   │   ├── tier1_exact.py   # Deterministic key matching
│   │   │   ├── tier2_fuzzy.py   # Fuzzy + fee-tolerant matching
│   │   │   ├── tier3_ai.py      # LLM-assisted matching
│   │   │   ├── exception_classifier.py # Unmatched → structured exceptions
│   │   │   ├── evaluator.py     # Precision/Recall/Throughput scorer
│   │   │   └── pipeline.py      # End-to-end orchestrator
│   │   ├── services/
│   │   │   └── llm_client.py    # GeminiClient + MockLLMClient + factory
│   │   └── api/
│   │       ├── __init__.py      # Router aggregation
│   │       ├── health.py        # /health liveness probe
│   │       ├── datasets.py      # /datasets/generate, /datasets/{ver}
│   │       ├── reconcile.py     # /reconcile/run, matches, exceptions, audit-log, CSV export
│   │       └── qa.py            # /qa/ask, /qa/history
│   ├── tests/
│   │   ├── test_generator.py
│   │   ├── test_tier1_tier2.py
│   │   └── test_pipeline_e2e.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx              # Root component, tab routing, auto-init
│   │   ├── services/api.js      # Fetch wrapper + API methods
│   │   ├── styles/
│   │   │   ├── variables.css    # Light/Dark theme tokens
│   │   │   └── global.css       # Glass panels, badges, tables, animations
│   │   └── components/
│   │       ├── layout/
│   │       │   ├── Header.jsx
│   │       │   ├── Sidebar.jsx
│   │       │   └── ThemeProvider.jsx
│   │       ├── dashboard/
│   │       │   ├── MetricsRow.jsx
│   │       │   ├── TierBreakdown.jsx
│   │       │   ├── MatchTable.jsx
│   │       │   └── ExceptionTable.jsx
│   │       ├── reconcile/
│   │       │   └── RunForm.jsx
│   │       ├── qa/
│   │       │   └── ChatPanel.jsx
│   │       └── audit/
│   │           └── AuditInspector.jsx
│   ├── vite.config.js
│   ├── index.html
│   └── package.json
└── docs/                        # Spec markdown files
```

---

## 2. Bugs Found

### 🔴 Critical

| # | File | Line(s) | Issue | Impact |
|---|------|---------|-------|--------|
| B1 | [reconcile.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/api/reconcile.py#L34-L38) | 34-38 | `run_pipeline_task()` is a regular `async def` called via `background_tasks.add_task()`. FastAPI's `BackgroundTasks` runs tasks in a threadpool by default for sync functions. For async functions it runs them in the event loop — but this function creates its own `Session(engine)` and calls `await pipeline.execute(session)`. **If the main request event loop is busy, this blocks.** Additionally, SQLite + async is fragile because SQLite isn't truly async-safe. | Pipeline may silently deadlock or error under concurrent requests. |
| B2 | [tier3_ai.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/tier3_ai.py#L40-L66) | 40-66 | Tier 3 only picks the **first unmatched settlement** for each ledger row (`break` at line 66). It doesn't do any pre-scoring or ranking — it just grabs whatever appears first in the list. The AI is asked to evaluate essentially random pairings rather than plausible candidates. | AI token waste; poor Tier 3 match quality; many legitimate matches may be missed. |
| B3 | [evaluator.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/evaluator.py#L68-L81) | 68-81 | Ground truth matching logic is O(N×M) — for every match group, it iterates through **all** ground truth entries. With 2000 records, this is ~2000×2000 = 4M comparisons. Also, it falls back to `group.confidence >= 0.85` as a "true positive" proxy when ground truth doesn't match — this inflates precision artificially. The `in` substring check on line 72 (`l_ref in exp_l`) can produce false positives. | Incorrect metrics (inflated precision), very slow evaluation on larger datasets. |
| B4 | [ingestion.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/ingestion.py#L53-L56) | 53-56 | Ingestion deletes ALL canonical rows for `dataset_version`, not scoped by `split`. If you run holdout then tuning, the tuning ingestion wipes out the holdout canonical rows. Running again on the same dataset version after a previous run corrupts the DB state. | Re-runs on same dataset version will silently destroy previous canonical data. |
| B5 | [reconcile.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/api/reconcile.py#L125) | 125 | Audit log `total` count is computed **without** the tier/action filters applied — it always returns the total for the run, not the filtered total. Same issue on line 249. | Pagination metadata is wrong when filters are active; UI shows incorrect "X of Y" text. |

### 🟡 Moderate

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| B6 | [llm_client.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/services/llm_client.py#L29-L31) | 29-31 | `MockLLMClient.match_candidates()` reads `item_a.get("normalized_ref")` and `item_a.get("amount_paise")`, but the actual payload sent from `tier3_ai.py` uses raw JSON fields like `"order_id"`, `"net_amount_paise"` — there's a **field name mismatch**. The mock client will always get empty strings and 0 amounts, producing meaningless heuristic results. |
| B7 | [data_generator.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/generator/data_generator.py#L247-L253) | 247-253 | Ground truth `matches` dict doesn't record split settlements or orders that have rounding drift applied. Split settlements hit `continue` on line 223 before recording ground truth. This means the evaluator can never mark those as true positives. |
| B8 | [App.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/App.jsx#L67-L75) | 67-75 | Polling interval in `generateInitialRun()` has **no timeout/max-poll guard**. If the backend crashes during a run, the interval runs forever. Same issue in [RunForm.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/reconcile/RunForm.jsx#L75-L92) line 75-92. |
| B9 | [database.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/core/database.py#L2) | 2 | `StaticPool` is imported but never used. Unnecessary import. |
| B10 | [reconcile.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/api/reconcile.py#L125) | 125 | Matches endpoint computes `total` without the `tier` filter. If you filter by `tier=fuzzy`, the total still returns the count for ALL tiers. |

### 🟢 Minor

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| B11 | [noise_injector.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/generator/noise_injector.py#L76) | 76 | Truncation logic `narration[:rng.randint(len(narration) - 6, len(narration))]` can produce the full untruncated narration (when `randint` returns `len(narration)`). |
| B12 | [evaluator.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/evaluator.py#L102) | 102 | `from datetime import datetime` is imported **inside** the method body instead of at file top — works but is non-standard. |
| B13 | [config.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/core/config.py#L13) | 13 | `API_V1_STR` defaults to `""` (empty string). This means all routes are mounted at root (`/health`, `/datasets/generate`) with no version prefix. Not wrong, but inconsistent with the variable name suggesting versioned routing. |
| B14 | [ChatPanel.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/qa/ChatPanel.jsx#L160) | 160 | Chat messages use `whiteSpace: 'pre-wrap'` which respects markdown-style `**bold**` in the raw text but doesn't actually render it. The LLM responses contain markdown formatting that's displayed as literal asterisks. |

---

## 3. Design Issues & Improvement Opportunities

### Architecture

| # | Category | Issue | Recommendation |
|---|----------|-------|----------------|
| D1 | **Tier 3 Candidate Selection** | Tier 3 uses a naive "first unmatched" pairing strategy. No pre-filtering or scoring narrows the candidate set before expensive LLM calls. | Add a lightweight pre-scorer (e.g., date proximity + partial ref overlap) to select the top-3 candidates per ledger row before sending to the LLM. |
| D2 | **Ingestion Scope** | Ingestion deletes ALL canonical rows for the dataset version regardless of split. | Scope the delete to include split: `WHERE dataset_version = X AND dataset_split = Y`. |
| D3 | **Ground Truth Coverage** | Split settlements, rounding-drifted settlements, and refunded orders are not recorded in ground truth. Evaluator can't score them. | Record ground truth for split settlements and mark noise types in the matches dict. |
| D4 | **Evaluator Complexity** | O(N²) ground truth lookup per group. | Build a lookup dict keyed by normalized ref from ground truth for O(1) lookups. |
| D5 | **Background Task Model** | `async def run_pipeline_task()` + `BackgroundTasks.add_task()` is fragile with SQLite. | Convert to sync `def` or use a proper task queue. For SQLite, sync is safer. |

### Backend Code Quality

| # | Category | Issue | Recommendation |
|---|----------|-------|----------------|
| Q1 | **Error Handling** | `tier3_ai.py` catches all exceptions and produces a fallback `{"match": False}` silently. No structured error logging with traceback. | Add `logger.exception()` in the except block. |
| Q2 | **Type Safety** | `MockLLMClient` and `GeminiClient` don't validate the shape of returned decisions. If Gemini returns malformed JSON, individual decision fields may silently be `None`. | Add Pydantic response models for LLM decisions. |
| Q3 | **Audit Log Total** | API endpoints for audit log, matches, and exceptions compute `total` without applying the same filters as the query. | Apply the same `WHERE` clauses to the count query. |
| Q4 | **Unused Import** | `StaticPool` imported in `database.py` but never used. `pandas` in `requirements.txt` but never imported anywhere. | Remove unused imports and dependencies. |
| Q5 | **Test Coverage** | Only 3 test files. No tests for: ingestion normalization, exception classifier, evaluator, API endpoints, Q&A flow, mock LLM client. | Add unit tests for each module. |

### Frontend

| # | Category | Issue | Recommendation |
|---|----------|-------|----------------|
| F1 | **Polling Leak** | Both `App.jsx` and `RunForm.jsx` use `setInterval` for polling without cleanup on unmount or a max-iteration guard. | Add `useEffect` cleanup and a max-poll counter (e.g., 120 iterations = 2 minutes). |
| F2 | **Markdown Rendering** | Chat messages display raw markdown (`**bold**`) as literal text. | Use a lightweight markdown renderer (e.g., `react-markdown` or a simple regex-based bold/italic parser). |
| F3 | **Accessibility** | No `aria-label` attributes on icon-only buttons (theme toggle, refresh). No keyboard navigation indicators. | Add `aria-label` props to all icon buttons. |
| F4 | **Error States** | API errors are only logged to console. No user-facing error toasts or banners. | Add a simple toast/notification system for API errors. |
| F5 | **Sidebar Icons** | Both "Matched Groups" and "Exceptions" use the same `ShieldAlert` icon. | Use distinct icons (e.g., `CheckCheck` for matches, `AlertTriangle` for exceptions). |
| F6 | **Stale Closure** | `RunForm.jsx` polling uses `setInterval` which captures the initial `runId` in closure. If the component re-renders with a new run, the old poll may reference stale state. | Use `useRef` for the interval ID and clean up properly. |

---

## 4. File-by-File Detailed Notes

### Backend

#### [config.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/core/config.py)
- ✅ Clean Pydantic Settings pattern with `.env` support
- ✅ All thresholds are configurable (good for tuning)
- ⚠️ `API_V1_STR = ""` — should be `/api/v1` or left intentionally blank

#### [database.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/core/database.py)
- ✅ Proper `check_same_thread=False` for SQLite
- ⚠️ Unused `StaticPool` import
- 💡 Could enable WAL mode for better concurrent read performance: `"PRAGMA journal_mode=WAL"`

#### [schemas.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/models/schemas.py)
- ✅ Integer-paise money fields (no float drift) — excellent
- ✅ Comprehensive indexing on all foreign keys and lookup fields
- ✅ Proper `default_factory` for timestamps
- ✅ 10 well-designed tables covering the full domain

#### [data_generator.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/generator/data_generator.py)
- ✅ Deterministic with seeded `random.Random(seed)` — reproducible
- ✅ Realistic noise: 9 patterns (typos, splits, duplicates, missing, rounding, date drift, etc.)
- ✅ Proper fee model (2% MDR + 18% GST)
- ⚠️ Split settlements skip ground truth recording (line 222-223 `continue` before line 247)
- ⚠️ Ground truth file saved to relative path — fragile across different CWDs
- 💡 Log-normal amount distribution is a nice realistic touch

#### [noise_injector.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/generator/noise_injector.py)
- ✅ Four well-designed noise functions
- ✅ Realistic bank narration templates with 6 format variations
- ⚠️ Truncation logic can be a no-op

#### [ingestion.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/ingestion.py)
- ✅ Clean normalization pipeline with `normalize_ref_string()`
- ✅ Good UTR/batch extraction from narrations via regex
- 🔴 Deletes ALL canonical rows for version (not scoped by split)
- ✅ Proper audit log entry for ingestion

#### [tier1_exact.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/tier1_exact.py)
- ✅ Clean deterministic matching on normalized refs
- ✅ Proper greedy consumption (first-match, mark-as-used)
- ✅ Correctly links bank entries via batch ID
- ✅ Full audit trail per match
- 💡 Could add a bank-to-settlement batch aggregation match (many settlements → 1 bank credit)

#### [tier2_fuzzy.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/tier2_fuzzy.py)
- ✅ Well-designed composite scoring: 40% ref similarity + 35% amount + 25% date
- ✅ Fee-aware amount scoring with expected net calculation
- ✅ Configurable thresholds from Settings
- ✅ Best-candidate greedy assignment
- 💡 Could add a "second-best gap" check to avoid marginal matches

#### [tier3_ai.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/tier3_ai.py)
- ✅ Batched LLM calls (5 at a time) — good token efficiency
- ✅ Full audit trail with raw LLM JSON stored
- 🔴 Naive candidate selection (first unmatched settlement, no ranking)
- ⚠️ Silent exception swallowing on LLM failures
- 💡 Add pre-scoring to select most likely candidates before LLM call

#### [exception_classifier.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/exception_classifier.py)
- ✅ Good classification logic: duplicates, missing counterparts, amount mismatches
- ✅ Human-readable reason text with rupee amounts
- ✅ All exceptions are audited

#### [evaluator.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/evaluator.py)
- 🔴 O(N²) ground truth verification
- 🔴 Confidence-based fallback (`>= 0.85 → true positive`) inflates precision
- ⚠️ Import inside function body
- 💡 Build a ref→ground_truth dict for O(1) lookups

#### [pipeline.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/engine/pipeline.py)
- ✅ Clean orchestration: Ingest → T1 → T2 → T3 → Exceptions → Evaluate
- ✅ Proper error handling with run status update on failure
- ✅ Metrics propagated back to ReconciliationRun record

#### [llm_client.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/services/llm_client.py)
- ✅ Clean factory pattern with auto/mock/live modes
- ✅ GeminiClient with proper markdown fence stripping
- ✅ Graceful fallback to MockLLMClient on API failure
- ⚠️ Mock client field name mismatch (reads `normalized_ref` but payload has `order_id`)
- ✅ MockLLMClient Q&A has good domain-aware heuristic responses

#### API Layer ([datasets.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/api/datasets.py), [reconcile.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/api/reconcile.py), [qa.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/api/qa.py), [health.py](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/backend/app/api/health.py))
- ✅ Well-structured RESTful endpoints with proper HTTP status codes
- ✅ Pagination on matches, exceptions, audit log
- ✅ CSV export for exceptions (FR-9)
- ✅ Q&A session management with conversation history
- ⚠️ Filtered count queries don't match filter criteria (total is always unfiltered)
- ⚠️ Background task is async — fragile with SQLite

### Frontend

#### [App.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/App.jsx)
- ✅ Clean tab-based SPA routing
- ✅ Auto-bootstrap: generates demo data on first load
- ⚠️ Polling leak on initial run generation (no cleanup)

#### [api.js](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/services/api.js)
- ✅ Clean fetch wrapper with error handling
- ✅ CSV blob download support
- ✅ All endpoints covered

#### [ThemeProvider.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/layout/ThemeProvider.jsx)
- ✅ Clean context-based theme toggle with localStorage persistence

#### [Header.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/layout/Header.jsx)
- ✅ Branding, run selector, refresh, theme toggle — all functional

#### [Sidebar.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/layout/Sidebar.jsx)
- ✅ Clean nav with active state styling and exception badge
- ⚠️ Duplicate icon (ShieldAlert) for two different nav items

#### [MetricsRow.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/dashboard/MetricsRow.jsx)
- ✅ 5 KPI cards with glowing top accent — visually polished

#### [TierBreakdown.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/dashboard/TierBreakdown.jsx)
- ✅ Recharts donut chart with tier breakdown cards
- ✅ Center label shows total decisions

#### [MatchTable.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/dashboard/MatchTable.jsx)
- ✅ Expandable drill-down rows showing 3-way linked entries
- ✅ Search, tier filter, pagination

#### [ExceptionTable.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/dashboard/ExceptionTable.jsx)
- ✅ CSV export button, reason code filter, search
- ✅ Color-coded reason badges

#### [RunForm.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/reconcile/RunForm.jsx)
- ✅ Three presets (500/2000/10000) with visual selection cards
- ✅ 2-step generate → reconcile flow with status messages
- ⚠️ Polling interval not cleaned up on unmount

#### [ChatPanel.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/qa/ChatPanel.jsx)
- ✅ Suggested questions, session management, cited audit log badges
- ⚠️ No markdown rendering for LLM responses

#### [AuditInspector.jsx](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/components/audit/AuditInspector.jsx)
- ✅ Expandable raw LLM JSON viewer
- ✅ Tier + action filters, search, pagination

#### CSS ([variables.css](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/styles/variables.css), [global.css](file:///d:/Puru_VNR/3rd%20Year/Hackathons%20&%20Competitions/Razorpay/reconnAIssance/frontend/src/styles/global.css))
- ✅ Complete dual-theme system (light + dark)
- ✅ Glassmorphism panels, gradient buttons, custom scrollbar
- ✅ Consistent design token usage throughout

---

## 5. Priority-Ordered Fix Plan

When we resume, apply fixes in this order:

### Phase 1 — Critical Bug Fixes
1. **Fix filtered count queries** (B5, B10, Q3) — reconcile.py audit log & matches `total` must use same filters
2. **Fix ingestion scope** (B4, D2) — scope canonical delete by `dataset_version` AND `split`
3. **Fix background task model** (B1, D5) — make `run_pipeline_task` sync
4. **Fix mock LLM field mismatch** (B6) — align field names between tier3 payload and MockLLMClient
5. **Fix ground truth for split settlements** (B7, D3) — record before `continue`

### Phase 2 — Evaluator & Tier 3 Improvements
6. **Fix evaluator O(N²)** (B3, D4) — build ref→GT dict, remove confidence fallback
7. **Improve Tier 3 candidate selection** (B2, D1) — add pre-scoring before LLM calls
8. **Move datetime import to top** (B12) — minor cleanup

### Phase 3 — Frontend Robustness
9. **Fix polling leaks** (B8, F1, F6) — add useEffect cleanup + max poll counter
10. **Add markdown rendering** (B14, F2) — install react-markdown or simple parser
11. **Fix sidebar icons** (F5) — use distinct icons
12. **Add error toasts** (F4) — simple notification for API errors

### Phase 4 — Quality Polish
13. **Remove unused imports** (B9, Q4) — StaticPool, pandas dependency
14. **Add more tests** (Q5) — ingestion, evaluator, exception classifier, API endpoints
15. **Add accessibility** (F3) — aria-labels on icon buttons
16. **Enable WAL mode** — better SQLite concurrency

---

## 6. What's Working Well ✅

- **Integer-paise money model** — no floating-point drift anywhere
- **3-tier cascade architecture** — clean separation of exact → fuzzy → AI
- **Comprehensive audit trail** — every decision logged with tier, action, confidence, reason
- **Dual-theme UI** — polished glassmorphism with proper dark/light tokens
- **Mock LLM fallback** — system runs fully offline for demos
- **Deterministic data generation** — seeded RNG for reproducibility
- **Fee-aware matching** — proper 2% MDR + 18% GST tolerance calculation
- **9 realistic noise patterns** — typos, splits, duplicates, rounding, date drift, missing rows
- **CSV exception export** — directly satisfies FR-9 requirement
- **Expandable match drill-down** — 3-way view (ledger, settlement, bank) per group
