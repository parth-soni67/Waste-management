"""
WasteWise AI — Analytics & Environmental Impact Router
"""

from typing import List

from fastapi import APIRouter, Depends

from app.core.security import TokenPayload, require_role
from app.services.alerts_service import AlertsService, SmartAlert
from app.services.analytics_service import (
    AnalyticsService,
    DashboardPayload,
    EnvironmentalImpact,
)

router = APIRouter()


@router.get("/dashboard", response_model=DashboardPayload)
async def get_analytics_dashboard(
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """Full analytics dashboard with KPIs, trends, zone breakdown, and environmental impact."""
    return await AnalyticsService.get_dashboard()


@router.get("/environmental-impact", response_model=EnvironmentalImpact)
async def get_environmental_impact(
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """Environmental impact metrics aligned with SDG 11, 12, and 13."""
    return await AnalyticsService.get_environmental_impact()


@router.get("/alerts/officer", response_model=List[SmartAlert])
async def get_officer_alerts(
    current_user: TokenPayload = Depends(require_role("officer", "admin")),
):
    """Smart alerts for the officer command center."""
    return await AlertsService.get_officer_alerts()


@router.get("/alerts/citizen", response_model=List[SmartAlert])
async def get_citizen_alerts(
    current_user: TokenPayload = Depends(require_role("citizen", "officer", "admin")),
):
    """Status change notifications for citizens."""
    return await AlertsService.get_citizen_alerts()
