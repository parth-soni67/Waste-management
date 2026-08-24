"""
WasteWise AI — Vehicle Router
Endpoints for vehicle fleet management, status updates, available driver dispatch options,
and live GPS telemetry.
"""

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.core.security import TokenPayload, get_optional_user, require_role
from app.models.entities import User, UserRole, Vehicle, VehicleStatus
from app.schemas.all_schemas import (
    AvailableDriverVehicleRead,
    VehicleCreate,
    VehicleRead,
    VehicleUpdate,
)

router = APIRouter()


async def _ensure_default_drivers_linked(db: AsyncSession, vehicles: List[Vehicle]):
    """Ensure standard municipal fleet vehicles are linked to active drivers."""
    driver_stmt = (
        select(User).where(User.role == UserRole.DRIVER).order_by(User.created_at.asc())
    )
    driver_res = await db.execute(driver_stmt)
    drivers = driver_res.scalars().all()

    if not drivers:
        return

    updated = False
    for idx, v in enumerate(vehicles):
        if not v.driver_id:
            assigned_driver = drivers[idx % len(drivers)]
            v.driver_id = assigned_driver.id
            v.driver = assigned_driver
            updated = True

    if updated:
        await db.commit()


@router.get("", response_model=List[VehicleRead])
async def list_vehicles(
    status_filter: Optional[VehicleStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: Optional[TokenPayload] = Depends(get_optional_user),
):
    """List all vehicles in the municipal fleet with linked driver metadata."""
    stmt = select(Vehicle).options(selectinload(Vehicle.driver))
    if status_filter:
        stmt = stmt.where(Vehicle.status == status_filter)
    res = await db.execute(stmt)
    vehicles = list(res.scalars().all())

    # Link default drivers if unassigned
    await _ensure_default_drivers_linked(db, vehicles)

    results: List[VehicleRead] = []
    for v in vehicles:
        results.append(
            VehicleRead(
                id=v.id,
                plate_number=v.plate_number,
                vehicle_type=v.vehicle_type,
                capacity_kg=v.capacity_kg,
                current_load_kg=v.current_load_kg,
                status=v.status,
                current_lat=v.current_lat,
                current_lng=v.current_lng,
                driver_id=v.driver_id,
                driver_name=v.driver.full_name if v.driver else "Unassigned Driver",
                driver_email=v.driver.email if v.driver else None,
                driver_phone=v.driver.phone_number if v.driver else None,
                created_at=v.created_at,
                updated_at=v.updated_at,
            )
        )

    return results


@router.get("/available-drivers", response_model=List[AvailableDriverVehicleRead])
async def list_available_drivers_and_vehicles(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(
        require_role(UserRole.OFFICER, UserRole.ADMIN)
    ),
):
    """
    Returns list of municipal vehicles and their associated drivers available for dispatch.
    Used by Officer Dashboard to populate real driver assignment options.
    """
    stmt = (
        select(Vehicle)
        .options(selectinload(Vehicle.driver))
        .order_by(Vehicle.plate_number.asc())
    )
    res = await db.execute(stmt)
    vehicles = list(res.scalars().all())

    await _ensure_default_drivers_linked(db, vehicles)

    results: List[AvailableDriverVehicleRead] = []
    for v in vehicles:
        results.append(
            AvailableDriverVehicleRead(
                vehicle_id=v.id,
                plate_number=v.plate_number,
                vehicle_type=v.vehicle_type,
                capacity_kg=v.capacity_kg,
                current_load_kg=v.current_load_kg,
                status=v.status,
                driver_id=v.driver_id,
                driver_name=(
                    v.driver.full_name if v.driver else "Assigned Municipal Driver"
                ),
                driver_email=v.driver.email if v.driver else None,
                driver_phone=v.driver.phone_number if v.driver else None,
            )
        )
    return results


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def create_vehicle(
    payload: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(
        require_role(UserRole.ADMIN, UserRole.OFFICER)
    ),
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
    await db.commit()
    await db.refresh(new_vehicle)

    if new_vehicle.driver_id:
        driver_stmt = select(User).where(User.id == new_vehicle.driver_id)
        driver_res = await db.execute(driver_stmt)
        new_vehicle.driver = driver_res.scalar_one_or_none()

    return VehicleRead(
        id=new_vehicle.id,
        plate_number=new_vehicle.plate_number,
        vehicle_type=new_vehicle.vehicle_type,
        capacity_kg=new_vehicle.capacity_kg,
        current_load_kg=new_vehicle.current_load_kg,
        status=new_vehicle.status,
        current_lat=new_vehicle.current_lat,
        current_lng=new_vehicle.current_lng,
        driver_id=new_vehicle.driver_id,
        driver_name=new_vehicle.driver.full_name if new_vehicle.driver else None,
        driver_email=new_vehicle.driver.email if new_vehicle.driver else None,
        driver_phone=new_vehicle.driver.phone_number if new_vehicle.driver else None,
        created_at=new_vehicle.created_at,
        updated_at=new_vehicle.updated_at,
    )


@router.patch("/{vehicle_id}/status", response_model=VehicleRead)
async def update_vehicle_status(
    vehicle_id: uuid.UUID,
    payload: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(
        require_role(UserRole.DRIVER, UserRole.OFFICER, UserRole.ADMIN)
    ),
):
    """Update vehicle state machine status and load/location telemetry."""
    stmt = (
        select(Vehicle)
        .where(Vehicle.id == vehicle_id)
        .options(selectinload(Vehicle.driver))
    )
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
    if payload.driver_id is not None:
        vehicle.driver_id = payload.driver_id

    await db.commit()
    await db.refresh(vehicle)

    return VehicleRead(
        id=vehicle.id,
        plate_number=vehicle.plate_number,
        vehicle_type=vehicle.vehicle_type,
        capacity_kg=vehicle.capacity_kg,
        current_load_kg=vehicle.current_load_kg,
        status=vehicle.status,
        current_lat=vehicle.current_lat,
        current_lng=vehicle.current_lng,
        driver_id=vehicle.driver_id,
        driver_name=vehicle.driver.full_name if vehicle.driver else None,
        driver_email=vehicle.driver.email if vehicle.driver else None,
        driver_phone=vehicle.driver.phone_number if vehicle.driver else None,
        created_at=vehicle.created_at,
        updated_at=vehicle.updated_at,
    )
