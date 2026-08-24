"""
WasteWise AI — Dynamic Priority Engine
Source of truth: program_spec.md §4.5 & §8 (Demo Script Step 3)

Recalculates incident priority dynamically based on:
1. Base severity & volume (CV output)
2. Clustered report count (citizen consensus)
3. Incident age (hours unresolved)
4. Waste category hazard level
5. Proximity to sensitive locations (Hospitals, Schools, Markets)
6. SLA deadline countdown
"""

import math
from datetime import datetime, timezone
from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.entities import Incident, PriorityLevel, WasteCategory


class DynamicPriorityEngine:
    # Sensitive locations in Gandhinagar / Ahmedabad for proximity scoring
    SENSITIVE_ZONES = [
        {
            "name": "Civil Hospital Sector 12",
            "lat": 23.033,
            "lng": 72.586,
            "radius_m": 400,
            "bonus": 25,
        },
        {
            "name": "Sector 11 Central School",
            "lat": 23.024,
            "lng": 72.572,
            "radius_m": 300,
            "bonus": 20,
        },
        {
            "name": "APMC Vegetable Market",
            "lat": 23.045,
            "lng": 72.550,
            "radius_m": 500,
            "bonus": 20,
        },
    ]

    @classmethod
    def calculate_priority_score(
        cls, incident: Incident
    ) -> Tuple[float, PriorityLevel, int]:
        """
        Compute continuous urgency score (0 - 100), PriorityLevel, and SLA remaining in minutes.
        """
        # 1. Base category hazard weight
        cat_weights = {
            WasteCategory.HAZARDOUS: 40.0,
            WasteCategory.ORGANIC: 25.0,
            WasteCategory.MIXED: 20.0,
            WasteCategory.PLASTIC: 15.0,
            WasteCategory.E_WASTE: 18.0,
            WasteCategory.CONSTRUCTION: 10.0,
        }
        base_score = cat_weights.get(incident.category, 15.0)

        # 2. Clustered Citizen Reports Factor (Logarithmic)
        # More citizens complaining -> higher consensus score
        report_bonus = 15.0 * math.log2(max(1, incident.report_count) + 1)

        # 3. Incident Age Factor (Penalty for hours unresolved)
        now = datetime.now(timezone.utc)
        created_at = incident.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)

        age_hours = (now - created_at).total_seconds() / 3600.0
        age_bonus = min(25.0, age_hours * 3.5)

        # 4. Volumetric Factor
        vol_bonus = min(15.0, (incident.estimated_volume_m3 or 1.5) * 4.0)

        # 5. Sensitive Zone Proximity
        sensitive_bonus = 0.0
        for zone in cls.SENSITIVE_ZONES:
            dlat = (incident.latitude - zone["lat"]) * 111000.0
            dlng = (
                (incident.longitude - zone["lng"])
                * 111000.0
                * math.cos(math.radians(incident.latitude))
            )
            dist = math.sqrt(dlat**2 + dlng**2)
            if dist <= zone["radius_m"]:
                sensitive_bonus += zone["bonus"]
                break

        # Total Raw Score
        raw_score = base_score + report_bonus + age_bonus + vol_bonus + sensitive_bonus
        final_score = min(100.0, max(0.0, raw_score))

        # Priority Level Mapping per design_guide.md & program_spec.md
        if final_score >= 80.0:
            priority = PriorityLevel.P0  # Emergency
            sla_mins = max(10, int(120 - age_hours * 60))
        elif final_score >= 65.0:
            priority = PriorityLevel.P1  # Very High
            sla_mins = max(20, int(240 - age_hours * 60))
        elif final_score >= 45.0:
            priority = PriorityLevel.P2  # High
            sla_mins = max(30, int(480 - age_hours * 60))
        elif final_score >= 25.0:
            priority = PriorityLevel.P3  # Normal
            sla_mins = max(60, int(1440 - age_hours * 60))
        else:
            priority = PriorityLevel.P4  # Low
            sla_mins = max(120, int(2880 - age_hours * 60))

        return final_score, priority, sla_mins

    @classmethod
    async def recompute_all_active_incidents(cls, db: AsyncSession) -> List[Incident]:
        """
        Re-evaluates all active incidents and updates their priority badges in the database.
        """
        stmt = select(Incident).where(
            Incident.status.in_(["REPORTED", "ASSIGNED", "IN_PROGRESS"])
        )
        res = await db.execute(stmt)
        incidents = res.scalars().all()

        updated = []
        for inc in incidents:
            score, new_priority, _ = cls.calculate_priority_score(inc)
            if inc.priority != new_priority:
                inc.priority = new_priority
                inc.updated_at = datetime.now(timezone.utc)
                updated.append(inc)

        if updated:
            await db.flush()

        return updated
