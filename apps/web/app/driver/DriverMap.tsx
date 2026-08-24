"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Plus,
  Minus,
  Compass,
  Locate,
  Maximize2,
  AlertTriangle,
  RefreshCw,
  Navigation2,
} from "lucide-react";
import { getMapStyle } from "@/lib/services/mapboxService";

export interface DriverMapIncident {
  id: string;
  incidentCode: string;
  title: string;
  address: string;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  category: string;
  estimatedVolumeM3?: number;
  latitude: number;
  longitude: number;
  sequence: number;
  status: string;
}

interface DriverMapProps {
  driverLocation: { lat: number; lng: number; heading?: number; speed?: number } | null;
  vehicleRegistration?: string;
  assignments: DriverMapIncident[];
  activeIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  routeGeometry: [number, number][];
  routeProvider?: string;
  routeStatus?: string;
  routeError?: boolean;
  onRetryRoute?: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: "#DC2626", // Red
  P1: "#EA580C", // Orange
  P2: "#D97706", // Amber
  P3: "#2563EB", // Blue
  P4: "#64748B", // Slate
};

export default function DriverMap({
  driverLocation,
  vehicleRegistration = "GJ-01-WM-4402",
  assignments,
  activeIncidentId,
  onSelectIncident,
  routeGeometry,
  routeProvider = "Mapbox",
  routeStatus = "OPTIMIZED_ROUTE",
  routeError = false,
  onRetryRoute,
}: DriverMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [followVehicle, setFollowVehicle] = useState(true);

  // 1. Initialize MapLibre Engine
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = driverLocation
      ? [driverLocation.lng, driverLocation.lat]
      : assignments.length > 0
      ? [assignments[0].longitude, assignments[0].latitude]
      : [72.586, 23.033];

    const mapStyle = getMapStyle();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle as maplibregl.StyleSpecification,
      center: initialCenter,
      zoom: 14,
      pitch: 24,
    });

    map.on("dragstart", () => {
      setFollowVehicle(false);
    });

    map.on("load", () => {
      mapRef.current = map;
      setMapLoaded(true);

      // Add GeoJSON route source
      if (!map.getSource("active-route")) {
        map.addSource("active-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: routeGeometry.length > 0 ? routeGeometry : [],
            },
          },
        });
      }

      // Route Casing Layer (White border contrast for visibility on raster/vector maps)
      if (!map.getLayer("active-route-casing")) {
        map.addLayer({
          id: "active-route-casing",
          type: "line",
          source: "active-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#FFFFFF",
            "line-width": 10,
            "line-opacity": 0.85,
          },
        });
      }

      // Route Path Line Layer (Vibrant municipal teal/green)
      if (!map.getLayer("active-route-line")) {
        map.addLayer({
          id: "active-route-line",
          type: "line",
          source: "active-route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#008F6B",
            "line-width": 6,
            "line-opacity": 0.95,
          },
        });
      }

      setTimeout(() => {
        map.resize();
      }, 150);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Update Dynamic Vehicle Marker with Heading Rotation & Live Telemetry
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    if (driverLocation) {
      const heading = driverLocation.heading || 0;
      const speed = driverLocation.speed || 0;

      if (!driverMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "driver-vehicle-marker";
        el.style.cursor = "pointer";
        el.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 54px; height: 54px; border-radius: 50%; background: rgba(16, 185, 129, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            
            <div style="position: absolute; top: -14px; background: #065F46; color: #FFFFFF; font-size: 8px; font-weight: 900; padding: 1px 5px; border-radius: 6px; border: 1px solid #FFFFFF; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap; z-index: 2;">
              LIVE GPS
            </div>

            <div id="truck-icon-container" style="
              position: relative;
              width: 42px;
              height: 42px;
              border-radius: 50%;
              background: linear-gradient(135deg, #065F46 0%, #047857 100%);
              border: 3px solid #FFFFFF;
              box-shadow: 0 6px 18px rgba(0,0,0,0.35);
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(${heading}deg);
              transition: transform 0.4s ease-out;
            ">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" fill="#047857"/>
                <path d="M16 8h4l3 3v5h-7V8z" fill="#065F46"/>
                <circle cx="5.5" cy="18.5" r="2.5" fill="#111827" stroke="white" stroke-width="1.5"/>
                <circle cx="18.5" cy="18.5" r="2.5" fill="#111827" stroke="white" stroke-width="1.5"/>
              </svg>
            </div>
          </div>
        `;

        const driverPopup = new maplibregl.Popup({ offset: 20, closeButton: true }).setHTML(`
          <div style="padding: 8px; font-family: system-ui, sans-serif; min-width: 170px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #047857; background: #ECFDF5; padding: 2px 6px; border-radius: 4px;">Municipal Fleet</span>
              <span style="font-size: 9px; color: #10B981; font-weight: 700;">● Online</span>
            </div>
            <div style="font-weight: 900; font-size: 13px; color: #0F172A; font-family: monospace; margin-bottom: 2px;">
              🚛 ${vehicleRegistration}
            </div>
            <div style="color: #64748B; font-size: 11px; margin-bottom: 4px;">
              Speed: <strong>${speed} km/h</strong> • Heading: <strong>${heading}°</strong>
            </div>
            <div style="color: #475569; font-size: 10px; border-top: 1px solid #E2E8F0; padding-top: 4px; margin-top: 4px;">
              ${driverLocation.lat.toFixed(5)}°N, ${driverLocation.lng.toFixed(5)}°E
            </div>
          </div>
        `);

        driverMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([driverLocation.lng, driverLocation.lat])
          .setPopup(driverPopup)
          .addTo(mapRef.current);
      } else {
        driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
        const container = driverMarkerRef.current.getElement().querySelector("#truck-icon-container") as HTMLElement;
        if (container) {
          container.style.transform = `rotate(${heading}deg)`;
        }
      }

      if (followVehicle && mapRef.current) {
        mapRef.current.easeTo({
          center: [driverLocation.lng, driverLocation.lat],
          duration: 1000,
        });
      }
    }
  }, [driverLocation, followVehicle, vehicleRegistration, mapLoaded]);

  // 3. Render Assignment Hotspot Markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    assignments.forEach((inc) => {
      const isSelected = inc.id === activeIncidentId;
      const color = PRIORITY_COLORS[inc.priority] || "#2563EB";

      const el = document.createElement("div");
      el.className = `driver-stop-marker ${isSelected ? "selected" : ""}`;
      el.style.cursor = "pointer";

      el.innerHTML = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          ${
            isSelected
              ? `<div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; background: rgba(245, 158, 11, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
              : ""
          }
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 3px;
            min-width: 32px;
            height: 32px;
            padding: 0 8px;
            border-radius: 16px;
            background: ${color};
            color: white;
            font-weight: 900;
            font-size: 11px;
            border: 2.5px solid ${isSelected ? "#F59E0B" : "#FFFFFF"};
            box-shadow: ${isSelected ? "0 0 16px rgba(245, 158, 11, 0.8)" : "0 4px 12px rgba(0,0,0,0.3)"};
            transform: ${isSelected ? "scale(1.2)" : "scale(1)"};
            transition: transform 0.2s ease;
          ">
            <span>①</span>
            <span>${inc.priority}</span>
          </div>
          ${
            isSelected
              ? `<div style="background: #D97706; color: #FFFFFF; font-size: 8px; font-weight: 900; padding: 1px 5px; border-radius: 4px; margin-top: 2px; text-transform: uppercase; white-space: nowrap; shadow: 0 2px 4px rgba(0,0,0,0.3);">
                  ACTIVE STOP
                </div>`
              : ""
          }
        </div>
      `;

      el.addEventListener("click", () => {
        onSelectIncident(inc.id);
      });

      const popup = new maplibregl.Popup({ offset: 15, closeButton: true }).setHTML(`
        <div style="padding: 8px; font-family: system-ui, sans-serif; font-size: 12px; min-width: 180px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 900; color: #0F172A; font-family: monospace;">Stop #${inc.sequence} • ${inc.incidentCode}</span>
            <span style="background: ${color}20; color: ${color}; font-weight: 800; font-size: 10px; padding: 1px 6px; border-radius: 4px;">${inc.priority}</span>
          </div>
          <div style="font-weight: 700; color: #1E293B; margin-bottom: 2px;">${inc.title}</div>
          <div style="color: #64748B; font-size: 11px; margin-bottom: 6px;">${inc.address || "Municipal Sector"}</div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; background: #F8FAFC; padding: 4px 8px; border-radius: 6px; color: #475569;">
            <span>Est. Volume: <strong>${inc.estimatedVolumeM3 ? inc.estimatedVolumeM3.toFixed(2) : "1.50"} m³</strong></span>
            <span>Status: <strong style="text-transform: capitalize;">${inc.status.replace("_", " ")}</strong></span>
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([inc.longitude, inc.latitude])
        .setPopup(popup)
        .addTo(mapRef.current!);

      incidentMarkersRef.current.push(marker);
    });
  }, [assignments, activeIncidentId, onSelectIncident, mapLoaded]);

  // 4. Update Real Road GeoJSON Route Source & Auto-Fit Map Bounds
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const source = map.getSource("active-route") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routeGeometry.length > 0 ? routeGeometry : [],
        },
      });

      // Auto-fit bounds to route geometry + vehicle + destination
      if (routeGeometry.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        routeGeometry.forEach(([lng, lat]) => {
          bounds.extend([lng, lat]);
        });

        if (driverLocation) {
          bounds.extend([driverLocation.lng, driverLocation.lat]);
        }

        const activeStop = assignments.find((a) => a.id === activeIncidentId) || assignments[0];
        if (activeStop) {
          bounds.extend([activeStop.longitude, activeStop.latitude]);
        }

        map.fitBounds(bounds, {
          padding: { top: 90, bottom: 90, left: 90, right: 90 },
          maxZoom: 15,
          duration: 900,
        });
      }
    }
  }, [routeGeometry, mapLoaded, driverLocation, activeIncidentId, assignments]);

  // Map Controls Callbacks
  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const handleResetCompass = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 });
  }, []);

  const handleFlyToVehicle = useCallback(() => {
    if (driverLocation && mapRef.current) {
      setFollowVehicle(true);
      mapRef.current.flyTo({
        center: [driverLocation.lng, driverLocation.lat],
        zoom: 15.5,
        pitch: 28,
        duration: 1000,
      });
    }
  }, [driverLocation]);

  const handleFitRoute = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = new maplibregl.LngLatBounds();
    let hasPoints = false;

    if (driverLocation) {
      bounds.extend([driverLocation.lng, driverLocation.lat]);
      hasPoints = true;
    }

    assignments.forEach((inc) => {
      bounds.extend([inc.longitude, inc.latitude]);
      hasPoints = true;
    });

    routeGeometry.forEach(([lng, lat]) => {
      bounds.extend([lng, lat]);
      hasPoints = true;
    });

    if (hasPoints) {
      mapRef.current.fitBounds(bounds, {
        padding: { top: 90, bottom: 90, left: 90, right: 90 },
        maxZoom: 15,
        duration: 1000,
      });
    }
  }, [driverLocation, assignments, routeGeometry]);

  return (
    <div className="relative w-full h-full min-h-[440px] rounded-2xl overflow-hidden shadow-sm border border-slate-200">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[440px]" />

      {/* Map Header Status Overlay */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200/80 shadow-md text-xs font-bold text-slate-800">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        <span>Municipal Navigation Map</span>
        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          🟢 Optimized Route ({routeProvider || "Mapbox"})
        </span>
      </div>

      {/* Interactive Map Controls Action Bar */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-lg">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom In"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          onClick={handleZoomOut}
          className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <Minus className="w-4 h-4" />
        </button>

        <div className="w-full h-[1px] bg-slate-200 my-0.5" />

        <button
          onClick={handleResetCompass}
          className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          title="Reset North"
        >
          <Compass className="w-4 h-4" />
        </button>

        <button
          onClick={handleFlyToVehicle}
          className="w-8 h-8 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 flex items-center justify-center transition-colors cursor-pointer"
          title="My Location"
        >
          <Locate className="w-4 h-4" />
        </button>

        <button
          onClick={handleFitRoute}
          className="w-8 h-8 rounded-xl bg-white hover:bg-blue-50 text-blue-700 flex items-center justify-center transition-colors cursor-pointer"
          title="Fit Route"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Auto-Follow Toggle Floating Control */}
      <div className="absolute bottom-4 left-4 z-10">
        <button
          onClick={() => setFollowVehicle((prev) => !prev)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-md backdrop-blur-md transition-all cursor-pointer ${
            followVehicle
              ? "bg-emerald-700 text-white border-emerald-600 shadow-emerald-900/20"
              : "bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
        >
          <Navigation2 className={`w-3.5 h-3.5 ${followVehicle ? "animate-pulse" : ""}`} />
          <span>{followVehicle ? "⌖ Following Vehicle" : "⌖ Follow Vehicle"}</span>
        </button>
      </div>

      {/* Route Fallback Warning Banner */}
      {routeError && assignments.length > 0 && (
        <div className="absolute bottom-4 right-4 max-w-sm z-10 flex items-center justify-between bg-amber-950/90 text-amber-100 backdrop-blur-md px-3.5 py-2 rounded-xl border border-amber-700 shadow-lg text-xs font-semibold gap-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Route temporarily unavailable.</span>
          </div>
          {onRetryRoute && (
            <button
              onClick={onRetryRoute}
              className="px-2 py-1 rounded-lg bg-amber-800 hover:bg-amber-700 text-white text-[10px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
