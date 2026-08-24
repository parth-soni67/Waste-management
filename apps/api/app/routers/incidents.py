"""
WasteWise AI — Incidents & Reports Routers
Implements duplicate report clustering, dynamic priority engine integration, and PostgreSQL persistence.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.security import (
    TokenPayload,
    get_current_user,
    get_optional_user,
    require_role,
)
from app.models.entities import (
    Incident,
    IncidentStatus,
    PriorityLevel,
    Report,
    User,
    UserRole,
    Vehicle,
    VehicleStatus,
)
from app.schemas.all_schemas import (
    IncidentRead,
    IncidentUpdate,
    ReportCreate,
    ReportRead,
)
from app.services.clustering_service import DuplicateClusteringService
from app.services.priority_engine import DynamicPriorityEngine
from app.ws.live_ws import ws_manager

# ---------------------------------------------------------------------------
# Reports Router
# ---------------------------------------------------------------------------
reports_router = APIRouter()


@reports_router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """
    Citizen submits a new waste report with AI analysis results & GPS coordinates.
    Persists report and clustered/created incident directly in PostgreSQL / Supabase:
    - If a report exists within 100m in the last 24h, merges into 1 incident and increments consensus count.
    - Evaluates priority via AI severity score + Dynamic Priority Engine (SLA & sensitive zones).
    - Commits transaction and broadcasts real-time event to Officer Command Center.
    """
    # 1. Cluster into existing incident or create a new one
    incident, is_merged = await DuplicateClusteringService.cluster_or_create_incident(
        db=db,
        report_lat=payload.latitude,
        report_lng=payload.longitude,
        category_str=payload.category,
        description=payload.description,
        address_text=payload.address_text,
        confidence=payload.confidence,
        estimated_volume_m3=payload.estimated_volume_m3,
        severity_score=payload.severity_score,
        detected_tags=payload.detected_tags,
        recommended_action=payload.recommended_action,
        image_urls=payload.image_urls,
    )

    # 2. Recalculate Dynamic Priority from AI severity & sensitive zones
    _, new_priority, _ = DynamicPriorityEngine.calculate_priority_score(incident)
    incident.priority = new_priority
    await db.flush()

    # 3. Create Report Record linked to the Incident
    user_id = None
    if current_user and current_user.sub:
        try:
            user_id = uuid.UUID(current_user.sub)
        except (ValueError, TypeError):
            user_id = None

    new_report = Report(
        user_id=user_id,
        incident_id=incident.id,
        category=payload.category,
        confidence=payload.confidence,
        severity_score=payload.severity_score,
        estimated_volume_m3=payload.estimated_volume_m3,
        detected_tags=payload.detected_tags or [],
        recommended_action=payload.recommended_action,
        description=payload.description,
        image_urls=payload.image_urls or [],
        latitude=payload.latitude,
        longitude=payload.longitude,
        address_text=payload.address_text,
        status=IncidentStatus.REPORTED,
    )
    db.add(new_report)
    await db.commit()
    await db.refresh(new_report)
    await db.refresh(incident)

    # 4. Broadcast Real-time WebSocket event to Officer Command Center
    try:
        await ws_manager.broadcast_event(
            event_type="NEW_INCIDENT_REPORTED",
            data={
                "incident_id": str(incident.id),
                "report_id": str(new_report.id),
                "title": incident.title,
                "category": incident.category.value,
                "priority": incident.priority.value,
                "severity_score": incident.severity_score,
                "latitude": incident.latitude,
                "longitude": incident.longitude,
                "address_text": incident.address_text,
                "created_at": (
                    incident.created_at.replace(tzinfo=timezone.utc).isoformat()
                    if incident.created_at.tzinfo is None
                    else incident.created_at.astimezone(timezone.utc).isoformat()
                ),
            },
        )
    except Exception:
        pass

    # Populate priority for response
    report_dict = {
        "id": new_report.id,
        "user_id": new_report.user_id,
        "incident_id": new_report.incident_id,
        "category": new_report.category,
        "confidence": new_report.confidence,
        "estimated_volume_m3": new_report.estimated_volume_m3,
        "severity_score": new_report.severity_score,
        "detected_tags": new_report.detected_tags,
        "recommended_action": new_report.recommended_action,
        "description": new_report.description,
        "image_urls": new_report.image_urls,
        "latitude": new_report.latitude,
        "longitude": new_report.longitude,
        "address_text": new_report.address_text,
        "status": new_report.status,
        "priority": incident.priority,
        "created_at": new_report.created_at,
    }
    return ReportRead(**report_dict)


@reports_router.get("", response_model=List[ReportRead])
async def list_reports(
    incident_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """
    List reports with strict database-level authorization.
    - Officers, Admins, and Drivers: view all municipal reports.
    - Citizens: view ONLY their own reports (WHERE reports.user_id = current_user.id).
    """
    stmt = (
        select(Report)
        .options(selectinload(Report.incident))
        .order_by(Report.created_at.desc())
    )
    if incident_id:
        stmt = stmt.where(Report.incident_id == incident_id)

    # Server-side RBAC & Citizen isolation at database query level
    if current_user and current_user.role == "citizen":
        try:
            user_uuid = uuid.UUID(current_user.sub)
            stmt = stmt.where(Report.user_id == user_uuid)
        except (ValueError, TypeError):
            return []

    res = await db.execute(stmt)
    reports = res.scalars().all()

    # Attach incident priority to response
    result_list = []
    for r in reports:
        prio = None
        if r.incident:
            prio = r.incident.priority
        r_dict = {
            "id": r.id,
            "user_id": r.user_id,
            "incident_id": r.incident_id,
            "category": r.category,
            "confidence": r.confidence,
            "estimated_volume_m3": r.estimated_volume_m3,
            "severity_score": r.severity_score,
            "detected_tags": r.detected_tags,
            "recommended_action": r.recommended_action,
            "description": r.description,
            "image_urls": r.image_urls,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "address_text": r.address_text,
            "status": r.status,
            "priority": prio,
            "created_at": r.created_at,
        }
        result_list.append(ReportRead(**r_dict))
    return result_list


@reports_router.get("/my", response_model=List[ReportRead])
async def list_my_reports(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """List reports submitted by the currently authenticated citizen."""
    stmt = (
        select(Report)
        .options(selectinload(Report.incident))
        .where(Report.user_id == uuid.UUID(current_user.sub))
        .order_by(Report.created_at.desc())
    )
    res = await db.execute(stmt)
    reports = res.scalars().all()
    result_list = []
    for r in reports:
        prio = None
        if r.incident:
            prio = r.incident.priority
        r_dict = {
            "id": r.id,
            "user_id": r.user_id,
            "incident_id": r.incident_id,
            "category": r.category,
            "confidence": r.confidence,
            "estimated_volume_m3": r.estimated_volume_m3,
            "severity_score": r.severity_score,
            "detected_tags": r.detected_tags,
            "recommended_action": r.recommended_action,
            "description": r.description,
            "image_urls": r.image_urls,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "address_text": r.address_text,
            "status": r.status,
            "priority": prio,
            "created_at": r.created_at,
        }
        result_list.append(ReportRead(**r_dict))
    return result_list


@reports_router.get("/{report_id}", response_model=ReportRead)
async def get_report_by_id(
    report_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Get report details by report ID.
    - Officers and Admins can view any municipal report.
    - Citizens can view ONLY their own report (returns 404 for other citizens' reports).
    """
    stmt = (
        select(Report)
        .options(selectinload(Report.incident))
        .where(Report.id == report_id)
    )
    res = await db.execute(stmt)
    report = res.scalar_one_or_none()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found",
        )

    if current_user.role == "citizen":
        try:
            user_uuid = uuid.UUID(current_user.sub)
            if report.user_id != user_uuid:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found",
                )
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found",
            )

    prio = report.incident.priority if report.incident else None
    r_dict = {
        "id": report.id,
        "user_id": report.user_id,
        "incident_id": report.incident_id,
        "category": report.category,
        "confidence": report.confidence,
        "estimated_volume_m3": report.estimated_volume_m3,
        "severity_score": report.severity_score,
        "detected_tags": report.detected_tags,
        "recommended_action": report.recommended_action,
        "description": report.description,
        "image_urls": report.image_urls,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "address_text": report.address_text,
        "status": report.status,
        "priority": prio,
        "created_at": report.created_at,
    }
    return ReportRead(**r_dict)


# ---------------------------------------------------------------------------
# Incidents Router
# ---------------------------------------------------------------------------
incidents_router = APIRouter()


@incidents_router.get("", response_model=List[IncidentRead])
async def list_incidents(
    priority: Optional[PriorityLevel] = None,
    status_filter: Optional[IncidentStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """
    List operational incidents from PostgreSQL.
    - Officers, Admins, and Drivers: view all active municipal incidents.
    - Citizens: view incidents associated with their own submitted reports.
    """
    stmt = select(Incident).order_by(Incident.created_at.desc())
    if priority:
        stmt = stmt.where(Incident.priority == priority)
    if status_filter:
        stmt = stmt.where(Incident.status == status_filter)

    if current_user and current_user.role == "citizen":
        try:
            user_uuid = uuid.UUID(current_user.sub)
            stmt = (
                stmt.join(Report, Report.incident_id == Incident.id)
                .where(Report.user_id == user_uuid)
                .distinct()
            )
        except (ValueError, TypeError):
            return []

    res = await db.execute(stmt)
    return res.scalars().all()


@incidents_router.get("/{incident_id}", response_model=IncidentRead)
async def get_incident(
    incident_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """
    Fetch single incident details by ID.
    - Officers and Admins can view any municipal incident.
    - Citizens can view ONLY incidents containing at least one of their own reports.
    """
    stmt = (
        select(Incident)
        .options(selectinload(Incident.reports))
        .where(Incident.id == incident_id)
    )
    res = await db.execute(stmt)
    inc = res.scalar_one_or_none()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )

    if current_user and current_user.role == "citizen":
        try:
            user_uuid = uuid.UUID(current_user.sub)
            user_report_exists = any(
                r.user_id == user_uuid for r in (inc.reports or [])
            )
            if not user_report_exists:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Incident not found",
                )
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Incident not found",
            )

    return inc


@incidents_router.patch("/{incident_id}", response_model=IncidentRead)
async def update_incident(
    incident_id: uuid.UUID,
    payload: IncidentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(
        require_role(UserRole.OFFICER, UserRole.ADMIN, UserRole.DRIVER)
    ),
):
    """Officer updates incident priority, assignment, or status with PostgreSQL persistence."""
    stmt = select(Incident).where(Incident.id == incident_id)
    res = await db.execute(stmt)
    inc = res.scalar_one_or_none()

    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )

    assigned_vehicle = None
    if payload.assigned_vehicle_id is not None:
        veh_stmt = (
            select(Vehicle)
            .where(Vehicle.id == payload.assigned_vehicle_id)
            .options(selectinload(Vehicle.driver))
        )
        veh_res = await db.execute(veh_stmt)
        assigned_vehicle = veh_res.scalar_one_or_none()
        if not assigned_vehicle:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned vehicle not found",
            )
        inc.assigned_vehicle_id = assigned_vehicle.id
        assigned_vehicle.status = VehicleStatus.ASSIGNED

        # Auto-resolve driver from vehicle if not explicitly supplied
        if payload.assigned_driver_id is None and assigned_vehicle.driver_id:
            inc.assigned_driver_id = assigned_vehicle.driver_id

    if payload.assigned_driver_id is not None:
        driver_stmt = select(User).where(
            User.id == payload.assigned_driver_id, User.role == UserRole.DRIVER
        )
        driver_res = await db.execute(driver_stmt)
        driver = driver_res.scalar_one_or_none()
        if not driver:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned driver account not found",
            )
        inc.assigned_driver_id = driver.id
        if assigned_vehicle and not assigned_vehicle.driver_id:
            assigned_vehicle.driver_id = driver.id

    # If assigning vehicle/driver, record metadata
    if (
        payload.assigned_vehicle_id is not None
        or payload.assigned_driver_id is not None
        or payload.status == IncidentStatus.ASSIGNED
    ):
        inc.assigned_at = datetime.now(timezone.utc)
        if current_user and current_user.sub:
            try:
                inc.assigned_by_id = uuid.UUID(current_user.sub)
            except Exception:
                pass
        if inc.status == IncidentStatus.REPORTED:
            inc.status = IncidentStatus.ASSIGNED

    if payload.title is not None:
        inc.title = payload.title
    if payload.description is not None:
        inc.description = payload.description
    if payload.priority is not None:
        inc.priority = payload.priority
    if payload.status is not None:
        inc.status = payload.status
    if payload.estimated_volume_m3 is not None:
        inc.estimated_volume_m3 = payload.estimated_volume_m3
    if payload.severity_score is not None:
        inc.severity_score = payload.severity_score
    if payload.recommended_action is not None:
        inc.recommended_action = payload.recommended_action

    inc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inc)

    # Broadcast events
    try:
        if inc.status in [IncidentStatus.ASSIGNED, IncidentStatus.IN_PROGRESS]:
            await ws_manager.broadcast_event(
                event_type="INCIDENT_ASSIGNED",
                data={
                    "incident_id": str(inc.id),
                    "incident_code": f"WW-{str(inc.id)[:8].upper()}",
                    "title": inc.title,
                    "priority": inc.priority.value,
                    "category": inc.category.value,
                    "latitude": inc.latitude,
                    "longitude": inc.longitude,
                    "address": inc.address_text,
                    "driver_id": (
                        str(inc.assigned_driver_id) if inc.assigned_driver_id else None
                    ),
                    "vehicle_id": (
                        str(inc.assigned_vehicle_id)
                        if inc.assigned_vehicle_id
                        else None
                    ),
                    "plate_number": (
                        assigned_vehicle.plate_number if assigned_vehicle else None
                    ),
                    "assigned_at": (
                        inc.assigned_at.isoformat()
                        if inc.assigned_at
                        else datetime.now(timezone.utc).isoformat()
                    ),
                    "status": inc.status.value,
                },
            )
        await ws_manager.broadcast_event(
            event_type="INCIDENT_UPDATED",
            data={
                "incident_id": str(inc.id),
                "status": inc.status.value,
                "priority": inc.priority.value,
                "assigned_vehicle_id": (
                    str(inc.assigned_vehicle_id) if inc.assigned_vehicle_id else None
                ),
                "assigned_driver_id": (
                    str(inc.assigned_driver_id) if inc.assigned_driver_id else None
                ),
            },
        )
    except Exception:
        pass

    return inc
