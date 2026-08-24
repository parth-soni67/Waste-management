"""
WasteWise AI — Waste Hotspot Prediction Service
Source of truth: program_spec.md §4.6 & §8 (Demo Script Step 4)

Predicts geographic zones where waste accumulation will surge before citizen severity peaks.
Outputs spatial risk ratings (LOW, MEDIUM, HIGH, CRITICAL), accumulation probabilities, and peak windows.
"""

from typing import List

from pydantic import BaseModel, Field


class HotspotPrediction(BaseModel):
    id: str
    zone_name: str
    risk_level: str = Field(description="LOW, MEDIUM, HIGH, CRITICAL")
    accumulation_probability: float = Field(ge=0.0, le=1.0)
    center_lat: float
    center_lng: float
    radius_meters: int
    primary_waste_type: str
    peak_window: str
    recommended_truck_dispatch: str
    contributing_factors: List[str]


class HotspotPredictionService:
    """
    Spatial-Temporal Waste Accumulation Predictor for Gandhinagar / Ahmedabad regions.
    """

    PREDICTED_HOTSPOTS = [
        HotspotPrediction(
            id="HOT-01",
            zone_name="Sector 21 APMC Commercial Hub",
            risk_level="CRITICAL",
            accumulation_probability=0.89,
            center_lat=23.045,
            center_lng=72.550,
            radius_meters=350,
            primary_waste_type="Organic Biomass & Food Refuse",
            peak_window="06:30 - 09:30 AM (Daily Market Influx)",
            recommended_truck_dispatch="Deploy 1x 5T Tipper at 07:00 AM Proactively",
            contributing_factors=[
                "High wholesale market trade volume",
                "Historical 3.4x surge on Monday mornings",
                "Ambient temperature acceleration (36°C)",
            ],
        ),
        HotspotPrediction(
            id="HOT-02",
            zone_name="Sector 11 Commercial & Transit Corridor",
            risk_level="HIGH",
            accumulation_probability=0.78,
            center_lat=23.028,
            center_lng=72.574,
            radius_meters=300,
            primary_waste_type="Mixed Plastics & Packaging",
            peak_window="18:00 - 21:00 PM (Evening Footfall)",
            recommended_truck_dispatch="Pre-position Compactor Truck GJ-01-WM-4402",
            contributing_factors=[
                "Dense food truck & retail activity",
                "Bin capacity threshold breached at 17:30",
                "Previous weekend complaint recurrence: 82%",
            ],
        ),
        HotspotPrediction(
            id="HOT-03",
            zone_name="Sector 12 Hospital & Institutional Zone",
            risk_level="HIGH",
            accumulation_probability=0.74,
            center_lat=23.033,
            center_lng=72.586,
            radius_meters=250,
            primary_waste_type="Packaging & Bio-refuse",
            peak_window="13:00 - 15:00 PM",
            recommended_truck_dispatch="Schedule Dedicated Clearance at 14:00 PM",
            contributing_factors=[
                "Proximity to high-density medical facilities",
                "Sensitive public health buffer zone",
            ],
        ),
        HotspotPrediction(
            id="HOT-04",
            zone_name="Infocity IT Corridor & Food Court",
            risk_level="MEDIUM",
            accumulation_probability=0.55,
            center_lat=23.187,
            center_lng=72.628,
            radius_meters=400,
            primary_waste_type="Plastic Takeout & Beverage Containers",
            peak_window="19:30 - 22:00 PM",
            recommended_truck_dispatch="Include in Evening Route Pass",
            contributing_factors=[
                "Tech park lunch/dinner consumption cycle",
                "High recyclable fraction (64%)",
            ],
        ),
    ]

    @classmethod
    async def get_active_hotspots(cls) -> List[HotspotPrediction]:
        """Return forecasted municipal waste hotspots."""
        return cls.PREDICTED_HOTSPOTS
