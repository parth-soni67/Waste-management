"""
WasteWise AI — AI & Intelligence API Router
Endpoints for Computer Vision analysis, Hotspot predictions, and Priority Engine triggers.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.cv_service import ComputerVisionService
from app.ai.hotspot_service import HotspotPrediction, HotspotPredictionService
from app.core.config import settings
from app.core.db import get_db
from app.core.security import TokenPayload, get_optional_user, require_role
from app.schemas.all_schemas import WasteAnalysisResult
from app.services.priority_engine import DynamicPriorityEngine

router = APIRouter()


def detect_image_mime_type(contents: bytes) -> Optional[str]:
    """
    Inspect magic bytes to validate image formats per security_guide.md §3.
    Supports JPEG, PNG, and WEBP.
    """
    if len(contents) < 12:
        return None
    if contents.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if contents.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if contents[:4] == b"RIFF" and contents[8:12] == b"WEBP":
        return "image/webp"
    return None


class AnalyzeImageRequest(BaseModel):
    image_url: Optional[str] = None
    hint_category: Optional[str] = None


@router.post("/analyze-image", response_model=WasteAnalysisResult)
async def analyze_waste_image(
    payload: AnalyzeImageRequest,
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """
    Computer Vision: Classify waste type, estimate volume (m³), and calculate severity score.
    Includes non-AI heuristic fallback path.
    """
    result = await ComputerVisionService.analyze_image(
        image_url=payload.image_url,
        hint_category=payload.hint_category,
    )
    return result


@router.post("/analyze-image-file", response_model=WasteAnalysisResult)
async def analyze_waste_image_file(
    file: UploadFile = File(...),
    hint_category: Optional[str] = Form(None),
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """
    Analyze directly uploaded image file with MIME sniffing and size validation per security_guide.md §3.
    Supports JPEG, PNG, and WEBP images.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty",
        )

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
        )

    mime_type = detect_image_mime_type(contents)
    if not mime_type:
        # Fallback check file content_type if sniffing needs extension hint or reject
        if file.content_type in ("image/jpeg", "image/png", "image/webp"):
            mime_type = file.content_type
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported image format. Allowed formats: JPEG, PNG, WEBP",
            )

    result = await ComputerVisionService.analyze_image(
        image_data=contents,
        mime_type=mime_type,
        hint_category=hint_category,
    )
    return result


@router.get("/hotspots", response_model=List[HotspotPrediction])
async def list_predicted_hotspots(
    current_user: TokenPayload = Depends(require_role("officer", "admin", "driver")),
):
    """
    Return predicted waste accumulation hotspots with risk ratings and peak windows.
    """
    return await HotspotPredictionService.get_active_hotspots()


@router.post("/recompute-priorities")
async def recompute_priorities(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """
    Manually trigger Dynamic Priority Engine to re-evaluate all active incidents.
    """
    updated_incidents = await DynamicPriorityEngine.recompute_all_active_incidents(db)
    return {
        "status": "success",
        "recomputed_count": len(updated_incidents),
        "message": f"Successfully recomputed priorities for {len(updated_incidents)} incidents.",
    }
