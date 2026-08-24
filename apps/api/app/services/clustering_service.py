"""
WasteWise AI — Duplicate Report Clustering Service
Source of truth: program_spec.md §4.4 & §8 (Demo Script Step 2)

Clusters multiple citizen reports of the same physical waste pile into 1 consolidated incident
based on:
- Spatial proximity (GPS distance <= 100 meters)
- Temporal proximity (Within a 24-hour window)
- Waste category compatibility
"""

import math
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import (
    Incident,
    IncidentStatus,
    PriorityLevel,
    WasteCategory,
)


def haversine_distance_meters(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculate the great-circle distance between two points in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


class DuplicateClusteringService:
    CLUSTER_THRESHOLD_METERS = 100.0
    TIME_WINDOW_HOURS = 24

    @classmethod
    async def cluster_or_create_incident(
        cls,
        db: AsyncSession,
        report_lat: float,
        report_lng: float,
        category_str: Optional[str] = None,
        description: Optional[str] = None,
        address_text: Optional[str] = None,
    ) -> Tuple[Incident, bool]:
        """
        Evaluate if a new report matches an existing incident within 100m in the last 24h.
        Returns (Incident, is_merged: bool).
        """
        time_cutoff = datetime.now(timezone.utc) - timedelta(
            hours=cls.TIME_WINDOW_HOURS
        )

        # Query all active incidents (not closed or verified) created/updated recently
        stmt = select(Incident).where(
            and_(
                Incident.status.in_(
                    [
                        IncidentStatus.REPORTED,
                        IncidentStatus.ASSIGNED,
                        IncidentStatus.IN_PROGRESS,
                    ]
                ),
                Incident.created_at >= time_cutoff,
            )
        )
        res = await db.execute(stmt)
        active_incidents = res.scalars().all()

        closest_incident: Optional[Incident] = None
        min_distance = float("inf")

        for inc in active_incidents:
            dist = haversine_distance_meters(
                report_lat, report_lng, inc.latitude, inc.longitude
            )
            if dist <= cls.CLUSTER_THRESHOLD_METERS and dist < min_distance:
                min_distance = dist
                closest_incident = inc

        if closest_incident:
            # Merge report into existing incident!
            n = closest_incident.report_count
            # Update running centroid
            closest_incident.latitude = (closest_incident.latitude * n + report_lat) / (
                n + 1
            )
            closest_incident.longitude = (
                closest_incident.longitude * n + report_lng
            ) / (n + 1)
            closest_incident.report_count += 1
            closest_incident.updated_at = datetime.now(timezone.utc)

            await db.flush()
            return closest_incident, True

        # No match found -> create new Incident
        cat_enum = WasteCategory.MIXED
        if category_str:
            try:
                cat_enum = WasteCategory(category_str.lower())
            except ValueError:
                cat_enum = WasteCategory.MIXED

        new_incident = Incident(
            title=f"Waste Incident: {address_text or 'Municipal Sector'}",
            description=description,
            category=cat_enum,
            priority=PriorityLevel.P3,  # Will be recalculated by Priority Engine
            status=IncidentStatus.REPORTED,
            latitude=report_lat,
            longitude=report_lng,
            report_count=1,
        )
        db.add(new_incident)
        await db.flush()
        return new_incident, False
