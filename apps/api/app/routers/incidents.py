"""
WasteWise AI — Incidents & Reports Routers
Implements duplicate report clustering, dynamic priority engine integration, and PostgreSQL persistence.
"""

import math
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, or_, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


from app.core.db import get_db
from app.core.security import (
    TokenPayload,
    get_current_user,
    get_optional_user,
    require_role,
)
from app.services.notification_service import NotificationService
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
    DriverExecutionAssignmentInfo,
    DriverExecutionDriverInfo,
    DriverExecutionProofInfo,
    DriverExecutionResponse,
    ExecutionTimelineMilestone,
    IncidentRead,
    IncidentUpdate,
    OfficerRejectProofRequest,
    OfficerVerifyProofRequest,
    ReportCreate,
    ReportRead,
    ReportUpdate,
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


def _get_effective_report_status(report: Report) -> IncidentStatus:
    status_val = report.status
    if status_val in (IncidentStatus.VERIFIED, IncidentStatus.COMPLETED, IncidentStatus.CLOSED):
        return IncidentStatus.COMPLETED
    if status_val == IncidentStatus.REJECTED:
        return IncidentStatus.REJECTED

    if report.incident:
        inc_status = report.incident.status
        if inc_status in (IncidentStatus.VERIFIED, IncidentStatus.COMPLETED, IncidentStatus.CLOSED):
            return IncidentStatus.COMPLETED
        elif inc_status == IncidentStatus.REJECTED:
            return IncidentStatus.REJECTED
        elif inc_status == IncidentStatus.ASSIGNED and status_val == IncidentStatus.REPORTED:
            return IncidentStatus.ASSIGNED
        elif inc_status == IncidentStatus.UNDER_REVIEW and status_val == IncidentStatus.REPORTED:
            return IncidentStatus.UNDER_REVIEW
    return status_val


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

    result_list = []
    for r in reports:
        prio = r.incident.priority if r.incident else None
        eff_status = _get_effective_report_status(r)
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
            "status": eff_status,
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
        prio = r.incident.priority if r.incident else None
        eff_status = _get_effective_report_status(r)
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
            "status": eff_status,
            "priority": prio,
            "created_at": r.created_at,
        }
        result_list.append(ReportRead(**r_dict))
    return result_list


async def _resolve_report_by_id_string(db: AsyncSession, raw_id: str) -> Optional[Report]:
    clean_id = raw_id.strip()
    for prefix in ("REP-", "WW-", "INC-", "WM-"):
        if clean_id.upper().startswith(prefix):
            clean_id = clean_id[len(prefix):]
    # Remove priority suffix if appended (e.g. B96C4EDDP2 or B96C4EDD-P2)
    clean_id = re.sub(r'[-_]?P[0-4]$', '', clean_id, flags=re.IGNORECASE)

    # 1. Exact UUID match
    try:
        target_uuid = uuid.UUID(clean_id)
        stmt = select(Report).options(selectinload(Report.incident)).where(Report.id == target_uuid)
        res = await db.execute(stmt)
        rep = res.scalar_one_or_none()
        if rep:
            return rep
    except (ValueError, TypeError):
        pass

    # 2. Prefix or incident_id match
    clean_prefix = clean_id.lower()
    stmt = (
        select(Report)
        .options(selectinload(Report.incident))
        .where(
            or_(
                cast(Report.id, String).ilike(f"{clean_prefix}%"),
                cast(Report.incident_id, String).ilike(f"{clean_prefix}%"),
            )
        )
        .order_by(Report.created_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().first()


@reports_router.get("/{report_id}", response_model=ReportRead)
async def get_report_by_id(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Get report details by report ID (supports full UUID, short code prefix, or REP- prefix).
    """
    report = await _resolve_report_by_id_string(db, report_id)
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
    eff_status = _get_effective_report_status(report)
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
        "status": eff_status,
        "priority": prio,
        "created_at": report.created_at,
    }
    return ReportRead(**r_dict)


@reports_router.patch("/{report_id}", response_model=ReportRead)
async def update_report_status(
    report_id: str,
    payload: ReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role(UserRole.OFFICER, UserRole.ADMIN, UserRole.DRIVER)),
):
    """
    Officer updates citizen report status (REPORTED -> UNDER_REVIEW -> COMPLETED / REJECTED / ASSIGNED).
    Persists to PostgreSQL reports and incidents tables and broadcasts realtime update via WebSockets.
    """
    report = await _resolve_report_by_id_string(db, report_id)
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID '{report_id}' not found",
        )

    if payload.status is not None:
        raw_st = str(payload.status).upper()
        if raw_st in ("COMPLETED", "APPROVED", "VERIFIED") or payload.status in (IncidentStatus.COMPLETED, IncidentStatus.VERIFIED):
            target_st = IncidentStatus.COMPLETED
        elif raw_st in ("REJECTED", "DUPLICATE") or payload.status == IncidentStatus.REJECTED:
            target_st = IncidentStatus.REJECTED
        elif raw_st in ("UNDER_REVIEW", "ESCALATED") or payload.status == IncidentStatus.UNDER_REVIEW:
            target_st = IncidentStatus.UNDER_REVIEW
        else:
            target_st = payload.status

        report.status = target_st
        # Sync parent incident status if linked
        if report.incident:
            if target_st in (IncidentStatus.COMPLETED, IncidentStatus.VERIFIED, IncidentStatus.CLOSED):
                report.incident.status = IncidentStatus.VERIFIED
            elif target_st == IncidentStatus.REJECTED:
                report.incident.status = IncidentStatus.REJECTED
            elif target_st == IncidentStatus.ASSIGNED:
                report.incident.status = IncidentStatus.ASSIGNED


    if payload.officer_notes:
        report.recommended_action = f"Officer Note: {payload.officer_notes}"

    await db.commit()
    await db.refresh(report)

    # Broadcast WebSocket status sync event
    status_event = {
        "report_id": str(report.id),
        "incident_id": str(report.incident_id) if report.incident_id else None,
        "status": report.status.value if hasattr(report.status, "value") else str(report.status),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await ws_manager.broadcast_event("REPORT_STATUS_UPDATED", status_event)
        await ws_manager.broadcast_event("INCIDENT_STATUS_UPDATED", status_event)
    except Exception:
        pass

    prio = report.incident.priority if report.incident else None
    eff_status = _get_effective_report_status(report)
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
        "status": eff_status,
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
    stmt = select(Incident).options(selectinload(Incident.reports)).where(Incident.id == incident_id)
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

    # Synchronize attached reports in PostgreSQL database
    if inc.reports and payload.status is not None:
        for rep in inc.reports:
            # Preserve already completed, verified, or rejected report statuses
            if rep.status in (IncidentStatus.COMPLETED, IncidentStatus.VERIFIED, IncidentStatus.REJECTED):
                continue
            if payload.status in (IncidentStatus.COMPLETED, IncidentStatus.VERIFIED, IncidentStatus.CLOSED):
                rep.status = IncidentStatus.COMPLETED
            elif payload.status == IncidentStatus.REJECTED:
                rep.status = IncidentStatus.REJECTED
            elif payload.status == IncidentStatus.UNDER_REVIEW:
                rep.status = IncidentStatus.UNDER_REVIEW
            elif payload.status == IncidentStatus.ASSIGNED:
                rep.status = IncidentStatus.ASSIGNED

    inc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inc)

    # Broadcast WebSocket update
    try:
        await ws_manager.broadcast_event(
            "REPORT_STATUS_UPDATED",
            {
                "incident_id": str(inc.id),
                "status": inc.status.value if hasattr(inc.status, "value") else str(inc.status),
                "updated_at": inc.updated_at.isoformat(),
            },
        )
    except Exception:
        pass


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

    # Trigger Driver Notification if assigned
    if inc.assigned_driver_id and (
        payload.assigned_vehicle_id is not None
        or payload.assigned_driver_id is not None
        or payload.status == IncidentStatus.ASSIGNED
    ):
        try:
            plate = assigned_vehicle.plate_number if assigned_vehicle else None
            await NotificationService.notify_incident_assignment(
                db=db,
                incident=inc,
                driver_id=inc.assigned_driver_id,
                vehicle_plate=plate,
            )
        except Exception as e:
            pass

    return inc


# ---------------------------------------------------------------------------
# 5. Incident Driver Execution & Officer Proof Verification
# ---------------------------------------------------------------------------


def _haversine_distance_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    r = 6371e3
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * (
        math.sin(dl / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


async def _get_incident_by_id_or_code(
    db: AsyncSession,
    incident_id_param: str,
    options: Optional[list] = None,
) -> Optional[Incident]:
    """
    Look up an Incident by full UUID or code prefix (e.g., WW-32BC8B52 or 32BC8B52).
    """
    clean_id = str(incident_id_param).strip()
    if clean_id.upper().startswith(("WW-", "INC-", "WM-")):
        clean_id = clean_id.split("-", 1)[1]

    # 1. Try UUID match
    try:
        uuid_obj = uuid.UUID(clean_id)
        stmt = select(Incident).where(Incident.id == uuid_obj)
        if options:
            stmt = stmt.options(*options)
        res = await db.execute(stmt)
        inc = res.scalar_one_or_none()
        if inc:
            return inc
    except ValueError:
        pass

    # 2. Try prefix match on string representation of UUID
    from sqlalchemy import String, cast
    stmt_prefix = select(Incident).where(
        cast(Incident.id, String).ilike(f"{clean_id}%")
    )
    if options:
        stmt_prefix = stmt_prefix.options(*options)
    res_prefix = await db.execute(stmt_prefix)
    return res_prefix.scalars().first()


@incidents_router.get(
    "/{incident_id}/driver-execution", response_model=DriverExecutionResponse
)
async def get_driver_execution_details(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(get_current_user),
):
    """
    Retrieve comprehensive driver dispatch, live execution, proof-of-work, and audit timeline
    for an incident. Accessible to Officers, Drivers, and Admins.
    """
    inc = await _get_incident_by_id_or_code(
        db,
        incident_id,
        options=[
            selectinload(Incident.assigned_driver),
            selectinload(Incident.assigned_vehicle),
            selectinload(Incident.proofs),
            selectinload(Incident.reports),
        ],
    )

    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )

    # Driver Info
    driver_info = None
    if inc.assigned_driver:
        v_id = inc.assigned_vehicle.id if inc.assigned_vehicle else None
        v_plate = inc.assigned_vehicle.plate_number if inc.assigned_vehicle else None
        v_type = inc.assigned_vehicle.vehicle_type if inc.assigned_vehicle else None
        driver_info = DriverExecutionDriverInfo(
            id=inc.assigned_driver.id,
            name=inc.assigned_driver.full_name or inc.assigned_driver.email,
            email=inc.assigned_driver.email,
            phone=inc.assigned_driver.phone_number,
            vehicle_id=v_id,
            vehicle_plate=v_plate,
            vehicle_type=v_type,
        )

    # Elapsed minutes
    elapsed = None
    if inc.started_at:
        end_time = inc.completed_at or datetime.now(timezone.utc)
        elapsed = max(0, int((end_time - inc.started_at).total_seconds() / 60))

    assignment_info = DriverExecutionAssignmentInfo(
        status=inc.status.value,
        priority=inc.priority.value,
        assigned_at=inc.assigned_at,
        started_at=inc.started_at,
        completed_at=inc.completed_at,
        elapsed_minutes=elapsed,
    )

    # Citizen evidence URLs (strictly isolated to this incident's reports)
    citizen_evidence: List[str] = []
    if inc.reports:
        for rep in sorted(inc.reports, key=lambda r: r.created_at or inc.created_at):
            if rep.image_urls:
                citizen_evidence.extend(rep.image_urls)
    if not citizen_evidence and inc.image_urls:
        citizen_evidence.extend(inc.image_urls)
    distinct_citizen_evidence = list(dict.fromkeys(citizen_evidence))

    # Proof-of-work Info
    proof_info = None
    sorted_proofs = sorted(
        inc.proofs, key=lambda p: p.uploaded_at or inc.created_at, reverse=True
    )
    if sorted_proofs:
        latest_proof = sorted_proofs[0]
        dist_m = None
        is_verified_loc = True
        if latest_proof.latitude is not None and latest_proof.longitude is not None:
            dist_m = round(
                _haversine_distance_meters(
                    inc.latitude,
                    inc.longitude,
                    latest_proof.latitude,
                    latest_proof.longitude,
                ),
                1,
            )
            is_verified_loc = dist_m <= 250.0

        proof_info = DriverExecutionProofInfo(
            id=latest_proof.id,
            image_url=latest_proof.image_url,
            storage_path=latest_proof.storage_path,
            captured_at=latest_proof.captured_at or latest_proof.uploaded_at,
            uploaded_at=latest_proof.uploaded_at,
            latitude=latest_proof.latitude,
            longitude=latest_proof.longitude,
            accuracy=latest_proof.accuracy,
            distance_meters=dist_m,
            location_verified=is_verified_loc,
            verification_status=latest_proof.verification_status,
            notes=latest_proof.notes,
        )

    # Execution Timeline Milestones
    timeline: List[ExecutionTimelineMilestone] = []

    # 1. Incident Reported
    timeline.append(
        ExecutionTimelineMilestone(
            event="INCIDENT_REPORTED",
            timestamp=inc.created_at,
            actor="Citizen Reporter",
            notes=f"Reported at {inc.address_text or 'Municipal Sector'}",
        )
    )

    # 2. Driver Assigned
    if inc.assigned_at:
        d_name = (
            inc.assigned_driver.full_name if inc.assigned_driver else "Assigned Driver"
        )
        timeline.append(
            ExecutionTimelineMilestone(
                event="DRIVER_DISPATCHED",
                timestamp=inc.assigned_at,
                actor="Municipal Officer",
                notes=f"Dispatched to {d_name}",
            )
        )

    # 3. Collection Started
    if inc.started_at:
        d_name = inc.assigned_driver.full_name if inc.assigned_driver else "Driver"
        timeline.append(
            ExecutionTimelineMilestone(
                event="COLLECTION_STARTED",
                timestamp=inc.started_at,
                actor=d_name,
                notes="Driver arrived and initiated site clearance",
            )
        )

    # 4. Proof Uploaded
    if proof_info:
        d_name = inc.assigned_driver.full_name if inc.assigned_driver else "Driver"
        dist_note = (
            f" ({proof_info.distance_meters}m from site)"
            if proof_info.distance_meters is not None
            else ""
        )
        timeline.append(
            ExecutionTimelineMilestone(
                event="PROOF_UPLOADED",
                timestamp=proof_info.uploaded_at,
                actor=d_name,
                notes=f"Uploaded post-cleaning photo proof{dist_note}",
            )
        )

    # 5. Collection Completed
    if inc.completed_at:
        d_name = inc.assigned_driver.full_name if inc.assigned_driver else "Driver"
        timeline.append(
            ExecutionTimelineMilestone(
                event="COLLECTION_COMPLETED",
                timestamp=inc.completed_at,
                actor=d_name,
                notes="Driver marked collection completed",
            )
        )

    # 6. Verification Status Milestone
    if proof_info and proof_info.verification_status in (
        "VERIFIED",
        "REJECTED",
    ):
        timeline.append(
            ExecutionTimelineMilestone(
                event=f"PROOF_{proof_info.verification_status}",
                timestamp=inc.updated_at,
                actor="Municipal Officer",
                notes=proof_info.notes
                or f"Proof status marked as {proof_info.verification_status}",
            )
        )

    return DriverExecutionResponse(
        incident_id=inc.id,
        incident_code=f"WW-{str(inc.id)[:8].upper()}",
        title=inc.title,
        status=inc.status.value,
        priority=inc.priority.value,
        category=inc.category.value,
        latitude=inc.latitude,
        longitude=inc.longitude,
        address=inc.address_text,
        driver=driver_info,
        assignment=assignment_info,
        citizen_evidence_urls=distinct_citizen_evidence,
        proof=proof_info,
        timeline=timeline,
    )


@incidents_router.post("/{incident_id}/verify-proof")
async def verify_incident_proof(
    incident_id: str,
    payload: OfficerVerifyProofRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(
        require_role(["OFFICER", "ADMIN", "SUPERADMIN"])
    ),
):
    """
    Officer confirms and verifies the driver's uploaded proof of work.
    Transitions incident status to RESOLVED and broadcasts realtime confirmation.
    """
    inc = await _get_incident_by_id_or_code(
        db,
        incident_id,
        options=[
            selectinload(Incident.proofs),
            selectinload(Incident.assigned_driver),
            selectinload(Incident.reports),
        ],
    )

    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )

    if not inc.proofs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot verify: No proof of collection has been uploaded for this incident",
        )

    # Update latest proof status
    latest_proof = sorted(
        inc.proofs, key=lambda p: p.uploaded_at or inc.created_at, reverse=True
    )[0]
    latest_proof.verification_status = "VERIFIED"
    if payload.notes:
        latest_proof.notes = payload.notes

    # Transition incident status to VERIFIED and attached child reports to COMPLETED
    inc.status = IncidentStatus.VERIFIED
    if inc.reports:
        for rep in inc.reports:
            rep.status = IncidentStatus.COMPLETED

    inc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inc)

    # Broadcast real-time verification event
    try:
        status_event = {
            "incident_id": str(inc.id),
            "incident_code": f"WW-{str(inc.id)[:8].upper()}",
            "status": "COMPLETED",
            "proof_status": "VERIFIED",
            "verified_at": inc.updated_at.isoformat(),
            "verified_by": current_user.sub,
            "notes": payload.notes,
        }
        await ws_manager.broadcast_event(
            event_type="INCIDENT_VERIFIED",
            data=status_event,
        )
        await ws_manager.broadcast_event(
            event_type="REPORT_STATUS_UPDATED",
            data=status_event,
        )
    except Exception:
        pass

    # Notify Driver of Verification
    if inc.assigned_driver_id:
        try:
            await NotificationService.notify_proof_verified(
                db=db,
                driver_id=inc.assigned_driver_id,
                incident=inc,
                notes=payload.notes,
            )
        except Exception:
            pass

    return {
        "success": True,
        "incident_id": str(inc.id),
        "status": "VERIFIED",
        "proof_status": "VERIFIED",
        "verified_at": inc.updated_at.isoformat(),
        "notes": payload.notes,
    }


@incidents_router.post("/{incident_id}/reject-proof")
async def reject_incident_proof(
    incident_id: str,
    payload: OfficerRejectProofRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(
        require_role(["OFFICER", "ADMIN", "SUPERADMIN"])
    ),
):
    """
    Officer rejects the driver's uploaded proof photo with mandatory reason.
    Transitions incident status back to IN_PROGRESS so the driver can retake and re-upload.
    """
    inc = await _get_incident_by_id_or_code(
        db,
        incident_id,
        options=[
            selectinload(Incident.proofs),
            selectinload(Incident.assigned_driver),
            selectinload(Incident.reports),
        ],
    )

    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )

    if not inc.proofs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reject: No proof of collection has been uploaded for this incident",
        )

    latest_proof = sorted(
        inc.proofs, key=lambda p: p.uploaded_at or inc.created_at, reverse=True
    )[0]
    latest_proof.verification_status = "REJECTED"
    rejection_note = f"REJECTED: {payload.reason}"
    if payload.notes:
        rejection_note += f" — {payload.notes}"
    latest_proof.notes = rejection_note

    # Reset incident to IN_PROGRESS and attached reports to UNDER_REVIEW
    inc.status = IncidentStatus.IN_PROGRESS
    if inc.reports:
        for rep in inc.reports:
            rep.status = IncidentStatus.UNDER_REVIEW

    inc.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(inc)

    # Broadcast rejection event to Driver Cockpit & Officer CommandCenter
    try:
        status_event = {
            "incident_id": str(inc.id),
            "incident_code": f"WW-{str(inc.id)[:8].upper()}",
            "status": "UNDER_REVIEW",
            "proof_status": "REJECTED",
            "rejection_reason": payload.reason,
            "notes": payload.notes,
        }
        await ws_manager.broadcast_event(
            event_type="INCIDENT_PROOF_REJECTED",
            data=status_event,
        )
        await ws_manager.broadcast_event(
            event_type="REPORT_STATUS_UPDATED",
            data=status_event,
        )
    except Exception:
        pass

    # Notify Driver of Rejection
    if inc.assigned_driver_id:
        try:
            await NotificationService.notify_proof_rejected(
                db=db,
                driver_id=inc.assigned_driver_id,
                incident=inc,
                reason=payload.reason,
                notes=payload.notes,
            )
        except Exception:
            pass

    return {
        "success": True,
        "incident_id": str(inc.id),
        "status": "IN_PROGRESS",
        "proof_status": "REJECTED",
        "reason": payload.reason,
        "notes": payload.notes,
    }
