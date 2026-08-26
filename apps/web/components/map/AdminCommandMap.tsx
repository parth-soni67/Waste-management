"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Plus,
  Minus,
  Compass,
  Maximize2,
  Layers,
  Search,
  Zap,
  Flame,
  Truck,
  AlertTriangle,
  Hospital,
  Pause,
  Play,
  X,
} from "lucide-react";
import { getMapStyle } from "@/lib/services/mapboxService";

export interface AdminVehicle {
  id: string;
  plate: string;
  type: string;
  status: "AVAILABLE" | "ASSIGNED" | "EN_ROUTE" | "COLLECTING" | "MAINTENANCE" | "EMERGENCY" | "IDLE" | "OFFLINE";
  lat: number;
  lng: number;
  heading?: number;
  speed?: number; // km/h
  driver?: string;
  driverPhone?: string;
  payloadKg?: number;
  capacityKg?: number;
  assignedIncidentId?: string;
  nextStopName?: string;
  etaMinutes?: number;
  zone?: string;
}

export interface AdminIncident {
  id: string;
  code: string;
  title: string;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  status: "REPORTED" | "ASSIGNED" | "IN_PROGRESS" | "COLLECTED" | "VERIFIED";
  lat: number;
  lng: number;
  address?: string;
  category?: string;
  volumeM3?: number;
  reportsCount?: number;
  slaMinutesLeft?: number;
  isHospitalZone?: boolean;
  assignedVehiclePlate?: string;
}

export interface AdminHotspot {
  id: string;
  code: string;
  title: string;
  lat: number;
  lng: number;
  confidence: number; // e.g. 0.92 = 92%
  predictedVolumeM3: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  recommendedAction: string;
}

export interface AdminRoute {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  coordinates: [number, number][];
  status: "ACTIVE" | "DELAYED" | "CRITICAL" | "COMPLETED";
}

interface AdminCommandMapProps {
  vehicles?: AdminVehicle[];
  incidents?: AdminIncident[];
  hotspots?: AdminHotspot[];
  routes?: AdminRoute[];
  selectedIncidentId?: string | null;
  selectedVehicleId?: string | null;
  onSelectIncident?: (incident: AdminIncident) => void;
  onSelectVehicle?: (vehicle: AdminVehicle) => void;
  onSelectHotspot?: (hotspot: AdminHotspot) => void;
  zoneFilter?: string;
  className?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  P0: "#DC2626", // Red (Emergency)
  P1: "#EA580C", // Orange (High)
  P2: "#D97706", // Amber (Medium)
  P3: "#2563EB", // Blue (Low)
  P4: "#64748B", // Slate
};

const VEHICLE_STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "#10B981", // Green
  ASSIGNED: "#0D9488", // Teal
  EN_ROUTE: "#0284C7", // Sky Blue
  COLLECTING: "#2563EB", // Blue
  IDLE: "#F59E0B", // Amber
  DELAYED: "#F97316", // Orange
  MAINTENANCE: "#64748B", // Slate
  OFFLINE: "#475569", // Dark Slate
  EMERGENCY: "#DC2626", // Red
};

export default function AdminCommandMap({
  vehicles = [],
  incidents = [],
  hotspots = [],
  routes = [],
  selectedIncidentId,
  selectedVehicleId,
  onSelectIncident,
  onSelectVehicle,
  onSelectHotspot,
  zoneFilter = "ALL",
  className = "",
}: AdminCommandMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Markers Refs
  const vehicleMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const incidentMarkersRef = useRef<Record<string, maplibregl.Marker>>({});
  const hotspotMarkersRef = useRef<Record<string, maplibregl.Marker>>({});

  // Map Loaded State
  const [mapLoaded, setMapLoaded] = useState(false);

  // Interactive Layer Visibility Toggles
  const [showVehicles, setShowVehicles] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showCriticalP0, setShowCriticalP0] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Filter & Search Controls
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [showLayerDrawer, setShowLayerDrawer] = useState<boolean>(false);

  // Dynamic Live Nodes Counter (Vehicles + Incidents + Hotspots)
  const liveNodesCount = useMemo(() => {
    return vehicles.length + incidents.length + hotspots.length;
  }, [vehicles.length, incidents.length, hotspots.length]);

  // 1. Initialize City-Wide Map Engine
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter: [number, number] = [72.586, 23.033]; // Municipal Command Center (Gandhinagar/Ahmedabad)
    const mapStyle = getMapStyle();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle as maplibregl.StyleSpecification,
      center: initialCenter,
      zoom: 12.4,
      pitch: 20,
    });

    map.on("load", () => {
      mapRef.current = map;
      setMapLoaded(true);

      // Add Routes Source & Multi-Layer Lines
      map.addSource("admin-routes-source", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      // Route casing line (dark border)
      map.addLayer({
        id: "admin-routes-casing",
        type: "line",
        source: "admin-routes-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#064E3B",
          "line-width": 6,
          "line-opacity": 0.6,
        },
      });

      // Route main line
      map.addLayer({
        id: "admin-routes-line",
        type: "line",
        source: "admin-routes-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": [
            "match",
            ["get", "status"],
            "CRITICAL",
            "#DC2626",
            "DELAYED",
            "#F97316",
            "COMPLETED",
            "#64748B",
            "#10B981", // default ACTIVE
          ],
          "line-width": 4,
          "line-opacity": 0.9,
        },
      });

      // Add Heatmap Source & Layer
      map.addSource("waste-density-heatmap", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [],
        },
      });

      map.addLayer({
        id: "waste-heatmap-layer",
        type: "heatmap",
        source: "waste-density-heatmap",
        maxzoom: 15,
        paint: {
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(236, 253, 245, 0)",
            0.2,
            "rgba(16, 185, 129, 0.4)",
            0.5,
            "rgba(245, 158, 11, 0.7)",
            0.8,
            "rgba(249, 115, 22, 0.85)",
            1,
            "rgba(220, 38, 38, 0.95)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 10, 15, 35],
          "heatmap-opacity": 0.7,
        },
        layout: {
          visibility: "none",
        },
      });

      setTimeout(() => map.resize(), 150);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize();
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
  }, []);

  // 2. Render & Update Fleet Vehicle Markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    // Filter vehicles by visibility toggle & zone filter
    const visibleVehicles = showVehicles
      ? vehicles.filter((v) => zoneFilter === "ALL" || !v.zone || v.zone.includes(zoneFilter))
      : [];

    const currentKeys = new Set(Object.keys(vehicleMarkersRef.current));
    const newKeys = new Set(visibleVehicles.map((v) => v.id));

    // Remove obsolete markers
    currentKeys.forEach((id) => {
      if (!newKeys.has(id)) {
        vehicleMarkersRef.current[id].remove();
        delete vehicleMarkersRef.current[id];
      }
    });

    // Create / Update markers
    visibleVehicles.forEach((veh) => {
      const isSelected = veh.id === selectedVehicleId;
      const statusColor = VEHICLE_STATUS_COLORS[veh.status] || "#10B981";
      const heading = veh.heading || 0;

      if (!vehicleMarkersRef.current[veh.id]) {
        const el = document.createElement("div");
        el.className = `admin-vehicle-marker ${isSelected ? "selected" : ""}`;
        el.style.cursor = "pointer";
        el.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            ${
              veh.status === "EMERGENCY"
                ? `<div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; background: rgba(220, 38, 38, 0.35); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
                : ""
            }
            <div id="truck-box-${veh.id}" style="
              position: relative;
              width: 38px;
              height: 38px;
              border-radius: 50%;
              background: ${statusColor};
              border: 2.5px solid ${isSelected ? "#F59E0B" : "#FFFFFF"};
              box-shadow: ${isSelected ? "0 0 16px rgba(245, 158, 11, 0.8)" : "0 4px 12px rgba(0,0,0,0.3)"};
              display: flex;
              align-items: center;
              justify-content: center;
              transform: rotate(${heading}deg) ${isSelected ? "scale(1.2)" : "scale(1)"};
              transition: transform 0.3s ease, border-color 0.2s ease;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" fill="${statusColor}"/>
                <path d="M16 8h4l3 3v5h-7V8z" fill="#047857"/>
                <circle cx="5.5" cy="18.5" r="2.5" fill="#111827" stroke="white" stroke-width="1.5"/>
                <circle cx="18.5" cy="18.5" r="2.5" fill="#111827" stroke="white" stroke-width="1.5"/>
              </svg>
            </div>
            <div style="background: #0F172A; color: #FFFFFF; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 4px; margin-top: 2px; font-family: monospace; white-space: nowrap; shadow: 0 2px 4px rgba(0,0,0,0.3);">
              ${veh.plate}
            </div>
          </div>
        `;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectVehicle?.(veh);
        });

        const popup = new maplibregl.Popup({ offset: 16, closeButton: true }).setHTML(`
          <div style="padding: 8px; font-family: system-ui, sans-serif; min-width: 190px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 9px; font-weight: 900; background: ${statusColor}20; color: ${statusColor}; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                ● ${veh.status}
              </span>
              <span style="font-size: 9px; color: #64748B;">Speed: <strong>${veh.speed || 0} km/h</strong></span>
            </div>
            <div style="font-weight: 900; font-size: 13px; color: #0F172A; font-family: monospace; margin-bottom: 2px;">
              🚛 ${veh.plate} (${veh.type})
            </div>
            <div style="font-size: 11px; color: #334155; margin-bottom: 4px;">
              Driver: <strong>${veh.driver || "Unassigned"}</strong>
            </div>
            <div style="font-size: 10px; background: #F8FAFC; padding: 4px 6px; border-radius: 6px; color: #475569; margin-bottom: 6px;">
              Payload: <strong>${veh.payloadKg || 0} / ${veh.capacityKg || 5000} kg</strong>
              ${veh.nextStopName ? `<br/>Next Stop: <strong>${veh.nextStopName}</strong>` : ""}
            </div>
            <button id="view-veh-btn-${veh.id}" style="width: 100%; padding: 4px 8px; background: #0F172A; color: white; border: none; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer;">
              VIEW FLEET DETAILS
            </button>
          </div>
        `);

        popup.on("open", () => {
          setTimeout(() => {
            const btn = document.getElementById(`view-veh-btn-${veh.id}`);
            if (btn) {
              btn.onclick = () => onSelectVehicle?.(veh);
            }
          }, 50);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([veh.lng, veh.lat])
          .setPopup(popup)
          .addTo(map);

        vehicleMarkersRef.current[veh.id] = marker;
      } else {
        const marker = vehicleMarkersRef.current[veh.id];
        marker.setLngLat([veh.lng, veh.lat]);

        const iconContainer = marker.getElement().querySelector(`#truck-box-${veh.id}`) as HTMLElement;
        if (iconContainer) {
          iconContainer.style.transform = `rotate(${heading}deg) ${isSelected ? "scale(1.2)" : "scale(1)"}`;
        }
      }
    });
  }, [vehicles, showVehicles, selectedVehicleId, zoneFilter, onSelectVehicle, mapLoaded]);

  // 3. Render & Update Active Incident & Hospital Red Zone Markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const visibleIncidents = showIncidents
      ? incidents.filter((inc) => {
          if (priorityFilter !== "ALL" && inc.priority !== priorityFilter) return false;
          if (inc.priority === "P0" && !showCriticalP0) return false;
          return true;
        })
      : [];

    const currentKeys = new Set(Object.keys(incidentMarkersRef.current));
    const newKeys = new Set(visibleIncidents.map((i) => i.id));

    currentKeys.forEach((id) => {
      if (!newKeys.has(id)) {
        incidentMarkersRef.current[id].remove();
        delete incidentMarkersRef.current[id];
      }
    });

    visibleIncidents.forEach((inc) => {
      const isSelected = inc.id === selectedIncidentId;
      const isP0 = inc.priority === "P0" || inc.isHospitalZone;
      const color = PRIORITY_COLORS[inc.priority] || "#2563EB";

      if (!incidentMarkersRef.current[inc.id]) {
        const el = document.createElement("div");
        el.className = `admin-incident-marker ${isSelected ? "selected" : ""}`;
        el.style.cursor = "pointer";

        el.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            ${
              isP0
                ? `<div style="position: absolute; width: 46px; height: 46px; border-radius: 50%; background: rgba(220, 38, 38, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
                : ""
            }
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
              min-width: 34px;
              height: 34px;
              padding: 0 8px;
              border-radius: 17px;
              background: ${color};
              color: white;
              font-weight: 900;
              font-size: 11px;
              border: 2.5px solid ${isSelected ? "#F59E0B" : "#FFFFFF"};
              box-shadow: ${isP0 ? "0 0 18px rgba(220, 38, 38, 0.8)" : "0 4px 12px rgba(0,0,0,0.3)"};
              transform: ${isSelected ? "scale(1.2)" : "scale(1)"};
              transition: transform 0.2s ease;
            ">
              <span>${isP0 ? "🏥" : "⚠️"}</span>
              <span>${inc.priority}</span>
            </div>
            ${
              isP0
                ? `<div style="background: #DC2626; color: #FFFFFF; font-size: 8px; font-weight: 900; padding: 1px 4px; border-radius: 4px; margin-top: 2px; text-transform: uppercase; white-space: nowrap;">
                    HOSPITAL RED ZONE
                  </div>`
                : ""
            }
          </div>
        `;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectIncident?.(inc);
        });

        const popup = new maplibregl.Popup({ offset: 16, closeButton: true }).setHTML(`
          <div style="padding: 8px; font-family: system-ui, sans-serif; font-size: 12px; min-width: 200px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 900; color: #0F172A; font-family: monospace;">${inc.code}</span>
              <span style="background: ${color}20; color: ${color}; font-weight: 900; font-size: 10px; padding: 1px 6px; border-radius: 4px;">
                ${inc.priority} ${isP0 ? "CRITICAL" : ""}
              </span>
            </div>
            <div style="font-weight: 800; color: #1E293B; margin-bottom: 2px;">${inc.title}</div>
            <div style="color: #64748B; font-size: 11px; margin-bottom: 6px;">${inc.address || "Municipal Zone"}</div>
            <div style="display: flex; flex-direction: column; gap: 2px; font-size: 10px; background: #F8FAFC; padding: 6px; border-radius: 6px; color: #475569; margin-bottom: 6px;">
              <div>Volume: <strong>${inc.volumeM3 ? inc.volumeM3.toFixed(2) : "1.50"} m³</strong> • Reports: <strong>${inc.reportsCount || 1}</strong></div>
              <div>SLA Target: <strong style="color: ${inc.slaMinutesLeft && inc.slaMinutesLeft < 30 ? "#DC2626" : "#0F172A"}">${inc.slaMinutesLeft || 45} mins left</strong></div>
              ${inc.assignedVehiclePlate ? `<div>Assigned Truck: <strong style="color: #047857">${inc.assignedVehiclePlate}</strong></div>` : ""}
            </div>
            <button id="select-inc-btn-${inc.id}" style="width: 100%; padding: 4px 8px; background: #047857; color: white; border: none; border-radius: 6px; font-size: 10px; font-weight: 800; cursor: pointer;">
              TRIAGE INCIDENT
            </button>
          </div>
        `);

        popup.on("open", () => {
          setTimeout(() => {
            const btn = document.getElementById(`select-inc-btn-${inc.id}`);
            if (btn) btn.onclick = () => onSelectIncident?.(inc);
          }, 50);
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([inc.lng, inc.lat])
          .setPopup(popup)
          .addTo(map);

        incidentMarkersRef.current[inc.id] = marker;
      } else {
        incidentMarkersRef.current[inc.id].setLngLat([inc.lng, inc.lat]);
      }
    });
  }, [incidents, showIncidents, showCriticalP0, priorityFilter, selectedIncidentId, onSelectIncident, mapLoaded]);

  // 4. Render & Update AI Predicted Hotspots Layer
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const visibleHotspots = showHotspots ? hotspots : [];

    const currentKeys = new Set(Object.keys(hotspotMarkersRef.current));
    const newKeys = new Set(visibleHotspots.map((h) => h.id));

    currentKeys.forEach((id) => {
      if (!newKeys.has(id)) {
        hotspotMarkersRef.current[id].remove();
        delete hotspotMarkersRef.current[id];
      }
    });

    visibleHotspots.forEach((hs) => {
      if (!hotspotMarkersRef.current[hs.id]) {
        const el = document.createElement("div");
        el.className = "admin-hotspot-marker";
        el.style.cursor = "pointer";

        el.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
            <div style="position: absolute; width: 42px; height: 42px; border-radius: 50%; background: rgba(245, 158, 11, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="
              position: relative;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
              border: 2px solid #FFFFFF;
              box-shadow: 0 4px 12px rgba(245, 158, 11, 0.5);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 15px;
            ">
              🔥
            </div>
            <div style="background: #78350F; color: #FEF3C7; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 4px; margin-top: 2px; white-space: nowrap;">
              AI HOTSPOT (${Math.round(hs.confidence * 100)}%)
            </div>
          </div>
        `;

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectHotspot?.(hs);
        });

        const popup = new maplibregl.Popup({ offset: 15, closeButton: true }).setHTML(`
          <div style="padding: 8px; font-family: system-ui, sans-serif; font-size: 12px; min-width: 190px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span style="font-weight: 900; color: #D97706; background: #FEF3C7; padding: 2px 6px; border-radius: 4px; font-size: 9px; text-transform: uppercase;">
                AI PREDICTED HOTSPOT
              </span>
              <span style="font-size: 10px; font-weight: 800; color: #B45309;">${Math.round(hs.confidence * 100)}% Confidence</span>
            </div>
            <div style="font-weight: 800; color: #1E293B; margin-bottom: 2px;">${hs.title}</div>
            <div style="font-size: 10px; background: #FFFBEB; border: 1px solid #FDE68A; padding: 6px; border-radius: 6px; color: #78350F; margin-bottom: 6px;">
              <div>Pred. Volume: <strong>${hs.predictedVolumeM3.toFixed(2)} m³</strong></div>
              <div>Risk Level: <strong>${hs.riskLevel} RISK</strong></div>
              <div style="margin-top: 2px; font-size: 9px;">Action: ${hs.recommendedAction}</div>
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([hs.lng, hs.lat])
          .setPopup(popup)
          .addTo(map);

        hotspotMarkersRef.current[hs.id] = marker;
      } else {
        hotspotMarkersRef.current[hs.id].setLngLat([hs.lng, hs.lat]);
      }
    });
  }, [hotspots, showHotspots, onSelectHotspot, mapLoaded]);

  // 5. Render Active Routes Polyline Source
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const source = map.getSource("admin-routes-source") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      const visibleRoutes = showRoutes ? routes : [];
      const features = visibleRoutes.map((r) => ({
        type: "Feature" as const,
        properties: {
          id: r.id,
          vehiclePlate: r.vehiclePlate,
          status: r.status,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: r.coordinates,
        },
      }));

      source.setData({
        type: "FeatureCollection",
        features,
      });
    }
  }, [routes, showRoutes, mapLoaded]);

  // 6. Update Heatmap Layer Source & Visibility
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const source = map.getSource("waste-density-heatmap") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      const incidentFeatures = incidents.map((i) => ({
        type: "Feature" as const,
        properties: { weight: i.priority === "P0" ? 1.0 : i.priority === "P1" ? 0.75 : 0.4 },
        geometry: { type: "Point" as const, coordinates: [i.lng, i.lat] },
      }));

      const hotspotFeatures = hotspots.map((h) => ({
        type: "Feature" as const,
        properties: { weight: h.confidence * 0.8 },
        geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
      }));

      source.setData({
        type: "FeatureCollection",
        features: [...incidentFeatures, ...hotspotFeatures],
      });
    }

    if (map.getLayer("waste-heatmap-layer")) {
      map.setLayoutProperty("waste-heatmap-layer", "visibility", showHeatmap ? "visible" : "none");
    }
  }, [incidents, hotspots, showHeatmap, mapLoaded]);

  // Search Filter Handler
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim() || !mapRef.current) return;

      const q = searchQuery.toLowerCase().trim();

      // Check matching vehicle
      const matchVeh = vehicles.find((v) => v.plate.toLowerCase().includes(q) || v.driver?.toLowerCase().includes(q));
      if (matchVeh) {
        onSelectVehicle?.(matchVeh);
        mapRef.current.flyTo({ center: [matchVeh.lng, matchVeh.lat], zoom: 15, duration: 1000 });
        const marker = vehicleMarkersRef.current[matchVeh.id];
        if (marker && marker.getPopup()) marker.getPopup().addTo(mapRef.current);
        return;
      }

      // Check matching incident
      const matchInc = incidents.find(
        (i) => i.code.toLowerCase().includes(q) || i.title.toLowerCase().includes(q) || i.address?.toLowerCase().includes(q)
      );
      if (matchInc) {
        onSelectIncident?.(matchInc);
        mapRef.current.flyTo({ center: [matchInc.lng, matchInc.lat], zoom: 15.5, duration: 1000 });
        const marker = incidentMarkersRef.current[matchInc.id];
        if (marker && marker.getPopup()) marker.getPopup().addTo(mapRef.current);
        return;
      }
    },
    [searchQuery, vehicles, incidents, onSelectVehicle, onSelectIncident]
  );

  // Fit Operations Camera Bounds
  const handleFitOperations = useCallback(() => {
    if (!mapRef.current) return;

    const bounds = new maplibregl.LngLatBounds();
    let hasPoints = false;

    vehicles.forEach((v) => {
      bounds.extend([v.lng, v.lat]);
      hasPoints = true;
    });

    incidents.forEach((i) => {
      bounds.extend([i.lng, i.lat]);
      hasPoints = true;
    });

    hotspots.forEach((h) => {
      bounds.extend([h.lng, h.lat]);
      hasPoints = true;
    });

    if (hasPoints) {
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 900 });
    }
  }, [vehicles, incidents, hotspots]);

  return (
    <div className={`relative w-full h-full min-h-[440px] rounded-2xl overflow-hidden shadow-sm border border-slate-200 ${className}`}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[440px]" />

      {/* Top Left Header Bar: Live Operations & Node Counter */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200/90 shadow-md">
        <div className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${isLiveActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
          <span className="text-xs font-black text-slate-900 tracking-tight">Municipal Command Center</span>
        </div>

        <span className="text-[11px] font-extrabold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
          {liveNodesCount} Live Nodes
        </span>

        {/* Live / Paused Toggle Button */}
        <button
          onClick={() => setIsLiveActive((prev) => !prev)}
          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
            isLiveActive ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
          }`}
          title="Toggle Real-Time Telemetry Updates"
        >
          {isLiveActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          <span>{isLiveActive ? "LIVE" : "PAUSED"}</span>
        </button>
      </div>

      {/* Top Center Search Bar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 w-full max-w-xs hidden sm:block">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Truck plate, Driver, Incident code..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/95 backdrop-blur-md rounded-xl border border-slate-200 shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 font-medium placeholder:text-slate-400"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </form>
      </div>

      {/* Top Right Action & Layer Toggle Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <div className="bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-lg flex flex-col gap-1">
          <button
            onClick={() => setShowLayerDrawer((prev) => !prev)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
              showLayerDrawer ? "bg-emerald-700 text-white" : "bg-white hover:bg-slate-100 text-slate-700"
            }`}
            title="Layer Filters"
          >
            <Layers className="w-4 h-4" />
          </button>

          <button
            onClick={handleFitOperations}
            className="w-8 h-8 rounded-xl bg-white hover:bg-blue-50 text-blue-700 flex items-center justify-center transition-colors cursor-pointer"
            title="Fit All Operations"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => mapRef.current?.zoomIn()}
            className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>

          <button
            onClick={() => mapRef.current?.zoomOut()}
            className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>

          <button
            onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 500 })}
            className="w-8 h-8 rounded-xl bg-white hover:bg-slate-100 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            title="Reset Compass"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Layer Filter Control Panel Drawer */}
      {showLayerDrawer && (
        <div className="absolute top-16 right-3 z-20 w-64 bg-white/98 backdrop-blur-md rounded-2xl p-4 border border-slate-200 shadow-xl space-y-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-700" /> Map Layers & Filters
            </span>
            <button
              onClick={() => setShowLayerDrawer(false)}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Layer Checkboxes */}
          <div className="space-y-2 text-xs font-bold text-slate-700">
            <label className="flex items-center justify-between cursor-pointer hover:opacity-80">
              <span className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-emerald-600" /> Municipal Trucks ({vehicles.length})
              </span>
              <input
                type="checkbox"
                checked={showVehicles}
                onChange={(e) => setShowVehicles(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:opacity-80">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-blue-600" /> Active Incidents ({incidents.length})
              </span>
              <input
                type="checkbox"
                checked={showIncidents}
                onChange={(e) => setShowIncidents(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:opacity-80">
              <span className="flex items-center gap-1.5 text-red-700">
                <Hospital className="w-3.5 h-3.5 text-red-600" /> Critical P0 Hospital Zone
              </span>
              <input
                type="checkbox"
                checked={showCriticalP0}
                onChange={(e) => setShowCriticalP0(e.target.checked)}
                className="rounded text-red-600 focus:ring-red-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:opacity-80">
              <span className="flex items-center gap-1.5 text-amber-800">
                <Flame className="w-3.5 h-3.5 text-amber-600" /> AI Predicted Hotspots ({hotspots.length})
              </span>
              <input
                type="checkbox"
                checked={showHotspots}
                onChange={(e) => setShowHotspots(e.target.checked)}
                className="rounded text-amber-600 focus:ring-amber-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:opacity-80">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-600" /> Active Vehicle Routes ({routes.length})
              </span>
              <input
                type="checkbox"
                checked={showRoutes}
                onChange={(e) => setShowRoutes(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer hover:opacity-80 pt-1 border-t border-slate-100">
              <span className="flex items-center gap-1.5 text-purple-800 font-extrabold">
                <Layers className="w-3.5 h-3.5 text-purple-600" /> Waste Density Heatmap
              </span>
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
            </label>
          </div>

          {/* Priority Filter */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
              Priority Filter
            </span>
            <div className="grid grid-cols-2 gap-1 text-[10px] font-bold">
              {["ALL", "P0", "P1", "P2"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`py-1 px-2 rounded-lg border transition-colors cursor-pointer ${
                    priorityFilter === p
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {p === "ALL" ? "All Priorities" : `${p} Only`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Map Legend Bar */}
      <div className="absolute bottom-3 left-3 right-3 z-10 bg-white/95 backdrop-blur-md p-2 px-3 rounded-2xl border border-slate-200/90 shadow-md flex flex-wrap items-center justify-between gap-3 text-[11px] font-bold text-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] animate-pulse" />
            <span>P0 Hospital Emergency</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
            <span>P1 High</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
            <span>P2 Normal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
            <span>Municipal Truck</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
            <span>AI Hotspot</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded bg-[#10B981]" />
            <span>Active Route</span>
          </div>
        </div>

        <span className="text-[10px] font-semibold text-emerald-800">
          OSRM Dynamic Routing Engine Active
        </span>
      </div>
    </div>
  );
}
