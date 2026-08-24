import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchRoadRoute,
  RouteResult,
  formatRouteDistance,
  formatRouteEta,
  isVehicleOffRoute,
  computeHaversineDistance,
} from "../services/mapboxService";

export type RouteStatus =
  | "CALCULATING"
  | "OPTIMIZED_ROUTE"
  | "ROUTE_UPDATED"
  | "OFF_ROUTE"
  | "ARRIVED_AT_STOP"
  | "ROUTE_UNAVAILABLE"
  | "NO_DESTINATION";

export interface OptimizedRouteState {
  route: RouteResult | null;
  coordinates: [number, number][];
  distanceMeters: number | null;
  formattedDistance: string;
  durationSeconds: number | null;
  formattedEta: string;
  etaMinutes: number | null;
  status: RouteStatus;
  provider: "Mapbox" | "OSRM" | "Haversine" | "None";
  isArrived: boolean;
  isOffRoute: boolean;
  loading: boolean;
  error: boolean;
}

export function useRoute(
  driverLocation: { lat: number; lng: number } | null,
  targetLocation: { lat: number; lng: number } | null
) {
  const [state, setState] = useState<OptimizedRouteState>({
    route: null,
    coordinates: [],
    distanceMeters: null,
    formattedDistance: "Calculating...",
    durationSeconds: null,
    formattedEta: "Calculating...",
    etaMinutes: null,
    status: "NO_DESTINATION",
    provider: "None",
    isArrived: false,
    isOffRoute: false,
    loading: false,
    error: false,
  });

  const lastCalcOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastCalcTargetRef = useRef<{ lat: number; lng: number } | null>(null);

  const calculateRoute = useCallback(
    async (force = false) => {
      if (!driverLocation || !targetLocation) {
        setState((prev) => ({
          ...prev,
          route: null,
          coordinates: [],
          distanceMeters: null,
          formattedDistance: "No Destination",
          durationSeconds: null,
          formattedEta: "No Destination",
          etaMinutes: null,
          status: "NO_DESTINATION",
          provider: "None",
          isArrived: false,
          isOffRoute: false,
          loading: false,
          error: false,
        }));
        return;
      }

      // Check threshold: only calculate if forced, target changed, or origin moved > 30 meters
      const lastOrigin = lastCalcOriginRef.current;
      const lastTarget = lastCalcTargetRef.current;

      const targetChanged =
        !lastTarget ||
        Math.abs(lastTarget.lat - targetLocation.lat) > 0.0001 ||
        Math.abs(lastTarget.lng - targetLocation.lng) > 0.0001;

      const originMoved =
        !lastOrigin ||
        computeHaversineDistance(
          lastOrigin.lat,
          lastOrigin.lng,
          driverLocation.lat,
          driverLocation.lng
        ) > 30;

      if (!force && !targetChanged && !originMoved) {
        // Still check arrival proximity & off route
        const directDist = computeHaversineDistance(
          driverLocation.lat,
          driverLocation.lng,
          targetLocation.lat,
          targetLocation.lng
        );
        const arrived = directDist <= 150;
        const offRoute = state.coordinates.length > 0 && isVehicleOffRoute(driverLocation, state.coordinates, 120);

        if (arrived !== state.isArrived || offRoute !== state.isOffRoute) {
          setState((prev) => ({
            ...prev,
            isArrived: arrived,
            isOffRoute: offRoute,
            status: arrived ? "ARRIVED_AT_STOP" : offRoute ? "OFF_ROUTE" : prev.status,
          }));
        }
        return;
      }

      lastCalcOriginRef.current = driverLocation;
      lastCalcTargetRef.current = targetLocation;

      setState((prev) => ({ ...prev, loading: true, status: "CALCULATING" }));

      const res = await fetchRoadRoute(driverLocation, targetLocation);

      const directDistM = computeHaversineDistance(
        driverLocation.lat,
        driverLocation.lng,
        targetLocation.lat,
        targetLocation.lng
      );

      const arrived = directDistM <= 150;
      const providerName =
        res.source === "mapbox" ? "Mapbox" : res.source === "osrm" ? "OSRM" : "Haversine";

      const etaMins = Math.max(1, Math.round(res.durationSeconds / 60.0));

      setState({
        route: res,
        coordinates: res.coordinates,
        distanceMeters: res.distanceMeters,
        formattedDistance: formatRouteDistance(res.distanceMeters),
        durationSeconds: res.durationSeconds,
        formattedEta: formatRouteEta(res.durationSeconds),
        etaMinutes: etaMins,
        status: arrived ? "ARRIVED_AT_STOP" : res.error ? "ROUTE_UNAVAILABLE" : "OPTIMIZED_ROUTE",
        provider: providerName,
        isArrived: arrived,
        isOffRoute: false,
        loading: false,
        error: Boolean(res.error),
      });
    },
    [driverLocation, targetLocation, state.coordinates, state.isArrived, state.isOffRoute]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void calculateRoute();
    }, 150);
    return () => clearTimeout(timer);
  }, [calculateRoute]);

  return {
    ...state,
    recalculate: () => calculateRoute(true),
  };
}
