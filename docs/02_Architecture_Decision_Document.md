# RAZORPAY HACKATHON — TRACK 04 · AI FINANCE CONTROLLER

### reconnAIssance

### Architecture decision document

This document records the key architecture decisions for reconnAIssance in lightweight ADR (Architecture Decision Record) format: the situation we faced, what we decided, and what that decision costs us. Read this before touching the HLD or data model docs — those two assume every decision below.

> [!NOTE]
> **Learning Note**: an ADR is a short, dated record of "why we built it this way," written so that a future reader (including future-you, three weeks from now) does not have to reverse-engineer the reasoning from the code.

## Decision log

### ADR-001 — Three-tier matching strategy (exact → fuzzy → AI-assisted)

Status:  Accepted

#### Context

Reconciliation needs to pair up rows across three sources that describe the same real-world payment. Most rows are trivially identical on a shared reference ID; some are close but not identical (rounding, minor date drift, bundled settlements); a small remainder are genuinely ambiguous and need contextual judgement. Running every row through an LLM would be slow, expensive, and unnecessary for the easy majority.

#### Decision

- Tier 1 (exact): deterministic key match on transaction/order reference ID. Cheapest, runs first, resolves the majority of rows.
- Tier 2 (fuzzy): for rows Tier 1 could not resolve, match on amount within a fee-aware tolerance, date within a rolling window, and reference-ID string similarity (edit distance) above a threshold.
- Tier 3 (AI-assisted): only the remaining unresolved rows are sent to the LLM, with the surrounding candidate context, and it returns a match/no-match decision, a confidence score, and a natural-language reason.

#### Consequences

- Keeps LLM calls proportional to genuine ambiguity, not dataset size — controls cost and latency (see the tech stack doc, §4, for the resulting throughput math).
- Each tier is independently testable and the reason a row was matched is always traceable to a specific tier (this becomes the backbone of the audit log — see ADR-007).
- Threshold tuning (Tier 2's tolerance windows) becomes a real design decision we must document and justify, not just a knob to guess at — see the data model doc §3 for the chosen values and why.

#### Alternatives considered

- Send every row to the LLM: rejected — too slow and expensive at 2,000+ rows, and unnecessary since most rows are exact matches.
- Pure rule-based matching with no AI tier at all: rejected — this is what every basic recon script already does; it would not demonstrate "AI meaningfully used," which the track explicitly asks for.

### ADR-002 — Synthetic data generation with explicitly injected noise patterns

Status:  Accepted

#### Context

We have no access to real merchant financial data, and using it would be inappropriate even if we did. We still need data that behaves like real reconciliation data — otherwise the matching problem is trivially easy and proves nothing.

#### Decision

- Build a deterministic (seeded) synthetic data generator producing three linked files: internal ledger, Razorpay settlement report, bank statement.
- Deliberately inject the specific failure patterns real reconciliation deals with: settlement fees/GST-on-fees deduction, T+2 timing lag, partial refunds, ~2% duplicate rows, ~3% missing rows, ~5% reference-ID typos, bundled (many-to-one) and split (one-to-many) settlements, and small rounding differences.
- The generator retains ground truth (which rows should match) internally, used only for scoring — never exposed to the matching pipeline.

#### Consequences

- Data quality becomes something we control and can defend — every noise pattern maps to a real cause we can explain to a judge, not "random for the sake of it."
- Ground truth enables real precision/recall computation (ADR-003), which a naive "does the output look plausible" evaluation cannot give us.
- We own the responsibility of keeping the noise realistic in proportion — too little noise makes the problem trivial, too much makes it unrepresentative of real recon workloads (typically 85–98% clean match rate before intervention).

#### Alternatives considered

- Scrape or use anonymized real datasets: rejected — not available, and privacy/legal risk even if it were.
- Hand-craft a small (~50 row) example set: rejected — fails the track's explicit throughput requirement and risks exactly the "cherry-picked example" criticism the bar calls out.

### ADR-003 — Held-out evaluation split, enforced in code

Status:  Accepted

#### Context

The track requires "measured accuracy," and a number we computed on the same data we tuned our thresholds against is not a credible measurement — it is closer to memorization.

#### Decision

- Split synthetic data 80/20 at generation time into a tuning set and a held-out set, tagged at the file level so it cannot be mixed up accidentally.
- All threshold tuning (Tier 2 tolerances, Tier 3 prompt iteration) happens only against the tuning set.
- The held-out set is run exactly once for final reported numbers per submission candidate, and that run is what gets demoed.

#### Consequences

- Reported precision/recall/match rate are defensible under judge questioning.
- Requires discipline during development — it is tempting to peek at held-out results while debugging; the pipeline should make this deliberately awkward (e.g. a separate CLI flag with a printed warning) rather than a default.

#### Alternatives considered

- Report metrics on the full dataset (train = test): rejected — not a real measurement, and judges in a fintech-adjacent hackathon are likely to know why this is invalid.
- K-fold cross-validation: considered but unnecessary complexity for a hackathon timeline; a single clean held-out split is sufficient and easier to explain live.

### ADR-004 — SQLite for storage, with a Postgres-compatible schema

Status:  Accepted

#### Context

We need a place to persist raw source data, match results, exceptions, and audit log entries, queryable by the dashboard and the Q&A agent, without spending build time on database operations during a time-boxed hackathon.

#### Decision

- Use SQLite as the single-file database for development and the live demo.
- Write the schema and all queries in plain, portable SQL (no SQLite-only syntax) so migrating to Postgres later is a connection-string change, not a rewrite — see the data model doc for the full schema.

#### Consequences

- Zero setup for teammates and judges who want to run it themselves — one file, no server to stand up.
- Concurrency is limited, which is irrelevant for a single-demo hackathon context but would need revisiting for any real multi-user deployment.

#### Alternatives considered

- Postgres from day one: rejected for this timeline — adds setup/deployment overhead with no benefit at hackathon scale.
- In-memory pandas DataFrames only, no DB: rejected — we need the audit log and Q&A agent to query persisted state after the matching run completes, not just during it.

### ADR-005 — FastAPI backend, React dashboard, contract-first between them

Status:  Accepted

#### Context

The matching pipeline (Python, pandas/rapidfuzz-heavy) and the dashboard (visual, interactive) are naturally different skill surfaces, and a hackathon team benefits from being able to build both in parallel once the interface between them is fixed.

#### Decision

- Backend: FastAPI serving a REST API (see the API contract doc) that exposes dataset upload, reconciliation runs, matches, exceptions, metrics, audit log, and the Q&A endpoint.
- Frontend: a React single-page dashboard consuming that API — no server-rendered templating.
- The API contract doc is written and agreed before deep implementation starts, so the frontend can be built against mock responses immediately.

#### Consequences

- Clean separation lets the matching logic be tested and scored independently of any UI concerns.
- FastAPI's automatic OpenAPI docs page doubles as a live, always-accurate reference during the hackathon and a nice thing to show judges directly.

#### Alternatives considered

- A monolithic server-rendered app (e.g. Flask + Jinja templates): rejected — worse demo polish, and worse parallelization across a team.
- Notebook-only deliverable (Jupyter): rejected — does not produce the interactive dashboard the bar implicitly expects, and reads as less "product," more "analysis."

### ADR-006 — Claude API for the AI-assisted matching tier and the Q&A agent

Status:  Accepted

#### Context

Tier 3 matching and the Settlement Q&A agent both require genuine natural-language reasoning over financial context — this is the part of the system that is meaningfully "AI," per the track's stated bar.

#### Decision

- Use the Claude API with structured/JSON-mode-style prompting for Tier 3 so responses are machine-parseable (match/no-match, confidence, reason) rather than free text that needs further parsing.
- The Q&A agent is a second, distinct prompt path: it is given the reconciled data (matches, exceptions, fee breakdowns) as tool-retrieved context and answers in natural language — it does not re-run matching itself.
- Every LLM call and its output is logged to the audit trail (ADR-007) so an "AI decided this" moment is always inspectable, never a black box.

#### Consequences

- Meaningfully demonstrates AI use in the part of the system where it adds real value (judgement on ambiguous cases, natural-language explanation) rather than as a label slapped on rule-based code.
- Introduces API latency/cost and a live-demo dependency, which is mitigated by ADR-002's tiering (few calls) and a cached-results fallback for the live demo.

#### Alternatives considered

- A local open-source model: rejected for this timeline — added infra complexity without a clear benefit for a hackathon build.
- No AI tier at all, pure rules: rejected — see ADR-001; also weaker against the track's explicit ask for AI-meaningfully-used.

### ADR-007 — Audit log as a first-class, queryable table — not app logs

Status:  Accepted

#### Context

The track bar and our own FR-5/FR-6 require every decision to be explainable and inspectable, including from the dashboard UI and the Q&A agent, not just from developer-facing console logs.

#### Decision

- Every match or exception decision writes one row to an `audit_log` table (see the data model doc) capturing which tier decided it, the inputs compared, the outcome, a confidence score, and a human-readable reason string.
- The dashboard reads this table directly to power "why was this matched/flagged?" drill-downs.
- The Q&A agent queries this table as part of its retrieved context when answering questions about specific transactions.

#### Consequences

- Explainability is a query, not an archaeology exercise through log files — this is what makes the "honest exception list" requirement demoable live.
- Adds a small amount of write overhead per row during the matching run, acceptable at our target throughput.

#### Alternatives considered

- Standard application logging (stdout/log files) only: rejected — not queryable from the UI or the Q&A agent, fails FR-5 and FR-7.