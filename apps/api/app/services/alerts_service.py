"""
WasteWise AI — Smart Alerts Service
Source of truth: program_spec.md §4.18

Generates structured alerts for citizens (status changes), officers
(critical incidents, hotspots, SLA violations), and AI-generated
proactive recommendations.
"""

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel


class SmartAlert(BaseModel):
    alert_id: str
    alert_type: (
        str  # "citizen_status" | "officer_critical" | "ai_proactive" | "sla_violation"
    )
    severity: str  # "info" | "warning" | "critical"
    title: str
    message: str
    target_role: str  # "citizen" | "officer" | "driver" | "all"
    target_user_id: Optional[str] = None
    related_incident_id: Optional[str] = None
    action_required: bool = False
    action_label: Optional[str] = None
    created_at: str


class AlertsService:
    @classmethod
    async def get_officer_alerts(cls) -> List[SmartAlert]:
        """Active alerts for the officer command center."""
        now = datetime.now(timezone.utc).isoformat()
        return [
            SmartAlert(
                alert_id="ALR-001",
                alert_type="officer_critical",
                severity="critical",
                title="P0 Emergency: Bio-hazard near Hospital",
                message="Hazardous waste detected within 200m of Civil Hospital pediatric wing. Immediate dispatch required.",
                target_role="officer",
                related_incident_id="INC-P0-9912",
                action_required=True,
                action_label="View & Dispatch",
                created_at=now,
            ),
            SmartAlert(
                alert_id="ALR-002",
                alert_type="sla_violation",
                severity="warning",
                title="SLA Breach: INC-8091 exceeds 2h target",
                message="Hazardous mixed waste at Sector 12 Civil Hospital Red Zone has exceeded P0 SLA of 2 hours. Currently at 2h 24m.",
                target_role="officer",
                related_incident_id="INC-8091",
                action_required=True,
                action_label="Escalate Priority",
                created_at=now,
            ),
            SmartAlert(
                alert_id="ALR-003",
                alert_type="ai_proactive",
                severity="warning",
                title="AI Prediction: Sector 21 approaching critical",
                message="Hotspot model forecasts 89% accumulation probability at APMC Market by 09:30 AM. Recommend pre-dispatching 5T Compactor by 06:00 AM.",
                target_role="officer",
                action_required=True,
                action_label="Schedule Pre-dispatch",
                created_at=now,
            ),
            SmartAlert(
                alert_id="ALR-004",
                alert_type="ai_proactive",
                severity="info",
                title="Route optimization saved 14.2 km today",
                message="Dynamic re-routing across 8 active vehicles reduced total distance by 14.2 km, saving an estimated 2.56L fuel and 6.86 kg CO₂.",
                target_role="officer",
                action_required=False,
                created_at=now,
            ),
        ]

    @classmethod
    async def get_citizen_alerts(cls, user_id: str = "demo") -> List[SmartAlert]:
        """Status change notifications for the citizen portal."""
        now = datetime.now(timezone.utc).isoformat()
        return [
            SmartAlert(
                alert_id="ALR-C01",
                alert_type="citizen_status",
                severity="info",
                title="Your report has been collected ✓",
                message="The waste issue you reported at Sector 11 Market has been collected by truck GJ-01-WM-4402. Please confirm resolution.",
                target_role="citizen",
                target_user_id=user_id,
                related_incident_id="INC-8091",
                action_required=True,
                action_label="Confirm Resolution",
                created_at=now,
            ),
            SmartAlert(
                alert_id="ALR-C02",
                alert_type="citizen_status",
                severity="info",
                title="AI Verification: 93% clearance confirmed",
                message="Our AI has verified the collection at your reported location with 93% clearance confidence. Status updated to VERIFIED.",
                target_role="citizen",
                target_user_id=user_id,
                related_incident_id="INC-7994",
                action_required=False,
                created_at=now,
            ),
        ]
