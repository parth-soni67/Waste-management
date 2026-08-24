"""
WasteWise AI — Incidents & Reports Routers
Implements duplicate report clustering and dynamic priority engine integration.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import TokenPayload, get_current_user, require_role
from app.models.entities import (
    Incident,
    IncidentStatus,
    PriorityLevel,
    Report,
)
from app.schemas.all_schemas import (
    IncidentRead,
    IncidentUpdate,
    ReportCreate,
    ReportRead,
)
from app.services.clustering_service import DuplicateClusteringService
from app.services.priority_engine import DynamicPriorityEngine

# ---------------------------------------------------------------------------
# Reports Router
# ---------------------------------------------------------------------------
reports_router = APIRouter()


@reports_router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Citizen submits a new waste report with images & GPS coordinates.
    Runs spatial-temporal duplicate clustering:
    - If a report exists within 100m in the last 24h, merges into 1 incident and increments consensus count.
    - Recalculates dynamic priority P0-P4 immediately.
    """
    # 1. Cluster into existing incident or create a new one
    incident, is_merged = await DuplicateClusteringService.cluster_or_create_incident(
        db=db,
        report_lat=payload.latitude,
        report_lng=payload.longitude,
        category_str=payload.category,
        description=payload.description,
        address_text=payload.address_text,
    )

    # 2. Recalculate Dynamic Priority
    _, new_priority, _ = DynamicPriorityEngine.calculate_priority_score(incident)
    incident.priority = new_priority
    await db.flush()

    # 3. Create Report Record
    new_report = Report(
        user_id=uuid.UUID(current_user.sub),
        incident_id=incident.id,
        category=payload.category,
        description=payload.description,
        image_urls=payload.image_urls,
        latitude=payload.latitude,
        longitude=payload.longitude,
        address_text=payload.address_text,
        status=IncidentStatus.REPORTED,
    )
    db.add(new_report)
    await db.flush()

    return new_report


@reports_router.get("/my", response_model=List[ReportRead])
async def list_my_reports(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """List reports submitted by the currently authenticated citizen (IDOR-safe)."""
    stmt = (
        select(Report)
        .where(Report.user_id == uuid.UUID(current_user.sub))
        .order_by(Report.created_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()


# ---------------------------------------------------------------------------
# Incidents Router
# ---------------------------------------------------------------------------
incidents_router = APIRouter()


@incidents_router.get("", response_model=List[IncidentRead])
async def list_incidents(
    priority: Optional[PriorityLevel] = None,
    status_filter: Optional[IncidentStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("officer", "admin", "driver")),
):
    """List operational incidents with priority & status filters."""
    stmt = select(Incident).order_by(Incident.created_at.desc())
    if priority:
        stmt = stmt.where(Incident.priority == priority)
    if status_filter:
        stmt = stmt.where(Incident.status == status_filter)
    res = await db.execute(stmt)
    return res.scalars().all()


@incidents_router.patch("/{incident_id}", response_model=IncidentRead)
async def update_incident(
    incident_id: uuid.UUID,
    payload: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """Officer updates incident priority, assignment, or status."""
    stmt = select(Incident).where(Incident.id == incident_id)
    res = await db.execute(stmt)
    inc = res.scalar_one_or_none()

    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )

    if payload.priority is not None:
        inc.priority = payload.priority
    if payload.status is not None:
        inc.status = payload.status
    if payload.assigned_vehicle_id is not None:
        inc.assigned_vehicle_id = payload.assigned_vehicle_id

    await db.flush()
    return inc
