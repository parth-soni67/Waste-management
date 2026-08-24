"""
WasteWise AI — Collection Verification Router
Endpoints for before/after evidence, AI visual clearance, and citizen resolution confirmation.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.ai.verification_service import (
    CollectionVerificationService,
    VerificationResult,
)
from app.core.security import TokenPayload, get_current_user, require_role

router = APIRouter()


class SubmitEvidenceRequest(BaseModel):
    incident_id: str
    before_image_urls: List[str] = []
    after_image_urls: List[str] = []
    incident_category: str = "mixed"
    estimated_volume_m3: float = 2.0


class CitizenConfirmRequest(BaseModel):
    incident_id: str
    confirmation: str  # "yes" | "no" | "partial"
    comment: Optional[str] = None


# In-memory tracking for demo (would be DB-backed in production)
_citizen_responses: dict = {}


@router.post("/submit-evidence", response_model=VerificationResult)
async def submit_collection_evidence(
    payload: SubmitEvidenceRequest,
    current_user: TokenPayload = Depends(require_role("driver", "officer", "admin")),
):
    """
    Driver submits post-collection evidence photos for AI visual-clearance comparison.
    """
    result = await CollectionVerificationService.verify_collection(
        incident_id=payload.incident_id,
        before_image_urls=payload.before_image_urls,
        after_image_urls=payload.after_image_urls,
        incident_category=payload.incident_category,
        estimated_volume_m3=payload.estimated_volume_m3,
    )
    return result


@router.post("/verify", response_model=VerificationResult)
async def verify_collection(
    payload: SubmitEvidenceRequest,
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """
    Officer manually triggers AI verification for an incident.
    """
    return await CollectionVerificationService.verify_collection(
        incident_id=payload.incident_id,
        before_image_urls=payload.before_image_urls,
        after_image_urls=payload.after_image_urls,
        incident_category=payload.incident_category,
        estimated_volume_m3=payload.estimated_volume_m3,
    )


@router.post("/citizen-confirm")
async def citizen_resolution_confirmation(
    payload: CitizenConfirmRequest,
    current_user: TokenPayload = Depends(require_role("citizen", "officer", "admin")),
):
    """
    Citizen confirms resolution: Yes / No / Partial.
    Two consecutive "No" responses reopen the incident with bumped priority.
    """
    inc_id = payload.incident_id

    if inc_id not in _citizen_responses:
        _citizen_responses[inc_id] = []

    _citizen_responses[inc_id].append(payload.confirmation.lower())

    # Count consecutive "no" responses
    no_count = sum(1 for r in _citizen_responses[inc_id] if r == "no")

    if no_count >= 2:
        return {
            "status": "reopened",
            "incident_id": inc_id,
            "message": f"Incident {inc_id} has been REOPENED with bumped priority due to {no_count} citizen rejections.",
            "new_priority": "P1",
            "action": "REOPEN_BUMPED",
        }
    elif payload.confirmation.lower() == "no":
        return {
            "status": "noted",
            "incident_id": inc_id,
            "message": "Your feedback has been recorded. If the issue persists, submit another rejection to escalate.",
            "no_count": no_count,
            "action": "FEEDBACK_RECORDED",
        }
    elif payload.confirmation.lower() == "partial":
        return {
            "status": "partial",
            "incident_id": inc_id,
            "message": "Partial resolution noted. The incident remains open for follow-up collection.",
            "action": "PARTIAL_RESOLUTION",
        }
    else:
        return {
            "status": "confirmed",
            "incident_id": inc_id,
            "message": "Thank you! Resolution confirmed. The incident has been marked as CLOSED.",
            "action": "CONFIRMED_CLOSED",
        }


@router.get("/{incident_id}")
async def get_verification_status(
    incident_id: str,
    current_user: TokenPayload = Depends(get_current_user),
):
    """Retrieve verification status and citizen feedback for an incident."""
    responses = _citizen_responses.get(incident_id, [])
    return {
        "incident_id": incident_id,
        "citizen_responses": responses,
        "no_count": sum(1 for r in responses if r == "no"),
        "is_reopened": sum(1 for r in responses if r == "no") >= 2,
    }
