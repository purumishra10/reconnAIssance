import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.database import create_db_and_tables
from .api import api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reconnAIssance")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing reconnAIssance database and tables...")
    create_db_and_tables()
    logger.info(f"reconnAIssance ready! LLM Mode: {settings.LLM_MODE}")
    yield


app = FastAPI(
    title="reconnAIssance API",
    description="Multi-Source Financial Reconciliation Engine & Settlement Q&A (Razorpay Hackathon Track 04)",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "project": "reconnAIssance",
        "tagline": "Multi-Source Financial Reconciliation Agent & Settlement Q&A",
        "docs": "/docs",
        "status": "online",
    }
