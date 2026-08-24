"""
WasteWise AI — Optimization & Dispatch Router
Endpoints for Vehicle Assignment Engine, Dynamic Route Optimization, Loop C triggers, and WebSockets.
"""

import uuid
from typing import Any, Dict, List

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.security import TokenPayload, require_role
from app.models.entities import Incident
from app.services.predictive_planning_service import (
    PredictivePlanningService,
    ProactiveDispatchPlan,
)
from app.services.routing_service import DynamicRouteOptimizer, OptimizedRoute
from app.services.vehicle_assignment_service import (
    AssignmentCandidate,
    VehicleAssignmentService,
)
from app.ws.live_ws import ws_manager

router = APIRouter()


class OptimizeRouteRequest(BaseModel):
    vehicle_id: str
    plate_number: str
    start_lat: float
    start_lng: float
    incidents: List[Dict[str, Any]]


class AssignVehicleRequest(BaseModel):
    incident_id: str


@router.post("/assign-vehicle", response_model=List[AssignmentCandidate])
async def recommend_vehicle_assignment(
    payload: AssignVehicleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """
    Vehicle Assignment Engine: Multi-factor best-fit scoring (capacity fit + type match + workload).
    """
    stmt = select(Incident).where(Incident.id == uuid.UUID(payload.incident_id))
    res = await db.execute(stmt)
    incident = res.scalar_one_or_none()

    if not incident:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found"
        )

    candidates = await VehicleAssignmentService.rank_candidate_vehicles(db, incident)
    return candidates


@router.post("/optimize-route", response_model=OptimizedRoute)
async def optimize_route(
    payload: OptimizeRouteRequest,
    current_user: TokenPayload = Depends(require_role("officer", "driver", "admin")),
):
    """
    Dynamic Route Optimization: Sequences multi-stop route with P0 priority insertion and TSP logic.
    """
    return DynamicRouteOptimizer.optimize_vehicle_route(
        vehicle_id=payload.vehicle_id,
        plate_number=payload.plate_number,
        start_lat=payload.start_lat,
        start_lng=payload.start_lng,
        incidents=payload.incidents,
    )


@router.post("/simulate-p0-emergency")
async def simulate_p0_emergency(
    db: AsyncSession = Depends(get_db),
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """
    Execute Loop C Runtime Loop:
    1. Injects a new P0 Emergency Incident mid-route.
    2. Dynamically recomputes route and inserts P0 stop at Stop #1.
    3. Broadcasts ROUTE_UPDATED event over WebSockets to live Officer & Driver screens.
    """
    # Sample P0 Emergency stop
    emergency_stop = {
        "id": f"INC-P0-{int(uuid.uuid4().hex[:4], 16)}",
        "title": "EMERGENCY: Hazardous Chemical Spill near Sector 12 Hospital",
        "priority": "P0",
        "lat": 23.033,
        "lng": 72.586,
        "estimated_load_kg": 650.0,
    }

    # Base active stops
    existing_stops = [
        {
            "id": "INC-8042",
            "title": "Plastic pile by Railway Depot",
            "priority": "P1",
            "lat": 23.018,
            "lng": 72.562,
            "estimated_load_kg": 420.0,
        },
        {
            "id": "INC-7994",
            "title": "Organic market waste spill",
            "priority": "P2",
            "lat": 23.045,
            "lng": 72.548,
            "estimated_load_kg": 600.0,
        },
    ]

    # Recompute route via dynamic optimizer
    recalculated = DynamicRouteOptimizer.optimize_vehicle_route(
        vehicle_id="TRK-01",
        plate_number="GJ-01-WM-4402",
        start_lat=23.025,
        start_lng=72.578,
        incidents=[emergency_stop] + existing_stops,
    )

    # Broadcast Loop C real-time payload
    await ws_manager.broadcast_event(
        event_type="LOOP_C_DYNAMIC_REROUTE",
        data={
            "alert": "P0 EMERGENCY DETECTED: Route Recalculated & Preempted",
            "inserted_stop": emergency_stop,
            "recalculated_route": recalculated.model_dump(),
        },
    )

    return {
        "status": "success",
        "message": "Loop C executed: P0 Emergency inserted, live route recomputed and broadcasted.",
        "recalculated_route": recalculated,
    }


@router.get("/predictive-plan", response_model=List[ProactiveDispatchPlan])
async def get_predictive_plan(
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """
    Predictive Collection Planning derived from hotspot forecasts.
    """
    return await PredictivePlanningService.generate_proactive_schedule()


@router.websocket("/ws")
async def websocket_live_channel(websocket: WebSocket):
    """
    Real-time WebSocket endpoint streaming live route recalculations and telemetry.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep-alive receive
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
