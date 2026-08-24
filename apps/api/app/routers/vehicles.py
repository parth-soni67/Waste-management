"""
WasteWise AI — Vehicle Router
Endpoints for vehicle fleet management, status updates, and live GPS telemetry.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import TokenPayload, get_optional_user, require_role
from app.models.entities import Vehicle, VehicleStatus
from app.schemas.all_schemas import VehicleCreate, VehicleRead, VehicleUpdate

router = APIRouter()


@router.get("", response_model=List[VehicleRead])
async def list_vehicles(
    status_filter: Optional[VehicleStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """List all vehicles in the municipal fleet. Auto-seeds default municipal fleet if table is empty."""
    stmt = select(Vehicle)
    if status_filter:
        stmt = stmt.where(Vehicle.status == status_filter)
    res = await db.execute(stmt)
    vehicles = list(res.scalars().all())

    if not vehicles and status_filter is None:
        seed_vehicles = [
            Vehicle(
                plate_number="GJ-01-WM-4402",
                vehicle_type="Compactor 5T",
                capacity_kg=5000.0,
                current_load_kg=2450.0,
                status=VehicleStatus.EN_ROUTE,
                current_lat=23.025,
                current_lng=72.578,
            ),
            Vehicle(
                plate_number="GJ-01-WM-9120",
                vehicle_type="Tipper 3T",
                capacity_kg=3000.0,
                current_load_kg=1100.0,
                status=VehicleStatus.COLLECTING,
                current_lat=23.042,
                current_lng=72.551,
            ),
            Vehicle(
                plate_number="GJ-01-WM-8820",
                vehicle_type="Mini Truck 1.5T",
                capacity_kg=1500.0,
                current_load_kg=0.0,
                status=VehicleStatus.AVAILABLE,
                current_lat=23.018,
                current_lng=72.562,
            ),
        ]
        for sv in seed_vehicles:
            db.add(sv)
        await db.flush()
        vehicles = seed_vehicles

    return vehicles


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    payload: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("admin", "officer")),
):
    """Register a new collection vehicle in the fleet."""
    new_vehicle = Vehicle(
        plate_number=payload.plate_number,
        vehicle_type=payload.vehicle_type,
        capacity_kg=payload.capacity_kg,
        driver_id=payload.driver_id,
        current_lat=payload.current_lat,
        current_lng=payload.current_lng,
        status=VehicleStatus.AVAILABLE,
    )
    db.add(new_vehicle)
    await db.flush()
    return new_vehicle


@router.patch("/{vehicle_id}/status", response_model=VehicleRead)
async def update_vehicle_status(
    vehicle_id: uuid.UUID,
    payload: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("driver", "officer", "admin")),
):
    """Update vehicle state machine status and load/location telemetry."""
    stmt = select(Vehicle).where(Vehicle.id == vehicle_id)
    res = await db.execute(stmt)
    vehicle = res.scalar_one_or_none()

    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found"
        )

    if payload.status is not None:
        vehicle.status = payload.status
    if payload.current_load_kg is not None:
        vehicle.current_load_kg = payload.current_load_kg
    if payload.current_lat is not None:
        vehicle.current_lat = payload.current_lat
    if payload.current_lng is not None:
        vehicle.current_lng = payload.current_lng

    await db.flush()
    return vehicle
