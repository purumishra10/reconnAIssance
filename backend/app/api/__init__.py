from fastapi import APIRouter
from .datasets import router as datasets_router
from .reconcile import router as reconcile_router
from .qa import router as qa_router
from .health import router as health_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(datasets_router)
api_router.include_router(reconcile_router)
api_router.include_router(qa_router)

__all__ = ["api_router"]
