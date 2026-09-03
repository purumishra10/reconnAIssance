from typing import Literal, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "reconnAIssance"
    API_V1_STR: str = ""
    GEMINI_API_KEY: Optional[str] = None
    DATABASE_URL: str = "sqlite:///./reconnaissance.db"
    LLM_MODE: Literal["live", "mock", "auto"] = "auto"
    # Tier-3 matching: mock is local/fast. Set live only if you want Gemini on every unmatched pair.
    LLM_MATCH_MODE: Literal["live", "mock"] = "mock"
    GEMINI_MODEL: str = "gemini-3.6-flash"

    # Default generator settings
    DEFAULT_SEED: int = 42
    DEFAULT_RECORD_COUNT: int = 2000
    DEFAULT_SPLIT_RATIO: float = 0.8

    # Tier 2 Matching Thresholds
    TIER2_AMOUNT_TOLERANCE_PCT: float = 0.025  # 2.5% fee+tax tolerance window
    TIER2_DATE_WINDOW_DAYS: int = 5
    TIER2_REF_SIMILARITY_THRESHOLD: float = 0.80
    TIER2_CONFIDENCE_FLOOR: float = 0.70  # Below this, defer to Tier 3


settings = Settings()
