"use client";

import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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
  driverLocation: { lat: number; lng: number } | null;
  assignments: DriverMapIncident[];
  activeIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  routeGeometry: [number, number][];
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
  assignments,
  activeIncidentId,
  onSelectIncident,
  routeGeometry,
}: DriverMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] = driverLocation
      ? [driverLocation.lng, driverLocation.lat]
      : assignments.length > 0
      ? [assignments[0].longitude, assignments[0].latitude]
      : [72.586, 23.033];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
      center: initialCenter,
      zoom: 13,
      pitch: 30,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");

    map.on("load", () => {
      mapRef.current = map;

      // Add route source & layer
      map.addSource("driver-route", {
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

      // Route casing (darker border)
      map.addLayer({
        id: "driver-route-casing",
        type: "line",
        source: "driver-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#064E3B",
          "line-width": 7,
          "line-opacity": 0.5,
        },
      });

      // Route main line
      map.addLayer({
        id: "driver-route-line",
        type: "line",
        source: "driver-route",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#10B981",
          "line-width": 5,
          "line-opacity": 0.9,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Update Driver Marker
  useEffect(() => {
    if (!mapRef.current || !driverLocation) return;

    if (!driverMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "driver-gps-marker";
      el.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px;">
          <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: rgba(16, 185, 129, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 34px; height: 34px; border-radius: 50%; background: #065F46; border: 2.5px solid #FFFFFF; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 16px;">
            🚛
          </div>
        </div>
      `;

      driverMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([driverLocation.lng, driverLocation.lat])
        .addTo(mapRef.current);
    } else {
      driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
    }
  }, [driverLocation]);

  // 3. Update Incident Markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear previous markers
    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    assignments.forEach((inc) => {
      const isSelected = inc.id === activeIncidentId;
      const color = PRIORITY_COLORS[inc.priority] || "#2563EB";

      const el = document.createElement("div");
      el.className = `incident-pin ${isSelected ? "selected" : ""}`;
      el.style.cursor = "pointer";
      el.innerHTML = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 32px;
          height: 32px;
          padding: 0 8px;
          border-radius: 16px;
          background: ${color};
          color: white;
          font-weight: 800;
          font-size: 11px;
          border: 2.5px solid ${isSelected ? "#FCD34D" : "#FFFFFF"};
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
          transform: ${isSelected ? "scale(1.15)" : "scale(1)"};
          transition: transform 0.2s ease;
        ">
          #${inc.sequence} ${inc.priority}
        </div>
      `;

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectIncident(inc.id);
      });

      const popup = new maplibregl.Popup({ offset: 15, closeButton: false }).setHTML(`
        <div style="padding: 6px; font-family: sans-serif; font-size: 12px;">
          <div style="font-weight: bold; color: #0F172A; margin-bottom: 2px;">${inc.title}</div>
          <div style="color: #64748B; font-size: 11px; margin-bottom: 4px;">${inc.address}</div>
          <div style="display: flex; gap: 4px; align-items: center;">
            <span style="background: ${color}20; color: ${color}; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${inc.priority}</span>
            <span style="background: #F1F5F9; color: #475569; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${inc.category}</span>
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([inc.longitude, inc.latitude])
        .setPopup(popup)
        .addTo(mapRef.current!);

      incidentMarkersRef.current.push(marker);
    });
  }, [assignments, activeIncidentId, onSelectIncident]);

  // 4. Update Route Geometry on Map
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (map.isStyleLoaded()) {
      const source = map.getSource("driver-route") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: routeGeometry.length > 0 ? routeGeometry : [],
          },
        });
      }

      // Auto-fit bounds if we have coordinates
      if (routeGeometry.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        routeGeometry.forEach((coord) => bounds.extend(coord as [number, number]));
        if (driverLocation) bounds.extend([driverLocation.lng, driverLocation.lat]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
      }
    }
  }, [routeGeometry, driverLocation]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-2xl overflow-hidden shadow-inner border border-slate-200">
      <div ref={mapContainerRef} className="w-full h-full min-h-[420px]" />
      
      {/* Map Overlay Badge */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-sm text-xs font-bold text-slate-800">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>Live Navigation Map</span>
        <span className="text-[10px] font-normal text-slate-500">({assignments.length} Stops)</span>
      </div>
    </div>
  );
}
