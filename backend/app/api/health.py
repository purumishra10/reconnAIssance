from fastapi import APIRouter, Depends
from sqlmodel import Session, select, text

from ..core.config import settings
from ..core.database import get_session

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check(session: Session = Depends(get_session)):
    """Liveness & readiness probe."""
    try:
        session.exec(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {e}"

    return {
        "status": "healthy",
        "service": "reconnAIssance-api",
        "database": db_status,
        "llm_mode": settings.LLM_MODE,
        "gemini_configured": bool(settings.GEMINI_API_KEY),
    }
