import { useState, useEffect, useCallback, useRef } from "react";

export interface VehicleTelemetry {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null; // in km/h
  heading: number | null; // in degrees 0-360
  timestamp: number;
  status: "active" | "acquiring" | "unavailable" | "fallback";
}

// Default Municipal Fleet Fallback Position (Gandhinagar Sector 12 Municipal Depot)
const FALLBACK_LOCATION = {
  latitude: 23.2245,
  longitude: 72.645,
};

export function useVehicleLocation(
  apiUrl?: string,
  getAuthHeaders?: () => Record<string, string>
) {
  const [telemetry, setTelemetry] = useState<VehicleTelemetry>({
    latitude: FALLBACK_LOCATION.latitude,
    longitude: FALLBACK_LOCATION.longitude,
    accuracy: null,
    speed: 0,
    heading: 0,
    timestamp: Date.now(),
    status: "acquiring",
  });

  const lastSyncedRef = useRef<{ lat: number; lng: number } | null>(null);

  const syncBackendLocation = useCallback(
    async (lat: number, lng: number, acc: number | null, heading: number | null, speed: number | null) => {
      if (!apiUrl || !getAuthHeaders) return;
      try {
        await fetch(`${apiUrl}/api/v1/driver/location`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            accuracy: acc || 0,
            heading: heading || 0,
            speed: speed || 0,
          }),
        });
      } catch {
        // Non-blocking telemetry post
      }
    },
    [apiUrl, getAuthHeaders]
  );

  const refreshLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setTelemetry((prev) => ({
        ...prev,
        status: "fallback",
      }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        const speedKmH = speed !== null ? Math.round(speed * 3.6) : 0;
        setTelemetry({
          latitude,
          longitude,
          accuracy,
          speed: speedKmH,
          heading: heading || 0,
          timestamp: pos.timestamp,
          status: "active",
        });
        void syncBackendLocation(latitude, longitude, accuracy, heading, speedKmH);
      },
      () => {
        setTelemetry((prev) => ({
          ...prev,
          status: prev.status === "active" ? "active" : "fallback",
        }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [syncBackendLocation]);

  useEffect(() => {
    refreshLocation();

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setTelemetry((prev) => ({ ...prev, status: "fallback" }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        const speedKmH = speed !== null ? Math.round(speed * 3.6) : 0;

        setTelemetry({
          latitude,
          longitude,
          accuracy,
          speed: speedKmH,
          heading: heading || 0,
          timestamp: pos.timestamp,
          status: "active",
        });

        // Throttle backend API calls: only post if moved > 30 meters
        const last = lastSyncedRef.current;
        if (
          !last ||
          Math.abs(last.lat - latitude) > 0.0003 ||
          Math.abs(last.lng - longitude) > 0.0003
        ) {
          lastSyncedRef.current = { lat: latitude, lng: longitude };
          void syncBackendLocation(latitude, longitude, accuracy, heading, speedKmH);
        }
      },
      (err) => {
        console.warn("GPS watch exception:", err.message);
        setTelemetry((prev) => ({
          ...prev,
          status: prev.status === "active" ? "active" : "fallback",
        }));
      },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [refreshLocation, syncBackendLocation]);

  return {
    telemetry,
    refreshLocation,
  };
}
