"""
WasteWise AI — Vision AI & Computer Vision Service Test Suite
Validates multimodal AI provider abstraction, MIME sniffing, error fallbacks, and endpoint contracts.
"""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.ai.cv_service import ComputerVisionService
from app.ai.providers.base import VisionProvider
from app.main import app
from app.schemas.all_schemas import WasteAnalysisResult

# 1x1 Transparent PNG bytes
TINY_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

# Minimal JPEG bytes
TINY_JPEG_BYTES = (
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06"
    b"\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a"
    b"\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xda\x00\x08\x01\x01\x00\x00?\x00"
    b"\xbf\x00\xff\xd9"
)


class MockSuccessVisionProvider(VisionProvider):
    """Mock Vision Provider that simulates a successful Gemini multimodal inference."""

    async def analyze_image(
        self,
        image_data: bytes,
        mime_type: str = "image/jpeg",
        hint_category: str | None = None,
    ) -> WasteAnalysisResult:
        return WasteAnalysisResult(
            category="plastic",
            confidence=0.96,
            estimated_volume_m3=1.75,
            severity_score=7.8,
            detected_tags=["plastic_bottles", "polybags", "street_overflow"],
            recommended_action="Deploy 5-Tonne Compactor Truck within 2 Hours",
            is_fallback=False,
        )


class MockFailingVisionProvider(VisionProvider):
    """Mock Vision Provider that simulates an API network error or timeout."""

    async def analyze_image(
        self,
        image_data: bytes,
        mime_type: str = "image/jpeg",
        hint_category: str | None = None,
    ) -> WasteAnalysisResult:
        raise RuntimeError("External Vision API Timeout or Rate Limit")


@pytest.mark.asyncio
async def test_cv_service_heuristic_fallback_when_no_provider():
    """When no LLM API key is set, CV service should use heuristic fallback."""
    with patch("app.ai.cv_service.get_vision_provider", return_value=None):
        result = await ComputerVisionService.analyze_image(
            image_data=TINY_JPEG_BYTES,
            mime_type="image/jpeg",
            hint_category="plastic",
        )

        assert isinstance(result, WasteAnalysisResult)
        assert result.is_fallback is True
        assert result.category == "plastic"
        assert 0.0 <= result.confidence <= 1.0
        assert 0.0 <= result.severity_score <= 10.0
        assert result.estimated_volume_m3 >= 0.1
        assert len(result.detected_tags) > 0


@pytest.mark.asyncio
async def test_cv_service_with_successful_provider():
    """When provider succeeds, CV service returns real model result with is_fallback=False."""
    with patch(
        "app.ai.cv_service.get_vision_provider",
        return_value=MockSuccessVisionProvider(),
    ):
        result = await ComputerVisionService.analyze_image(
            image_data=TINY_PNG_BYTES,
            mime_type="image/png",
            hint_category=None,
        )

        assert isinstance(result, WasteAnalysisResult)
        assert result.is_fallback is False
        assert result.category == "plastic"
        assert result.confidence == 0.96
        assert result.severity_score == 7.8
        assert result.estimated_volume_m3 == 1.75
        assert "plastic_bottles" in result.detected_tags


@pytest.mark.asyncio
async def test_cv_service_failing_provider_falls_back_gracefully():
    """When provider throws an exception, CV service must catch it and return valid heuristic fallback."""
    with patch(
        "app.ai.cv_service.get_vision_provider",
        return_value=MockFailingVisionProvider(),
    ):
        result = await ComputerVisionService.analyze_image(
            image_data=TINY_JPEG_BYTES,
            mime_type="image/jpeg",
            hint_category="organic",
        )

        assert isinstance(result, WasteAnalysisResult)
        assert result.is_fallback is True
        assert result.category == "organic"
        assert result.confidence > 0.0


@pytest.mark.asyncio
async def test_api_analyze_image_file_valid_png():
    """POST /api/v1/ai/analyze-image-file with valid PNG bytes returns 200 and schema."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        files = {"file": ("test.png", TINY_PNG_BYTES, "image/png")}
        data = {"hint_category": "plastic"}
        response = await client.post(
            "/api/v1/ai/analyze-image-file", files=files, data=data
        )

        assert response.status_code == 200
        json_data = response.json()
        assert "category" in json_data
        assert "confidence" in json_data
        assert "estimated_volume_m3" in json_data
        assert "severity_score" in json_data
        assert "detected_tags" in json_data
        assert "recommended_action" in json_data
        assert "is_fallback" in json_data


@pytest.mark.asyncio
async def test_api_analyze_image_file_invalid_mime():
    """POST /api/v1/ai/analyze-image-file with non-image bytes should return 400 Bad Request."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        invalid_bytes = b"Hello, this is a plain text file pretending to be an image."
        files = {"file": ("malicious.txt", invalid_bytes, "text/plain")}
        response = await client.post("/api/v1/ai/analyze-image-file", files=files)

        assert response.status_code == 400
        assert "Unsupported image format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_api_analyze_image_file_empty():
    """POST /api/v1/ai/analyze-image-file with empty bytes returns 400."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        files = {"file": ("empty.jpg", b"", "image/jpeg")}
        response = await client.post("/api/v1/ai/analyze-image-file", files=files)

        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_api_analyze_image_json_endpoint():
    """POST /api/v1/ai/analyze-image with JSON payload returns 200 and schema."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {"hint_category": "hazardous"}
        response = await client.post("/api/v1/ai/analyze-image", json=payload)

        assert response.status_code == 200
        json_data = response.json()
        assert json_data["category"] == "hazardous"
        assert json_data["severity_score"] >= 8.0
