import asyncio
import json
import logging
import os
import re
from typing import List, Dict, Any, Optional
from ..core.config import settings

logger = logging.getLogger(__name__)


class LLMClient:
    """Base interface for LLM operations."""

    async def match_candidates(self, pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def answer_question(
        self,
        question: str,
        context: Dict[str, Any],
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        raise NotImplementedError


ASSISTANT_SYSTEM = """You are the reconnAIssance in-app assistant. You ONLY discuss this product.

In scope: reconnAIssance UI/features, 3-tier recon (exact → fuzzy fee-tolerant → AI), merchant ledger vs Razorpay settlements vs bank credits, ~2% MDR + 18% GST on fee, T+2 lag, match/exception/audit data for the current run, precision/recall/match rate.

Out of scope: general knowledge, math puzzles, news, coding help, personal advice, or anything not about this app. Refuse in one short sentence and point the user back to recon topics.

Rules:
- Use the live run context for this-run facts. Never invent IDs, amounts, or metrics.
- If a fact is missing from context, say you do not have it.
- Keep answers short (a few sentences). Markdown is fine.
- Reply with plain text only (no JSON wrapper).
"""

OFF_TOPIC_REFUSAL = (
    "I only answer questions about **reconnAIssance** — this app's reconciliation pipeline, "
    "Razorpay fees and settlements, and the current run's metrics, matches, exceptions, and audit trail. "
    "Ask about those and I can help."
)

_SCOPE_TERMS = (
    "recon", "reconnaissance", "settlement", "razorpay", "mdr", "gst", "ledger",
    "exception", "match", "precision", "recall", "tier", "batch", "payout", "fee",
    "shortfall", "holdout", "held-out", "audit", "utr", "pipeline", "dataset",
    "fuzzy", "exact", "dashboard", "csv", "commission", "refund", "paise",
    "rupee", "throughput", "q&a", "qa agent", "matched group", "noise",
    "t+2", "t+1", "bank credit", "bank statement", "order id", "stl-", "ord-",
)


def question_in_product_scope(question: str) -> bool:
    q = (question or "").lower()
    if re.search(r"\b(stl|ord)-\d+", q):
        return True
    return any(term in q for term in _SCOPE_TERMS)


def _format_history(history: Optional[List[Dict[str, str]]]) -> str:
    if not history:
        return "(none)"
    lines = []
    for msg in history[-12:]:
        role = msg.get("role", "user")
        content = (msg.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines) if lines else "(none)"


def _parse_qa_payload(text: str) -> Optional[Dict[str, Any]]:
    cleaned = (text or "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict) and parsed.get("answer"):
            cited = parsed.get("cited_audit_log_ids") or []
            if not isinstance(cited, list):
                cited = []
            cited_ids = []
            for item in cited:
                try:
                    cited_ids.append(int(item))
                except (TypeError, ValueError):
                    continue
            return {"answer": str(parsed["answer"]), "cited_audit_log_ids": cited_ids}
    except (json.JSONDecodeError, TypeError):
        pass
    return {"answer": cleaned, "cited_audit_log_ids": []}


class MockLLMClient(LLMClient):
    """Deterministic offline fallback LLM client."""

    async def match_candidates(self, pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        decisions = []
        for pair in pairs:
            item_a = pair.get("item_a", {})
            item_b = pair.get("item_b", {})
            # Support both normalized payload fields and raw payload fields from tier3_ai.py
            ref_a = item_a.get("normalized_ref", "") or item_a.get("order_id", "") or item_a.get("order_ref", "")
            ref_b = item_b.get("normalized_ref", "") or item_b.get("order_id", "") or item_b.get("order_ref", "")
            amt_a = item_a.get("amount_paise", 0) or item_a.get("gross_amount_paise", 0) or item_a.get("net_amount_paise", 0)
            amt_b = item_b.get("amount_paise", 0) or item_b.get("net_amount_paise", 0) or item_b.get("gross_amount_paise", 0)

            # Heuristic calculation for mock AI evaluation
            # Calculate fee-adjusted tolerance
            expected_net = int(round(amt_a * 0.9764)) if amt_a > amt_b else int(round(amt_b * 0.9764))
            diff = abs(amt_a - amt_b) if abs(amt_a - amt_b) < 1000 else abs(min(amt_a, amt_b) - expected_net)
            amt_diff_pct = diff / max(amt_a, amt_b, 1)

            # Check ref similarity
            from rapidfuzz import fuzz
            ref_sim = fuzz.ratio(ref_a, ref_b) / 100.0

            if ref_sim >= 0.70 and amt_diff_pct < 0.08:
                confidence = round(0.72 + (ref_sim * 0.15) + (1.0 - amt_diff_pct) * 0.1, 2)
                confidence = min(0.95, confidence)
                decisions.append({
                    "match": True,
                    "confidence": confidence,
                    "reason": f"AI matched: Reference IDs '{ref_a}' and '{ref_b}' exhibit minor transposition/typo (similarity {ref_sim:.2f}); amount difference is consistent with standard fee deduction and tax structure.",
                })
            else:
                decisions.append({
                    "match": False,
                    "confidence": 0.35,
                    "reason": f"AI rejected: Significant discrepancy between reference IDs ('{ref_a}' vs '{ref_b}') or amount delta exceeding known fee schedules.",
                })
        return decisions

    async def answer_question(
        self,
        question: str,
        context: Dict[str, Any],
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        q_lower = question.lower()
        run_id = context.get("run_id", "current_run")
        metrics = context.get("metrics", {})
        recent_audits = context.get("audit_logs", [])
        exceptions = context.get("exceptions", [])
        cited_ids = [a.get("id") for a in recent_audits[:3] if a.get("id")]

        if not question_in_product_scope(question):
            return {"answer": OFF_TOPIC_REFUSAL, "cited_audit_log_ids": []}

        batch_match = re.search(r"(stl-\d+)", q_lower)
        order_match = re.search(r"(ord-\d+)", q_lower)

        if batch_match:
            batch_id = batch_match.group(1).upper()
            return {
                "answer": (
                    f"Settlement batch **{batch_id}** in run `{run_id}` is explained using the standard payout model: "
                    "gross sales minus **2% Razorpay MDR** and **18% GST on that fee**, plus any refunds or T+2 timing lag "
                    "before the bank credit lands. Check the matched-group drawer and audit trail for the exact members of that batch."
                ),
                "cited_audit_log_ids": cited_ids,
            }
        if order_match:
            order_id = order_match.group(1).upper()
            return {
                "answer": (
                    f"Order **{order_id}** is evaluated across the sales ledger, Razorpay settlement, and bank credit. "
                    "Gross ledger amount will not equal net payout after 2% MDR and 18% GST on the fee. "
                    "If it is still unmatched, it should appear under Exceptions with a reason code."
                ),
                "cited_audit_log_ids": cited_ids,
            }
        if any(k in q_lower for k in ("short", "difference", "deduct", "fee", "mdr", "gst")):
            return {
                "answer": (
                    "Payouts usually fall short of gross sales for three documented reasons: "
                    "(1) **2% Razorpay MDR** on gross value, (2) **18% GST on that commission**, and "
                    "(3) **refunds or T+2 settlement lag**. Those adjustments are written into match reasons and the audit log."
                ),
                "cited_audit_log_ids": cited_ids,
            }
        if any(k in q_lower for k in ("accuracy", "match rate", "precision", "recall", "metric")):
            mr = metrics.get("match_rate") or 0
            prec = metrics.get("precision") or 0
            rec = metrics.get("recall") or 0
            return {
                "answer": (
                    f"Run `{run_id}` scored **match rate {mr*100:.1f}%**, **precision {prec*100:.1f}%**, "
                    f"and **recall {rec*100:.1f}%** on the held-out split. "
                    f"Tier split: {metrics.get('exact_matches', 0)} exact, {metrics.get('fuzzy_matches', 0)} fuzzy, "
                    f"{metrics.get('ai_matches', 0)} AI-assisted, {metrics.get('exception_count', 0)} exceptions."
                ),
                "cited_audit_log_ids": cited_ids,
            }
        if "exception" in q_lower:
            sample = exceptions[:3]
            codes = ", ".join(sorted({e.get("reason_code", "?") for e in exceptions})) or "none listed"
            return {
                "answer": (
                    f"This run has **{metrics.get('exception_count', 0)}** unresolved exceptions. "
                    f"Reason codes present: {codes}. "
                    + (f"Example: {sample[0].get('reason_text')}" if sample else "")
                ),
                "cited_audit_log_ids": cited_ids,
            }

        return {
            "answer": (
                f"Run `{run_id}` processed **{metrics.get('record_count', 0)}** records: "
                f"{metrics.get('exact_matches', 0)} Tier 1 exact, {metrics.get('fuzzy_matches', 0)} Tier 2 fuzzy, "
                f"{metrics.get('ai_matches', 0)} Tier 3 AI, and {metrics.get('exception_count', 0)} exceptions remain. "
                "Ask about fees, a specific STL/ORD id, or precision/recall for more detail. "
                "For general (non-recon) questions, add a Gemini API key so the live assistant can answer freely."
            ),
            "cited_audit_log_ids": cited_ids,
        }


class GeminiClient(LLMClient):
    """Live Google Gemini API client (google-genai SDK)."""

    def __init__(self, api_key: str, model_name: str = "gemini-3.6-flash"):
        from google import genai
        from google.genai import types

        self.api_key = api_key
        self.model_name = model_name
        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=60_000),
        )

    def _generate_text(self, prompt: str, model_name: Optional[str] = None, for_qa: bool = False) -> str:
        from google.genai import types

        model = model_name or self.model_name
        try:
            cfg_kwargs = {
                "automatic_function_calling": types.AutomaticFunctionCallingConfig(disable=True),
            }
            if for_qa:
                cfg_kwargs["temperature"] = 0.2
                cfg_kwargs["max_output_tokens"] = 350
            config = types.GenerateContentConfig(**cfg_kwargs)
        except Exception:
            config = types.GenerateContentConfig(temperature=0.2, max_output_tokens=350) if for_qa else None

        kwargs = {"model": model, "contents": prompt}
        if config is not None:
            kwargs["config"] = config
        response = self.client.models.generate_content(**kwargs)
        return (getattr(response, "text", None) or "").strip()

    async def match_candidates(self, pairs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        prompt = """You are a senior financial reconciliation auditor for a merchant using Razorpay.
Evaluate the following candidate transaction pairs across independent financial records (internal sales ledger, Razorpay settlement, bank statement).

Context & Rules:
- Gross sales amounts differ from net settlements due to Razorpay commission (typically 2% MDR) and 18% GST on the commission.
- Settlement typically lags transaction date by 2 days (T+2).
- Typographical errors, case differences, or minor transposition in reference IDs can occur.
- Return a JSON array where each element contains:
  "match": boolean (true if these records describe the same transaction, false otherwise),
  "confidence": float between 0.0 and 1.0,
  "reason": brief, clear explanation of why they match or do not match.

Candidate Pairs to Evaluate:
"""
        for idx, p in enumerate(pairs):
            prompt += f"\nPair {idx + 1}:\n"
            prompt += f"Item A: {json.dumps(p.get('item_a', {}))}\n"
            prompt += f"Item B: {json.dumps(p.get('item_b', {}))}\n"

        prompt += "\nOutput ONLY valid JSON array with the exact number of elements corresponding to the pairs above. No extra markdown fences if possible."

        try:
            text = await asyncio.to_thread(self._generate_text, prompt)
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
            decisions = json.loads(text)
            if isinstance(decisions, list) and len(decisions) == len(pairs):
                return decisions
        except Exception as e:
            logger.warning(f"Gemini API matching call failed or returned invalid format: {e}. Falling back to mock heuristic.")

        mock = MockLLMClient()
        return await mock.match_candidates(pairs)

    async def answer_question(
        self,
        question: str,
        context: Dict[str, Any],
        history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        if not question_in_product_scope(question):
            return {"answer": OFF_TOPIC_REFUSAL, "cited_audit_log_ids": []}

        prompt = f"""{ASSISTANT_SYSTEM}

Run: {context.get('run_id')}
Metrics: {json.dumps(context.get('metrics', {}))}
Audit sample: {json.dumps(context.get('audit_logs', [])[:6])}
Exceptions sample: {json.dumps(context.get('exceptions', [])[:4])}
Recent chat:
{_format_history(history[-6:] if history else None)}

Question: {question}
"""
        try:
            text = await asyncio.to_thread(
                self._generate_text,
                prompt,
                "gemini-flash-lite-latest",
                True,
            )
            parsed = _parse_qa_payload(text)
            if parsed and parsed.get("answer"):
                return parsed
        except Exception as e:
            logger.warning(f"Gemini API Q&A call failed: {e}. Falling back to mock assistant.")

        mock = MockLLMClient()
        return await mock.answer_question(question, context, history)


def get_llm_client(purpose: str = "qa") -> LLMClient:
    """Factory to instantiate the appropriate LLM client.

    purpose='qa' uses Gemini when a key is configured.
    purpose='match' defaults to the local heuristic (fast). Set LLM_MATCH_MODE=live to call Gemini.
    """
    key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")

    if purpose == "match":
        if settings.LLM_MATCH_MODE == "live" and key:
            try:
                return GeminiClient(api_key=key, model_name=settings.GEMINI_MODEL)
            except Exception:
                return MockLLMClient()
        return MockLLMClient()

    mode = settings.LLM_MODE
    if mode == "mock":
        return MockLLMClient()
    if mode == "live" and key:
        return GeminiClient(api_key=key, model_name=settings.GEMINI_MODEL)
    if key:
        try:
            return GeminiClient(api_key=key, model_name=settings.GEMINI_MODEL)
        except Exception:
            return MockLLMClient()
    return MockLLMClient()
