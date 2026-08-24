"""
WasteWise AI — Vision AI Provider Factory
"""

import logging
from typing import Optional

from app.ai.providers.base import VisionProvider
from app.ai.providers.gemini_provider import GeminiVisionProvider
from app.core.config import settings

logger = logging.getLogger("wastewise.ai.factory")


def get_vision_provider() -> Optional[VisionProvider]:
    """
    Instantiate the configured Vision AI provider based on environment variables.
    Returns None if no API key is provided, signaling the caller to use deterministic fallback.
    """
    api_key = settings.LLM_API_KEY.strip() if settings.LLM_API_KEY else ""
    if not api_key:
        return None

    provider_type = (settings.LLM_PROVIDER or "gemini").strip().lower()
    model = (settings.LLM_MODEL or "gemini-3.6-flash").strip()

    if provider_type in ("gemini", "google", "default"):
        return GeminiVisionProvider(
            api_key=api_key,
            model=model,
            timeout_seconds=getattr(settings, "AI_TIMEOUT_SECONDS", 15.0),
        )

    logger.warning(
        f"Unknown LLM_PROVIDER '{provider_type}'. Falling back to heuristic engine."
    )
    return None
