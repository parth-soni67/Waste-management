"""
WasteWise AI — Vision AI Providers Package
"""

from app.ai.providers.base import VisionProvider
from app.ai.providers.factory import get_vision_provider

__all__ = ["VisionProvider", "get_vision_provider"]
