"""
WasteWise AI — Gemini Multimodal Vision Provider
Source of truth: system_guide.md §4 & program_spec.md §4.2
"""

import base64
import json
import logging
import re
import uuid
from typing import Optional

import httpx

from app.ai.providers.base import VisionProvider
from app.schemas.all_schemas import WasteAnalysisResult

logger = logging.getLogger("wastewise.ai.gemini")

ALLOWED_CATEGORIES = {
    "mixed",
    "plastic",
    "organic",
    "construction",
    "e_waste",
    "hazardous",
    "paper",
    "metal",
    "glass",
    "other",
}

SYSTEM_INSTRUCTION = """You are WasteWise AI's specialized municipal Computer Vision engine for Smart India Hackathon 2026.
You are analyzing the exact municipal waste image provided in this request. Do not use example values. Do not assume the contents of previous requests. Determine all fields exclusively from the current image.

Analyze the provided image of municipal waste and return ONLY a valid JSON object matching the following specification:

{
  "category": "<one of: mixed, plastic, organic, construction, e_waste, hazardous, paper, metal, glass, other>",
  "confidence": <float from 0.0 to 1.0 representing classification confidence for this specific image>,
  "estimated_volume_m3": <float >= 0.1 representing estimated physical volume in cubic meters from the visible waste pile scale>,
  "severity_score": <float from 0.0 (minor litter) to 10.0 (critical accumulation/hazard)>,
  "detected_tags": [<list of 2 to 6 specific strings describing distinct items/materials visible in THIS image, e.g. "pet_bottles", "vegetable_peels", "concrete_rubble">],
  "recommended_action": "<specific actionable municipal dispatch action, e.g. 'Deploy 5-Tonne Compactor Truck within 2 Hours'>"
}

Guidelines:
- If hazardous or medical waste is observed, set severity_score >= 8.5 and category="hazardous".
- If large pile (>2m³) blocking street or drain, set severity_score >= 7.0.
- For organic/food market waste with decomposition risk, set category="organic".
- For discarded electronics/cables, set category="e_waste".
- For construction debris/rubble, set category="construction".
- For mixed street refuse, set category="mixed".
- Return pure JSON without extra conversational preamble or markdown code blocks.
"""


class GeminiVisionProvider(VisionProvider):
    """
    Multimodal Vision Provider using Google Gemini models (e.g. gemini-2.5-flash / gemini-1.5-flash).
    """

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.5-flash",
        timeout_seconds: float = 25.0,
    ):
        self.api_key = api_key
        self.model = model or "gemini-2.5-flash"
        self.timeout_seconds = timeout_seconds

    async def analyze_image(
        self,
        image_data: bytes,
        mime_type: str = "image/jpeg",
        hint_category: Optional[str] = None,
    ) -> WasteAnalysisResult:
        """
        Send image bytes to the Gemini generateContent API and parse structured analysis.
        """
        if not self.api_key:
            raise ValueError("Gemini API key is not configured")

        logger.info("AI provider selected: gemini")
        logger.info(f"AI model selected: {self.model}")
        logger.info("AI analysis started")

        b64_image = base64.b64encode(image_data).decode("utf-8")

        prompt = (
            "Analyze the attached municipal waste image and generate the structured JSON assessment. "
            "Determine all values strictly from the visual contents of this specific image."
        )
        if hint_category:
            prompt += f" Citizen provided category hint: '{hint_category}'."

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{SYSTEM_INSTRUCTION}\n\n{prompt}"},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": b64_image,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 1024,
                "responseMimeType": "application/json",
            },
        }

        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                logger.warning(
                    f"Gemini API returned non-200 status code: {response.status_code}"
                )
                raise RuntimeError(f"Gemini API error (status {response.status_code})")

            res_json = response.json()
            candidates = res_json.get("candidates", [])
            if not candidates:
                raise ValueError("Gemini returned empty candidates")

            content_parts = candidates[0].get("content", {}).get("parts", [])
            if not content_parts:
                raise ValueError("Gemini candidate has no content parts")

            raw_text = content_parts[0].get("text", "").strip()
            result = self._parse_and_validate_response(raw_text)
            logger.info("AI analysis completed")
            return result

    def _parse_and_validate_response(self, raw_text: str) -> WasteAnalysisResult:
        """
        Sanitize and validate raw AI response into WasteAnalysisResult.
        """
        # Remove potential markdown code fences ```json ... ```
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw_text, flags=re.MULTILINE)
        cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()

        data = json.loads(cleaned)

        raw_category = str(data.get("category", "mixed")).lower().strip()
        category = raw_category if raw_category in ALLOWED_CATEGORIES else "mixed"

        confidence = float(data.get("confidence", 0.90))
        confidence = max(0.0, min(1.0, confidence))

        volume = float(data.get("estimated_volume_m3", 1.5))
        volume = max(0.1, round(volume, 2))

        severity = float(data.get("severity_score", 5.0))
        severity = max(0.0, min(10.0, round(severity, 1)))

        raw_tags = data.get("detected_tags", [])
        if isinstance(raw_tags, list):
            detected_tags = [str(t).strip() for t in raw_tags if str(t).strip()]
        else:
            detected_tags = ["waste_accumulation"]

        recommended_action = str(
            data.get(
                "recommended_action",
                "Deploy municipal collection vehicle to location",
            )
        ).strip()
        if not recommended_action:
            recommended_action = "Deploy municipal collection vehicle to location"

        return WasteAnalysisResult(
            analysis_id=uuid.uuid4(),
            category=category,
            confidence=round(confidence, 2),
            estimated_volume_m3=volume,
            severity_score=severity,
            detected_tags=detected_tags,
            recommended_action=recommended_action,
            is_fallback=False,
        )
