"use client";

import React, { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * WasteWise AI — MapLibre Map Component
 * Source of truth: design_guide.md §7
 *
 * Muted warm basemap styling, forest-green boundaries, amber/coral incident markers,
 * aqua vehicle markers, and dynamic emerald-green route polylines.
 */

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  title: string;
  priority?: "P0" | "P1" | "P2" | "P3" | "P4";
  type?: "incident" | "vehicle" | "hotspot";
  status?: string;
}

export interface MapProps {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  points?: MapPoint[];
  routePolyline?: Array<[number, number]>; // Array of [lng, lat]
  onSelectPoint?: (point: MapPoint) => void;
  interactive?: boolean;
}

export default function MapLibreView({
  center = [72.5714, 23.0225], // Default: Ahmedabad / Gandhinagar region (SIH LDRP-ITR)
  zoom = 12.5,
  points = [],
  routePolyline = [],
  onSelectPoint,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Custom OpenStreetMap raster tile style with warm tinting filter
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors, © CARTO",
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm",
            minzoom: 0,
            maxzoom: 19,
            paint: {
              "raster-saturation": -0.35,
              "raster-contrast": 0.08,
            },
          },
        ],
      },
      center: center,
      zoom: zoom,
    });

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.current.on("load", () => {
      // Add Route Source
      if (map.current && !map.current.getSource("route-line")) {
        map.current.addSource("route-line", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: routePolyline.length > 0 ? routePolyline : [],
            },
          },
        });

        // Add Route Layer (Emerald Green #1F5E3F)
        map.current.addLayer({
          id: "route-line-layer",
          type: "line",
          source: "route-line",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#1F5E3F",
            "line-width": 4,
            "line-opacity": 0.85,
          },
        });
      }
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, zoom]);

  // Update Route Polyline when coordinates change dynamically (Loop C)
  useEffect(() => {
    if (!map.current) return;
    const source = map.current.getSource("route-line") as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routePolyline,
        },
      });
    }
  }, [routePolyline]);

  // Update markers when points change
  useEffect(() => {
    if (!map.current) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Severity color mapping per design_guide.md §2
    const priorityColors: Record<string, string> = {
      P0: "#C1272D",
      P1: "#E86A33",
      P2: "#E3A62F",
      P3: "#2B8C86",
      P4: "#1F5E3F",
    };

    points.forEach((point) => {
      // Create root marker element (clean, no Tailwind transform to prevent matrix jitter)
      const el = document.createElement("div");
      el.style.cursor = "pointer";
      el.style.userSelect = "none";

      if (point.type === "vehicle") {
        el.innerHTML = `
          <div style="background-color: #2B8C86; color: white; width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.25); border: 2px solid white; font-weight: bold; font-size: 14px; transition: transform 0.15s ease-out;" onmouseenter="this.style.transform='scale(1.15)'" onmouseleave="this.style.transform='scale(1)'">
            🚛
          </div>
        `;
      } else if (point.type === "hotspot") {
        el.innerHTML = `
          <div style="background-color: #E86A33; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(232, 106, 51, 0.4); border: 2px solid white; font-weight: 800; font-size: 11px; transition: transform 0.15s ease-out;" onmouseenter="this.style.transform='scale(1.15)'" onmouseleave="this.style.transform='scale(1)'">
            🔥
          </div>
        `;
      } else {
        const color = priorityColors[point.priority || "P3"] || "#E86A33";
        el.innerHTML = `
          <div style="background-color: ${color}; color: white; min-width: 28px; height: 28px; padding: 0 7px; border-radius: 14px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,0.25); border: 2px solid white; font-weight: 700; font-size: 11px; transition: transform 0.15s ease-out;" onmouseenter="this.style.transform='scale(1.15)'" onmouseleave="this.style.transform='scale(1)'">
            ${point.priority || "!"}
          </div>
        `;
      }

      // Create rich tooltip popup
      const popup = new maplibregl.Popup({
        offset: 18,
        closeButton: false,
        closeOnClick: false,
        className: "custom-map-popup",
      }).setHTML(`
        <div style="font-family: inherit; font-size: 12px; font-weight: 600; color: #14201A; padding: 2px 4px;">
          ${point.title}
        </div>
      `);

      el.addEventListener("mouseenter", () => {
        popup.setLngLat([point.lng, point.lat]).addTo(map.current!);
      });

      el.addEventListener("mouseleave", () => {
        popup.remove();
      });

      el.addEventListener("click", () => {
        onSelectPoint?.(point);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([point.lng, point.lat])
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [points, onSelectPoint]);

  return (
    <div className="relative w-full h-full min-h-[350px] rounded-2xl overflow-hidden shadow-inner border border-slate-200">
      <div ref={mapContainer} className="w-full h-full" />
    </div>
  );
}
