# RAZORPAY HACKATHON — TRACK 04 · AI FINANCE CONTROLLER

### reconnAIssance

Tech stack & infrastructure decisions

This doc lists the concrete tools and libraries chosen to implement the architecture decided in the ADR doc, and the reasoning for each — written so Cursor/Antigravity can be pointed at this file directly as build instructions.

## 1. Backend

| Layer | Choice | Why |
| --- | --- | --- |
| Language | Python 3.11+ | Best-in-class data/finance tooling (pandas, rapidfuzz); the AI SDKs and most reconciliation-style examples in the wild are Python-first. |
| Web framework | FastAPI | Async-friendly, automatic OpenAPI docs (doubles as live API reference, ADR-005), typed request/response models via Pydantic catch contract mismatches early. |
| Data wrangling | pandas | Vectorized operations for Tier 1/2 matching across thousands of rows — far faster than row-by-row Python loops. |
| Fuzzy matching | rapidfuzz | Fast Levenshtein/token-based string similarity for reference-ID matching in Tier 2; substantially faster than the older fuzzywuzzy library. |
| ORM / DB access | SQLModel or plain SQLAlchemy core | Typed models shared between the schema and the API layer; keeps the SQL portable per ADR-004. |
| Task handling | FastAPI BackgroundTasks (or a simple in-process queue) | Reconciliation runs take a few seconds to tens of seconds — background execution keeps POST /reconcile/run responsive without needing a heavyweight task queue like Celery for a hackathon. |

## 2. AI / LLM layer

| Decision | Choice | Why |
| --- | --- | --- |
| Provider | Anthropic Claude API | Strong structured-output following and reasoning over tabular/financial context; consistent with the track being an AI hackathon on Razorpay's stack. |
| Model | A current Claude model sized for cost/latency balance — start with a fast/cheap tier for Tier-3 matching calls (high volume, simple judgement), and reserve a stronger model for the Q&A agent (low volume, needs deeper reasoning). | Model names change frequently — confirm the current recommended model IDs via Anthropic's documentation at build time rather than hardcoding one here. |
| Output format | Structured JSON responses (match/no-match, confidence, reason) via prompt-enforced schema | Machine-parseable without a fragile regex layer; matches the audit_log schema directly. |
| Cost control | Only unresolved rows after Tier 1 + Tier 2 reach the LLM (ADR-001); batch multiple candidate comparisons into fewer calls where possible. | Keeps live-demo latency and API spend predictable and small relative to total dataset size. |

## 3. Data storage

- SQLite for the hackathon build (ADR-004), file-based, zero setup.
- Schema written in portable SQL (see data model doc) so a Postgres migration later is a connection-string change.
- Money stored as integer paise (data model doc §7) — enforced at the ORM/model layer, not left to convention.

## 4. Frontend

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | React (Vite) | Fast dev server, minimal config, good fit for a small dashboard built quickly. |
| Styling | Tailwind CSS | Rapid, consistent styling without hand-rolling CSS under time pressure. |
| Charts | Recharts | Simple, good-looking charts for match rate / precision-recall / tier breakdown with minimal code. |
| Data fetching | Native fetch or a small wrapper (e.g. TanStack Query) against the REST API | Keeps the frontend decoupled and easy to point at mock data before the backend is ready, per ADR-005. |

## 5. Dev tooling and workflow

- Cursor / Antigravity as the primary AI pair-programmer for implementation — this stack doc, the ADR doc, the data model doc, and the API contract doc are the four files to feed it as grounding context before asking it to scaffold code.
- Git + GitHub for version control; commit the synthetic data generator's output seed/config, not the generated data files themselves, so the dataset is reproducible without bloating the repo.
- A `.env` file (gitignored) for the Claude API key and any config; a `.env.example` committed for teammates.
- Optional stretch: a docker-compose.yml bundling backend + frontend for one-command startup, useful if judges want to run it themselves — nice-to-have, not required.

## 6. Testing approach

- Unit tests on the matching engine's Tier 1 and Tier 2 logic against small, hand-constructed known cases (exact match, near-miss within tolerance, out-of-tolerance) — fast, deterministic, no API calls.
- A fixed small "golden set" (10–20 hand-labeled rows) used to sanity-check Tier 3 prompt behavior during development, separate from the tuning/holdout synthetic split.
- One full end-to-end smoke test: generate a small dataset, run the full pipeline, assert the API returns a completed run with sane metrics — catches integration breakage before a live demo.

## 7. Deployment for the demo

- Primary: run everything locally on the presenting laptop — zero network dependency risk beyond the Claude API calls themselves.
- Fallback: a pre-computed run cached to the database ahead of time, so the dashboard can be shown fully populated even if live API calls are skipped during the actual presentation window (see requirements doc, Risks table).
- If a hosted demo link is wanted, Render or Railway can host the FastAPI backend and a static host (Vercel/Netlify) the React build cheaply — treat as a stretch goal, not a dependency for judging.

## 8. Explicitly deferred (not needed to win this track)

- Authentication/authorization, multi-tenant data isolation, and rate limiting — irrelevant to a single-demo hackathon submission.
- A production task queue (Celery/RQ) — FastAPI background tasks are sufficient at hackathon data volumes.
- Postgres, container orchestration, or CI/CD pipelines — valuable later, not what wins a hackathon judged on a working demo and honest metrics.