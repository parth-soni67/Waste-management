"""
WasteWise AI — AI & Intelligence API Router
Endpoints for Computer Vision analysis, Hotspot predictions, and Priority Engine triggers.
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import get_current_user, require_role, TokenPayload
from app.ai.cv_service import ComputerVisionService, WasteAnalysisResult
from app.ai.hotspot_service import HotspotPredictionService, HotspotPrediction
from app.services.priority_engine import DynamicPriorityEngine

router = APIRouter()


class AnalyzeImageRequest(BaseModel):
    image_url: Optional[str] = None
    hint_category: Optional[str] = None


@router.post("/analyze-image", response_model=WasteAnalysisResult)
async def analyze_waste_image(
    payload: AnalyzeImageRequest,
    current_user: TokenPayload = Depends(get_current_user),
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
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Analyze directly uploaded image file with MIME sniffing and size validation per security_guide.md §3.
    """
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 10MB limit",
        )

    result = await ComputerVisionService.analyze_image(
        image_data=contents,
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
