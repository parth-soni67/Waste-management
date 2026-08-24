/**
 * WasteWise AI — Mapbox & Routing Service Utility
 * Provides Mapbox Directions API integration, OSRM fallback, style url configuration,
 * distance & ETA formatting, off-route detection, and geographic bounding box calculations.
 */

export interface RouteResult {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  source: "mapbox" | "osrm" | "haversine";
  error?: boolean;
}

export function getMapboxToken(): string | null {
  if (typeof process === "undefined" || !process.env) return null;
  const token =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    process.env.VITE_MAPBOX_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  return token && token.trim().length > 0 ? token.trim() : null;
}

export function getMapStyle(): string | object {
  const customUrl = process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL;
  if (customUrl && customUrl.trim().length > 0) {
    return customUrl.trim();
  }

  const mapboxToken = getMapboxToken();
  if (mapboxToken) {
    return `mapbox://styles/mapbox/navigation-day-v1`;
  }

  // Self-contained, high-contrast CARTO Voyager tiles (No key required)
  return {
    version: 8,
    sources: {
      "carto-voyager": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
          "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/">CARTO</a>',
      },
    },
    layers: [
      {
        id: "carto-voyager-layer",
        type: "raster",
        source: "carto-voyager",
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };
}

export function computeHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // metres
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatRouteDistance(meters: number | null): string {
  if (meters === null || isNaN(meters)) return "Calculating...";
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  if (meters < 100000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters / 1000)} km`;
}

export function formatRouteEta(value: number | null, isMinutes = false): string {
  if (value === null || isNaN(value)) return "Calculating...";
  const totalMinutes = isMinutes ? Math.round(value) : Math.round(value / 60);
  if (totalMinutes < 1) return "< 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs}h ${mins}m`;
}

export function isVehicleOffRoute(
  vehicle: { lat: number; lng: number },
  routeCoords: [number, number][],
  thresholdMeters: number = 100
): boolean {
  if (routeCoords.length < 2) return false;

  let minDistance = Infinity;

  for (let i = 0; i < routeCoords.length; i++) {
    const dist = computeHaversineDistance(
      vehicle.lat,
      vehicle.lng,
      routeCoords[i][1],
      routeCoords[i][0]
    );
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance > thresholdMeters;
}

export async function fetchRoadRoute(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): Promise<RouteResult> {
  const mapboxToken = getMapboxToken();

  // 1. Try Mapbox Directions API if token exists
  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const r = data.routes[0];
          return {
            coordinates: r.geometry.coordinates as [number, number][],
            distanceMeters: Math.round(r.distance),
            durationSeconds: Math.round(r.duration),
            source: "mapbox",
          };
        }
      }
    } catch (e) {
      console.warn("Mapbox directions fetch error", e);
    }
  }

  // 2. Fallback to Open Source Routing Machine (OSRM)
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetch(osrmUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const r = data.routes[0];
        return {
          coordinates: r.geometry.coordinates as [number, number][],
          distanceMeters: Math.round(r.distance),
          durationSeconds: Math.round(r.duration),
          source: "osrm",
        };
      }
    }
  } catch (e) {
    console.warn("OSRM directions fetch error", e);
  }

  // 3. Fallback when APIs fail: return empty coordinates with error flag (No fake straight line!)
  return {
    coordinates: [],
    distanceMeters: Math.round(computeHaversineDistance(start.lat, start.lng, end.lat, end.lng)),
    durationSeconds: Math.round((computeHaversineDistance(start.lat, start.lng, end.lat, end.lng) / 1000 / 25) * 3600),
    source: "haversine",
    error: true,
  };
}

export function computeBoundingBox(points: [number, number][]): {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
} | null {
  if (points.length === 0) return null;
  let minLng = points[0][0];
  let maxLng = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];

  points.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });

  return { minLng, minLat, maxLng, maxLat };
}
