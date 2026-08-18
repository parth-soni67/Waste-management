"""
WasteWise AI — Backend Configuration

Single source of truth for all backend settings.
Loaded from environment variables via Pydantic BaseSettings.
"""

from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
import json


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- Environment ---
    ENVIRONMENT: str = "local"

    # --- Database ---
    POSTGRES_USER: str = "wastewise"
    POSTGRES_PASSWORD: str = "changeme_dev"
    POSTGRES_DB: str = "wastewise"
    DATABASE_URL: str = "postgresql+asyncpg://wastewise:changeme_dev@postgres:5432/wastewise"

    # --- Redis ---
    REDIS_URL: str = "redis://redis:6379/0"

    # --- Auth / JWT ---
    SECRET_KEY: str = "changeme_generate_a_real_secret_key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # --- CORS ---
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v   

    # --- Routing Engine ---
    ROUTING_ENGINE_URL: str = "https://router.project-osrm.org"

    # --- AI/ML (populated in later phases) ---
    LLM_PROVIDER: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""

    # --- File Upload ---
    MAX_UPLOAD_SIZE_MB: int = 10
    MAX_IMAGES_PER_REPORT: int = 5
    UPLOAD_DIR: str = "uploads"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore",
    }

    @property
    def database_url_sync(self) -> str:
        """Sync database URL for Alembic migrations."""
        return self.DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql+psycopg2://"
        )


settings = Settings()
