import logging
import traceback
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from sqlmodel import Session, select

from ..models.schemas import ReconciliationRun
from .ingestion import IngestionEngine
from .tier1_exact import Tier1ExactMatcher
from .tier2_fuzzy import Tier2FuzzyMatcher
from .tier3_ai import Tier3AIMatcher
from .exception_classifier import ExceptionClassifier
from .evaluator import EvaluationHarness

logger = logging.getLogger(__name__)


class ReconciliationPipeline:
    def __init__(self, run_id: str, dataset_version: str, split: str = "holdout"):
        self.run_id = run_id
        self.dataset_version = dataset_version
        self.split = split

    async def execute(self, session: Session) -> Dict[str, Any]:
        """Execute the full end-to-end reconciliation pipeline."""
        start_time_iso = datetime.now(timezone.utc).isoformat()

        # 1. Update or create run record
        run = session.exec(
            select(ReconciliationRun).where(ReconciliationRun.id == self.run_id)
        ).first()

        if not run:
            run = ReconciliationRun(
                id=self.run_id,
                dataset_version=self.dataset_version,
                split=self.split,
                started_at=start_time_iso,
                status="running",
            )
            session.add(run)
            session.commit()
            session.refresh(run)

        try:
            # 2. Ingestion
            ingest_engine = IngestionEngine(self.run_id, self.dataset_version, self.split)
            canonical_records = ingest_engine.ingest(session)
            total_records = len(canonical_records)

            if total_records == 0:
                raise ValueError(
                    f"No records found for dataset '{self.dataset_version}' with split '{self.split}'. Please generate data first."
                )

            # 3. Tier 1 - Exact Match
            tier1 = Tier1ExactMatcher(self.run_id)
            exact_groups, remaining_after_tier1 = tier1.match(session, canonical_records)

            # 4. Tier 2 - Fuzzy Match
            tier2 = Tier2FuzzyMatcher(self.run_id)
            fuzzy_groups, remaining_after_tier2 = tier2.match(session, remaining_after_tier1)

            # 5. Tier 3 - AI-Assisted Match
            tier3 = Tier3AIMatcher(self.run_id)
            ai_groups, remaining_after_tier3 = await tier3.match(session, remaining_after_tier2)

            # 6. Exception Classification
            classifier = ExceptionClassifier(self.run_id)
            exceptions = classifier.classify_and_save(session, remaining_after_tier3)

            # 7. Evaluation
            end_time_iso = datetime.now(timezone.utc).isoformat()
            evaluator = EvaluationHarness(self.run_id, self.dataset_version, self.split)
            eval_metrics = evaluator.evaluate(
                session, start_time_iso, end_time_iso, total_records
            )

            # 8. Update run record with final results
            run.completed_at = end_time_iso
            run.status = "completed"
            run.record_count = total_records
            run.match_rate = eval_metrics["match_rate"]
            run.precision = eval_metrics["precision"]
            run.recall = eval_metrics["recall"]
            run.throughput_rps = eval_metrics["throughput_rps"]
            run.exact_matches = len(exact_groups)
            run.fuzzy_matches = len(fuzzy_groups)
            run.ai_matches = len(ai_groups)
            run.exception_count = len(exceptions)

            session.add(run)
            session.commit()
            session.refresh(run)

            return {
                "run_id": self.run_id,
                "status": "completed",
                "record_count": total_records,
                "match_rate": run.match_rate,
                "precision": run.precision,
                "recall": run.recall,
                "throughput_rps": run.throughput_rps,
                "tier_breakdown": {
                    "exact": len(exact_groups),
                    "fuzzy": len(fuzzy_groups),
                    "ai_assisted": len(ai_groups),
                },
                "exception_count": len(exceptions),
            }

        except Exception as e:
            logger.error(f"Pipeline failed for run {self.run_id}: {e}\n{traceback.format_exc()}")
            run.status = "failed"
            run.completed_at = datetime.now(timezone.utc).isoformat()
            run.error_message = str(e)
            session.add(run)
            session.commit()
            raise
