# reconnAIssance 🔍

> **Multi-Source Financial Reconciliation Agent & Settlement Q&A**  
> *Razorpay Hackathon — Track 04: AI Finance Controller ("Run the books and the cash position")*

---

## 📌 Problem Overview

A merchant using **Razorpay** receives money through multiple touchpoints — direct checkouts, UPI, card rails, netbanking, and partial settlements. Before any money is confirmed as received in financial accounts, it passes through three independent records:

1. **Merchant Sales Ledger**: Gross sales records logged at checkout/order capture.
2. **Razorpay Settlement Reports**: Net payouts after deducting 2% MDR commissions, 18% GST on fees, and adjustments.
3. **Merchant Bank Statement**: Lump-sum credit batches containing UTR references and free-text narrations.

In real-world business operations, these three sources **almost never match cleanly** due to:
- **Timing Lags**: Orders captured on Day $T$ settle on Day $T+2$ or over weekends.
- **Deducted Fees & Taxes**: Payouts differ from gross order values after gateway fees and GST deductions.
- **Partial & Split Refunds**: Refunds issued before or after settlement cycles.
- **Bundled / Split Settlements**: Many orders bundled into a single bank credit batch (many-to-one) or split across cycles (one-to-many).
- **Human / OCR / Formatting Noise**: Typographical errors in reference IDs, casing drift, and messy bank narrations.

Finance and operations analysts traditionally spend hours manually cross-referencing spreadsheets to pair rows by hand. **reconnAIssance** automates this end-to-end with high throughput, rigorous accuracy, and complete audit explainability.

> [!NOTE]
> **Learning Note**: This manual matching process is called **Reconciliation** (*recon*) across corporate finance. Every business receiving payments across multiple channels performs reconciliation to ensure financial integrity and prevent cash leakages.

---

## ⚡ Key Features

- **🚀 3-Tier Intelligent Matching Engine**:
  - **Tier 1 (Exact Match)**: Deterministic, high-throughput vector matching on exact reference IDs.
  - **Tier 2 (Fuzzy Match)**: Fee-aware amount tolerances (2% commission + 18% GST), rolling date windows, and Levenshtein string similarity via `rapidfuzz`.
  - **Tier 3 (AI-Assisted Match)**: LLM reasoning on remaining ambiguous edge cases, generating confidence scores and human-readable explanations.
- **📊 Queryable Audit Trail & Explainability**: Every matched pair or flagged exception contains a traceable decision log explaining *why* it was classified.
- **💬 Settlement Q&A Agent**: Natural-language conversational interface answering operational queries (e.g., *"Why did settlement batch STL-2291 fall short of ₹50,000?"*) backed by cited audit log records.
- **🎯 Ground-Truth Evaluation & Measured Accuracy**: Built-in evaluation harness computing **Precision**, **Recall**, **Match Rate**, and **Throughput (records/sec)** against a strict **held-out** test dataset.
- **📥 Exception Management & Export**: Structured exception categorization (`AMOUNT_MISMATCH`, `NO_COUNTERPART_FOUND`, `DUPLICATE_SUSPECTED`) with one-click CSV export.

---

## 🏗️ Architecture & Data Flow

```mermaid
flowchart TD
    subgraph DataIngestion["1. Ingestion & Generation"]
        A1[Merchant Sales Ledger] --> N[Canonical Transaction Normalizer]
        A2[Razorpay Settlement Report] --> N
        A3[Bank Statement] --> N
    end

    subgraph Pipeline["2. Three-Tier Matching Engine"]
        N --> T1[Tier 1: Deterministic Exact Match]
        T1 -- Unmatched --> T2[Tier 2: Fuzzy & Fee-Tolerant Match]
        T2 -- Ambiguous --> T3[Tier 3: AI-Assisted LLM Match]
        
        T1 -- Matched --> MG[Match Groups & Multi-Way Bundles]
        T2 -- Matched --> MG
        T3 -- Matched --> MG
        T3 -- Unresolved --> EXC[Exceptions & Reason Categorizer]
    end

    subgraph StorageAndAudit["3. Storage & Audit"]
        T1 & T2 & T3 --> AL[(Audit Log)]
        MG --> DB[(SQLite / PostgreSQL Database)]
        EXC --> DB
        AL --> DB
    end

    subgraph Presentation["4. Interfaces & Consumption"]
        DB --> API[FastAPI Backend Service]
        API --> DASH[React + Tailwind + Recharts Dashboard]
        API --> QA[Settlement Q&A Agent / Claude API]
        API --> EVAL[Evaluation Harness: Precision / Recall / RPS]
    end
```

---

## 📂 Documentation

Detailed architectural blueprints, design decisions, and data contracts are available in [`docs/`](docs/):

| Document | Description |
| :--- | :--- |
| 📄 [**01. Requirements & Scope**](docs/01_Requirements_and_Scope.md) | Functional/non-functional requirements, acceptance criteria, personas, and scope boundaries. |
| 📄 [**02. Architecture Decision Document (ADR)**](docs/02_Architecture_Decision_Document.md) | Key architectural decisions (3-tier pipeline, SQLite-to-Postgres portability, held-out validation). |
| 📄 [**03. High-Level Design (HLD)**](docs/03_HLD_Skeleton.md) | Component responsibilities, primary data flow, error handling, and throughput considerations. |
| 📄 [**04. Data Model & Schema**](docs/04_Data_Model_and_Schema.md) | Database schema, canonical models, integer paise financial math, and relationship mappings. |
| 📄 [**05. API Contract**](docs/05_API_Contract.md) | REST API endpoint definitions, request/response schemas, query parameters, and error shapes. |
| 📄 [**06. Tech Stack & Infrastructure**](docs/06_Tech_Stack_and_Infrastructure.md) | Tooling choices (FastAPI, React, rapidfuzz, pandas, Claude API) and execution setup. |

---

## 🛠️ Technology Stack

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend** | Python 3.11+, FastAPI | High-performance async REST API and background execution. |
| **Data Engine** | `pandas`, `rapidfuzz` | High-throughput vectorized exact matching and Levenshtein similarity. |
| **Database** | SQLite (dev/demo) / PostgreSQL | Single-file portability with production-ready relational schema. |
| **AI / LLM** | Anthropic Claude API | Structured JSON inference for Tier-3 edge cases and Settlement Q&A. |
| **Frontend** | React (Vite), Tailwind CSS | Interactive dashboard with real-time filtering and metrics visualization. |
| **Visualizations** | Recharts | Match breakdown charts, precision/recall curves, and throughput gauges. |

---

## ⚙️ Getting Started

### Prerequisites
- Python 3.11 or higher
- Node.js 18+ & npm
- Anthropic API Key (for Tier-3 AI matching & Q&A)

### 1. Clone the Repository
```bash
git clone https://github.com/purumishra10/reconnAIssance.git
cd reconnAIssance
```

### 2. Backend Setup
```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn pandas rapidfuzz pydantic sqlalchemy anthropic

# Configure environment variables
cp .env.example .env
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 🎯 Evaluation & Track Success Bar

As required by the **Track 04 brief**, this project avoids cherry-picked demos by emphasizing:
- **Measured Accuracy**: Real Precision and Recall computed against an untouched held-out synthetic test set.
- **Target Throughput**: 2,000+ records processed end-to-end in < 60 seconds.
- **Honest Exception List**: Categorized, inspectable exceptions with clear diagnostic explanations.

---

## 📜 License

MIT License. Developed for the Razorpay Hackathon — Track 04.
