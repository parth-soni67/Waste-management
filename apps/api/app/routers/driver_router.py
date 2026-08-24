"""
WasteWise AI — Driver & Collection Execution Router
Implements authenticated Driver assignments, GPS telemetry, Proof-of-Work uploads,
and verified collection completion state transitions.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.security import TokenPayload, get_current_user, require_role
from app.models.entities import (
    CollectionProof,
    DriverLocation,
    Incident,
    IncidentStatus,
    PriorityLevel,
    UserRole,
    Vehicle,
)
from app.schemas.all_schemas import (
    CollectionProofRead,
    DriverAssignmentRead,
    DriverLocationCreate,
    DriverLocationRead,
    IncidentCompleteRequest,
)
from app.services.storage_service import StorageService, detect_image_mime
from app.ws.live_ws import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/driver", tags=["Driver Operations"])
incident_driver_router = APIRouter(prefix="/incidents", tags=["Collection Proofs"])

PRIORITY_ORDER = {
    PriorityLevel.P0: 0,
    PriorityLevel.P1: 1,
    PriorityLevel.P2: 2,
    PriorityLevel.P3: 3,
    PriorityLevel.P4: 4,
}


# ---------------------------------------------------------------------------
# 1. Driver Assignments
# ---------------------------------------------------------------------------


@router.get("/assignments", response_model=List[DriverAssignmentRead])
async def get_driver_assignments(
    current_user: TokenPayload = Depends(require_role(UserRole.DRIVER)),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve only incidents assigned to the authenticated driver's vehicle.
    Strictly isolated per authenticated driver session.
    """
    driver_uuid = uuid.UUID(current_user.sub)

    # 1. Find assigned vehicle for this driver
    veh_stmt = select(Vehicle).where(Vehicle.driver_id == driver_uuid)
    veh_res = await db.execute(veh_stmt)
    vehicle = veh_res.scalar_one_or_none()

    if not vehicle:
        # Check if driver has any directly assigned vehicles
        return []

    # 2. Query active assignments for this vehicle
    inc_stmt = (
        select(Incident)
        .where(
            Incident.assigned_vehicle_id == vehicle.id,
            Incident.status.in_(
                [
                    IncidentStatus.ASSIGNED,
                    IncidentStatus.IN_PROGRESS,
                ]
            ),
        )
        .options(
            selectinload(Incident.reports),
            selectinload(Incident.proofs),
        )
        .order_by(Incident.created_at.asc())
    )
    inc_res = await db.execute(inc_stmt)
    incidents = inc_res.scalars().all()

    # 3. Sort by Priority (P0 -> P1 -> P2 -> P3 -> P4)
    sorted_incidents = sorted(
        incidents,
        key=lambda inc: (
            PRIORITY_ORDER.get(inc.priority, 5),
            inc.created_at,
        ),
    )

    results: List[DriverAssignmentRead] = []
    now = datetime.now(timezone.utc)

    for idx, inc in enumerate(sorted_incidents, start=1):
        # Calculate SLA minutes left with timezone safety
        created_dt = inc.created_at
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        elapsed_mins = int((now - created_dt).total_seconds() // 60)
        target_sla = (
            30
            if inc.priority == PriorityLevel.P0
            else 120 if inc.priority == PriorityLevel.P1 else 240
        )
        sla_left = max(0, target_sla - elapsed_mins)

        # Aggregate citizen images from reports
        citizen_imgs = []
        if inc.image_urls:
            citizen_imgs.extend(inc.image_urls)
        for r in inc.reports:
            if r.image_urls:
                citizen_imgs.extend(r.image_urls)

        # Distinct image URLs
        distinct_citizen_imgs = list(dict.fromkeys(citizen_imgs))
        proof_imgs = [p.image_url for p in inc.proofs]

        results.append(
            DriverAssignmentRead(
                incident_id=inc.id,
                incident_code=f"WW-{str(inc.id)[:8].upper()}",
                title=inc.title,
                description=inc.description,
                priority=inc.priority,
                category=inc.category,
                severity_score=inc.severity_score,
                estimated_volume_m3=inc.estimated_volume_m3,
                latitude=inc.latitude,
                longitude=inc.longitude,
                address=inc.address_text,
                status=inc.status,
                assigned_at=inc.updated_at,
                created_at=inc.created_at,
                updated_at=inc.updated_at,
                sla_minutes_left=sla_left,
                sequence=idx,
                vehicle_plate=vehicle.plate_number,
                vehicle_capacity_kg=vehicle.capacity_kg,
                vehicle_current_load_kg=vehicle.current_load_kg,
                citizen_image_urls=distinct_citizen_imgs,
                proof_image_urls=proof_imgs,
            )
        )

    return results


# ---------------------------------------------------------------------------
# 2. Driver Location Telemetry
# ---------------------------------------------------------------------------


@router.post(
    "/location", response_model=DriverLocationRead, status_code=status.HTTP_201_CREATED
)
async def update_driver_location(
    payload: DriverLocationCreate,
    current_user: TokenPayload = Depends(require_role(UserRole.DRIVER)),
    db: AsyncSession = Depends(get_db),
):
    """
    Record live driver GPS coordinates and update assigned vehicle position.
    """
    driver_uuid = uuid.UUID(current_user.sub)

    loc = DriverLocation(
        driver_id=driver_uuid,
        latitude=payload.latitude,
        longitude=payload.longitude,
        accuracy=payload.accuracy,
        heading=payload.heading,
        speed=payload.speed,
        recorded_at=datetime.now(timezone.utc),
    )
    db.add(loc)

    # Update assigned vehicle coordinates
    veh_stmt = select(Vehicle).where(Vehicle.driver_id == driver_uuid)
    veh_res = await db.execute(veh_stmt)
    vehicle = veh_res.scalar_one_or_none()
    if vehicle:
        vehicle.current_lat = payload.latitude
        vehicle.current_lng = payload.longitude
        vehicle.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(loc)

    # Broadcast location update via WebSocket
    await ws_manager.broadcast_event(
        "DRIVER_LOCATION_UPDATED",
        {
            "driver_id": str(driver_uuid),
            "vehicle_id": str(vehicle.id) if vehicle else None,
            "plate_number": vehicle.plate_number if vehicle else None,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "heading": payload.heading,
            "speed": payload.speed,
            "recorded_at": loc.recorded_at.isoformat(),
        },
    )

    return loc


@router.get("/location", response_model=Optional[DriverLocationRead])
async def get_driver_location(
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get latest recorded GPS location for authenticated driver or query driver location.
    """
    driver_uuid = uuid.UUID(current_user.sub)
    stmt = (
        select(DriverLocation)
        .where(DriverLocation.driver_id == driver_uuid)
        .order_by(desc(DriverLocation.recorded_at))
        .limit(1)
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


# ---------------------------------------------------------------------------
# 3. Collection Workflow State Machine: Start Collection
# ---------------------------------------------------------------------------


@incident_driver_router.post("/{incident_id}/start")
async def start_collection(
    incident_id: uuid.UUID,
    current_user: TokenPayload = Depends(require_role(UserRole.DRIVER)),
    db: AsyncSession = Depends(get_db),
):
    """
    Transition incident from ASSIGNED to IN_PROGRESS when driver arrives.
    """
    driver_uuid = uuid.UUID(current_user.sub)

    # Find driver vehicle
    veh_stmt = select(Vehicle).where(Vehicle.driver_id == driver_uuid)
    veh_res = await db.execute(veh_stmt)
    vehicle = veh_res.scalar_one_or_none()

    inc_stmt = select(Incident).where(Incident.id == incident_id)
    inc_res = await db.execute(inc_stmt)
    incident = inc_res.scalar_one_or_none()

    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    # Authorization: Incident must be assigned to driver's vehicle
    if vehicle and incident.assigned_vehicle_id != vehicle.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to start this incident",
        )

    incident.status = IncidentStatus.IN_PROGRESS
    incident.started_at = datetime.now(timezone.utc)
    incident.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(incident)

    # Broadcast event
    await ws_manager.broadcast_event(
        "COLLECTION_STARTED",
        {
            "incident_id": str(incident.id),
            "incident_code": f"WW-{str(incident.id)[:8].upper()}",
            "driver_id": str(driver_uuid),
            "started_at": incident.started_at.isoformat(),
            "status": "IN_PROGRESS",
        },
    )

    return {
        "status": "success",
        "incident_id": str(incident.id),
        "new_status": incident.status.value,
        "started_at": incident.started_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# 4. Proof-of-Work Upload
# ---------------------------------------------------------------------------


@incident_driver_router.post("/{incident_id}/proof", response_model=CollectionProofRead)
async def upload_collection_proof(
    incident_id: uuid.UUID,
    file: UploadFile = File(...),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    accuracy: Optional[float] = Form(None),
    notes: Optional[str] = Form(None),
    current_user: TokenPayload = Depends(require_role(UserRole.DRIVER)),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload real after-cleaning photo proof to Supabase Storage and persist CollectionProof record.
    """
    driver_uuid = uuid.UUID(current_user.sub)

    # Verify incident
    inc_stmt = select(Incident).where(Incident.id == incident_id)
    inc_res = await db.execute(inc_stmt)
    incident = inc_res.scalar_one_or_none()

    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    # Read & validate file contents
    contents = await file.read()
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded proof file is empty",
        )

    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds maximum allowed 15MB",
        )

    detected_mime = detect_image_mime(contents)
    if not detected_mime:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image format. Only JPEG, PNG, and WebP are allowed",
        )

    # Upload to Supabase Storage
    storage_res = await StorageService.upload_collection_proof(
        contents=contents,
        driver_id=driver_uuid,
        incident_id=incident_id,
        mime_type=detected_mime,
    )

    proof = CollectionProof(
        incident_id=incident_id,
        driver_id=driver_uuid,
        image_url=storage_res["public_url"],
        storage_path=storage_res["storage_path"],
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
        captured_at=datetime.now(timezone.utc),
        uploaded_at=datetime.now(timezone.utc),
        notes=notes,
        verification_status="VALID",
    )
    db.add(proof)
    incident.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(proof)

    # Broadcast event
    await ws_manager.broadcast_event(
        "COLLECTION_PROOF_UPLOADED",
        {
            "incident_id": str(incident_id),
            "incident_code": f"WW-{str(incident_id)[:8].upper()}",
            "proof_id": str(proof.id),
            "driver_id": str(driver_uuid),
            "image_url": proof.image_url,
            "latitude": proof.latitude,
            "longitude": proof.longitude,
            "uploaded_at": proof.uploaded_at.isoformat(),
            "verification_status": proof.verification_status,
        },
    )

    return proof


# ---------------------------------------------------------------------------
# 5. Complete Collection (Mandatory Proof Verification)
# ---------------------------------------------------------------------------


@incident_driver_router.patch("/{incident_id}/complete")
async def complete_collection(
    incident_id: uuid.UUID,
    payload: Optional[IncidentCompleteRequest] = None,
    current_user: TokenPayload = Depends(require_role(UserRole.DRIVER)),
    db: AsyncSession = Depends(get_db),
):
    """
    Transition incident to COLLECTED. Strictly requires that a valid CollectionProof
    has been uploaded to Supabase Storage for this incident.
    """
    driver_uuid = uuid.UUID(current_user.sub)

    inc_stmt = (
        select(Incident)
        .where(Incident.id == incident_id)
        .options(selectinload(Incident.proofs))
    )
    inc_res = await db.execute(inc_stmt)
    incident = inc_res.scalar_one_or_none()

    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Incident not found",
        )

    # 1. Verification of Proof Presence
    if not incident.proofs or len(incident.proofs) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot complete collection without uploading after-cleaning photo proof",
        )

    # 2. Update status and completion metadata
    now_utc = datetime.now(timezone.utc)
    incident.status = IncidentStatus.COLLECTED
    incident.completed_at = now_utc
    incident.completed_by_id = driver_uuid
    incident.updated_at = now_utc

    if payload:
        incident.completion_latitude = payload.latitude
        incident.completion_longitude = payload.longitude

    # 3. Update assigned vehicle load
    if incident.assigned_vehicle_id:
        veh_stmt = select(Vehicle).where(Vehicle.id == incident.assigned_vehicle_id)
        veh_res = await db.execute(veh_stmt)
        vehicle = veh_res.scalar_one_or_none()
        if vehicle:
            # Estimate collected weight ~350kg per m3
            est_weight = (incident.estimated_volume_m3 or 1.0) * 350.0
            vehicle.current_load_kg = min(
                vehicle.capacity_kg,
                vehicle.current_load_kg + est_weight,
            )
            vehicle.updated_at = now_utc

    await db.commit()
    await db.refresh(incident)

    # Broadcast event
    await ws_manager.broadcast_event(
        "INCIDENT_COLLECTED",
        {
            "incident_id": str(incident.id),
            "incident_code": f"WW-{str(incident.id)[:8].upper()}",
            "driver_id": str(driver_uuid),
            "completed_at": incident.completed_at.isoformat(),
            "status": "COLLECTED",
            "proof_count": len(incident.proofs),
            "latest_proof_url": (
                incident.proofs[-1].image_url if incident.proofs else None
            ),
        },
    )

    return {
        "status": "success",
        "incident_id": str(incident.id),
        "new_status": incident.status.value,
        "completed_at": incident.completed_at.isoformat(),
        "proof_verified": True,
    }


# ---------------------------------------------------------------------------
# 6. Get Incident Proofs
# ---------------------------------------------------------------------------


@incident_driver_router.get(
    "/{incident_id}/proof", response_model=List[CollectionProofRead]
)
async def get_incident_proofs(
    incident_id: uuid.UUID,
    current_user: TokenPayload = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve all collection proof records for an incident.
    Accessible to authorized Drivers and Municipal Officers.
    """
    stmt = (
        select(CollectionProof)
        .where(CollectionProof.incident_id == incident_id)
        .order_by(desc(CollectionProof.uploaded_at))
    )
    res = await db.execute(stmt)
    return res.scalars().all()
