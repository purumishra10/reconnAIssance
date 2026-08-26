# RAZORPAY HACKATHON — TRACK 04 · AI FINANCE CONTROLLER

### reconnAIssance

### High-level design — skeleton

This is a skeleton, not a finished HLD: the structure and the load-bearing decisions are filled in, but implementation-level detail (exact function signatures, file layout, prompt text) is intentionally left as headers for you to complete once building starts in Cursor/Antigravity. Sections marked [FILL IN DURING BUILD] are where you should expect to add detail as the code takes shape.

> [!NOTE]
> **Learning Note**: an HLD (high-level design) sits between the requirements doc and the actual code — it describes the pieces of the system and how they talk to each other, without getting into class-level or line-level detail. A low-level design (LLD) would be the next, more detailed step down, which this project deliberately skips for time.

## 1. System overview

reconnAIssance is a batch pipeline with a thin API layer on top. A reconciliation "run" takes three raw data files as input and produces a scored, explainable set of matches and exceptions as output, which a dashboard and a Q&A agent then read from.

The diagram shared earlier in this conversation is the canonical picture of this flow: synthetic data → matching engine (three tiers) → matched records / exceptions → dashboard and audit trail → Q&A agent on top → final held-out score.

## 2. Components

| Component | Responsibility | Owns |
| --- | --- | --- |
| Data generator | Produces the three synthetic source files plus ground truth, with injected noise per ADR-002. | raw_ledger, raw_settlement, raw_bank, ground_truth (internal only) |
| Ingestion layer | Loads raw files into the canonical transaction schema; validates and normalizes formats (dates, currency, IDs). | canonical_transaction |
| Matching engine | Runs the three-tier pipeline (exact, fuzzy, AI-assisted) per ADR-001. | match_result, exception |
| Audit logger | Writes one row per decision made by any tier, with the reasoning, per ADR-007. | audit_log |
| Evaluation harness | Computes match rate, precision, recall, throughput against the held-out set per ADR-003. | run metrics (see data model doc, reconciliation_run table) |
| API layer (FastAPI) | Exposes everything above over REST, per the API contract doc. | HTTP surface only, no business logic beyond orchestration |
| Dashboard (React) | Visualizes summary metrics, matches, and exceptions; drives drill-downs into the audit log. | no persisted state — reads from the API |
| Settlement Q&A agent | Answers natural-language questions using reconciled data and the audit log as retrieved context. | qa_session (optional, for conversation history) |

## 3. Primary data flow — a reconciliation run

- User (or a startup script, for the demo) triggers `POST /reconcile/run` with a dataset reference.
- Ingestion layer loads the three raw files, normalizes them into `canonical_transaction` rows tagged by source.
- Matching engine Tier 1 runs exact-key matching across sources; matched rows are written to `match_result` with tier = "exact".
- Remaining unmatched rows pass to Tier 2 fuzzy matching (amount tolerance + date window + reference-ID similarity); matches written with tier = "fuzzy".
- Remaining unmatched rows pass to Tier 3; each candidate pair (or unpaired row) is sent to the Claude API with context, returns a structured match/no-match + confidence + reason.
- Rows still unmatched after all three tiers are written to `exception`, each with a generated reason category (e.g. "no counterpart found within window", "amount mismatch beyond tolerance").
- Every decision from every tier writes a row to `audit_log` as it happens, not as a post-hoc summary.
- Evaluation harness runs only against the held-out portion of the run, computing and storing metrics on `reconciliation_run`.
- API returns a run summary; dashboard polls or fetches this to render.

## 4. Secondary flow — Settlement Q&A query

- User submits a natural-language question via `POST /qa/ask` (e.g. "why did settlement batch S-2291 fall short?").
- Agent retrieves relevant context: the matched/exception rows and audit log entries touching the referenced batch, order, or date range.
- Retrieved context + question sent to Claude API with instructions to answer only from the provided context and cite the specific transaction/audit entries used.
- Response returned to the user with the underlying transaction references attached, so the answer is checkable, not just asserted.

## 5. Deployment view (hackathon demo scope)

- Single machine (developer laptop or one small cloud VM) running: FastAPI backend, SQLite file, React dev/build server.
- No containerization strictly required for the demo timeline, but a simple docker-compose is a reasonable stretch goal if time allows — see the tech stack doc §5 for the call on this.
- Environment variables hold the Claude API key; never checked into the repo.
- A pre-computed run (cached JSON/DB snapshot) is kept as a fallback so the live demo does not depend on live LLM latency — see requirements doc, Risks table.

## 6. Error handling and edge cases [FILL IN DURING BUILD]

Populate this section as you encounter real cases during implementation. Starting list of cases the design must not silently ignore:

- LLM API call fails or times out during Tier 3 — the row should fall through to `exception` with reason "AI tier unavailable," not crash the run.
- A row matches more than one candidate in Tier 2 (ambiguous many-to-one) — needs an explicit tie-breaking rule, documented once decided.
- Duplicate rows within a single source (the ~2% injected duplicates) — decide whether the second occurrence is itself flagged as an exception category, or silently deduplicated before matching (recommend: flag it — silently deduplicating hides a real data-quality signal a finance analyst would want to see).
- Malformed or missing fields in an uploaded file — ingestion layer should reject with a clear validation error, not fail deep inside the matching engine.

## 7. Throughput and scalability notes

Target is 2,000+ records processed end to end in under 60 seconds (per the requirements doc NFRs). The three-tier design is the primary lever: Tier 1 and Tier 2 are vectorized pandas/rapidfuzz operations over the whole batch, cheap at this scale; Tier 3 LLM calls are the bottleneck, which is why ADR-001 exists — keep the Tier 3 population small by construction, and batch/parallelize the calls that do happen (see tech stack doc §4 for the concrete approach).

## 8. Open questions [FILL IN DURING BUILD]

- Exact confidence threshold below which Tier 2 declines to auto-match and defers to Tier 3 — set from the tuning-set results once real data exists.
- Whether the Q&A agent needs conversation memory across turns for the demo, or single-turn Q&A is sufficient (recommend: single-turn is sufficient for the hackathon; note this as intentionally deferred, not forgotten).
- Whether to expose a manual "confirm/override" action for a human reviewing an exception — nice product polish, not required for the track's bar.