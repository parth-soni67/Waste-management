"""
WasteWise AI — Abstract Base Vision Provider Interface
"""

from abc import ABC, abstractmethod
from typing import Optional

from app.schemas.all_schemas import WasteAnalysisResult


class VisionProvider(ABC):
    """
    Abstract Base Class for multi-modal Vision AI Providers.
    Accepts raw image bytes and optional metadata, returns structured WasteAnalysisResult.
    """

    @abstractmethod
    async def analyze_image(
        self,
        image_data: bytes,
        mime_type: str = "image/jpeg",
        hint_category: Optional[str] = None,
    ) -> WasteAnalysisResult:
        """
        Analyze image bytes using a multimodal vision model.

        :param image_data: Raw bytes of the image
        :param mime_type: Image MIME type (e.g. 'image/jpeg', 'image/png', 'image/webp')
        :param hint_category: Optional user-selected category hint
        :return: Validated WasteAnalysisResult instance
        """
        pass
