"""
WasteWise AI — Predictive Collection Planning Service
Source of truth: program_spec.md §4.7 & §8 (Demo Script Step 4)

Proactively recommends vehicle dispatch routes and departure times derived from
hotspot output BEFORE citizen complaints accumulate.
"""

from typing import List, Dict, Any
from pydantic import BaseModel
from app.ai.hotspot_service import HotspotPredictionService


class ProactiveDispatchPlan(BaseModel):
    plan_id: str
    target_zone: str
    recommended_time: str
    assigned_vehicle_type: str
    predicted_volume_m3: float
    expected_co2_reduction_kg: float
    urgency_reason: str


class PredictivePlanningService:
    @classmethod
    async def generate_proactive_schedule(cls) -> List[ProactiveDispatchPlan]:
        """
        Generate proactive pre-scheduled routes for upcoming peak accumulation windows.
        """
        hotspots = await HotspotPredictionService.get_active_hotspots()
        plans: List[ProactiveDispatchPlan] = []

        for idx, h in enumerate(hotspots, 1):
            if h.risk_level in ("CRITICAL", "HIGH"):
                plans.append(
                    ProactiveDispatchPlan(
                        plan_id=f"PLAN-PRO-{idx:02d}",
                        target_zone=h.zone_name,
                        recommended_time=h.peak_window,
                        assigned_vehicle_type="5T Compactor" if "Mixed" in h.primary_waste_type else "Tipper",
                        predicted_volume_m3=3.5 if h.risk_level == "CRITICAL" else 2.2,
                        expected_co2_reduction_kg=8.4,
                        urgency_reason=f"Prevent peak surge: {h.contributing_factors[0]}",
                    )
                )

        return plans
