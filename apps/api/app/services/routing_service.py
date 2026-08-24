"""
WasteWise AI — Dynamic Route Optimization Service
Source of truth: program_spec.md §4.9 & §8 (Demo Script Steps 6-7)

Computes optimal multi-stop collection sequences, inserting P0/P1 emergencies dynamically
and calculating total distance, travel time, and polyline coordinates.
"""

from typing import Any, Dict, List

from pydantic import BaseModel

from app.services.clustering_service import haversine_distance_meters


class RouteStop(BaseModel):
    sequence: int
    incident_id: str
    title: str
    priority: str
    lat: float
    lng: float
    estimated_load_kg: float
    eta_minutes: int


class OptimizedRoute(BaseModel):
    vehicle_id: str
    plate_number: str
    stops: List[RouteStop]
    total_distance_km: float
    estimated_duration_minutes: int
    estimated_fuel_saved_liters: float
    co2_avoided_kg: float
    waypoints: List[List[float]]  # Array of [lng, lat] for MapLibre GeoJSON LineString


class DynamicRouteOptimizer:
    DISPOSAL_FACILITY = {
        "name": "Gandhinagar Solid Waste Processing Facility",
        "lat": 23.060,
        "lng": 72.535,
    }

    @classmethod
    def optimize_vehicle_route(
        cls,
        vehicle_id: str,
        plate_number: str,
        start_lat: float,
        start_lng: float,
        incidents: List[Dict[str, Any]],
    ) -> OptimizedRoute:
        """
        Sequence assigned incidents prioritizing P0 > P1 > shortest distance TSP.
        """
        # Separate by priority tiers
        p0_stops = [i for i in incidents if i.get("priority") == "P0"]
        p1_stops = [i for i in incidents if i.get("priority") == "P1"]
        routine_stops = [i for i in incidents if i.get("priority") not in ("P0", "P1")]

        # Sort routine stops by nearest neighbor
        curr_lat, curr_lng = start_lat, start_lng
        ordered_routine = []
        unvisited = list(routine_stops)

        while unvisited:
            unvisited.sort(
                key=lambda x: haversine_distance_meters(
                    curr_lat, curr_lng, x["lat"], x["lng"]
                )
            )
            next_stop = unvisited.pop(0)
            ordered_routine.append(next_stop)
            curr_lat, curr_lng = next_stop["lat"], next_stop["lng"]

        # Final ordered stop sequence: P0 -> P1 -> Routine
        final_sequence_raw = p0_stops + p1_stops + ordered_routine

        stops: List[RouteStop] = []
        waypoints: List[List[float]] = [[start_lng, start_lat]]
        total_dist_m = 0.0
        cumulative_mins = 0

        c_lat, c_lng = start_lat, start_lng
        for idx, inc in enumerate(final_sequence_raw, 1):
            d_m = haversine_distance_meters(c_lat, c_lng, inc["lat"], inc["lng"])
            total_dist_m += d_m
            leg_mins = max(3, int((d_m / 1000.0) * 2.5 + 5))
            cumulative_mins += leg_mins

            stops.append(
                RouteStop(
                    sequence=idx,
                    incident_id=inc.get("id", f"INC-{idx}"),
                    title=inc.get("title", "Waste Stop"),
                    priority=inc.get("priority", "P3"),
                    lat=inc["lat"],
                    lng=inc["lng"],
                    estimated_load_kg=inc.get("estimated_load_kg", 500.0),
                    eta_minutes=cumulative_mins,
                )
            )
            waypoints.append([inc["lng"], inc["lat"]])
            c_lat, c_lng = inc["lat"], inc["lng"]

        # Add Final Leg to Disposal Facility
        d_dump_m = haversine_distance_meters(
            c_lat, c_lng, cls.DISPOSAL_FACILITY["lat"], cls.DISPOSAL_FACILITY["lng"]
        )
        total_dist_m += d_dump_m
        waypoints.append([cls.DISPOSAL_FACILITY["lng"], cls.DISPOSAL_FACILITY["lat"]])
        cumulative_mins += max(5, int((d_dump_m / 1000.0) * 2.2))

        total_km = round(total_dist_m / 1000.0, 2)
        # Environmental impact estimates (SDG 11 & SDG 12)
        fuel_saved = round(
            total_km * 0.18, 2
        )  # ~18% dynamic optimization saving vs baseline
        co2_avoided = round(fuel_saved * 2.68, 2)  # 2.68 kg CO2 per liter diesel

        return OptimizedRoute(
            vehicle_id=vehicle_id,
            plate_number=plate_number,
            stops=stops,
            total_distance_km=total_km,
            estimated_duration_minutes=cumulative_mins,
            estimated_fuel_saved_liters=fuel_saved,
            co2_avoided_kg=co2_avoided,
            waypoints=waypoints,
        )
