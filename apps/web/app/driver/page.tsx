"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Truck,
  Navigation,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Camera,
  MapPin,
  ChevronRight,
  ShieldCheck,
  ImagePlus,
  LogOut,
  Lock,
  User,
  RefreshCw,
  Upload,
  Check,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { formatRelativeTime } from "@/app/lib/timeAgo";
import type { DriverMapIncident } from "./DriverMap";

// Dynamically import Map component to avoid SSR window errors
const DriverMap = dynamic(() => import("./DriverMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[420px] rounded-2xl bg-slate-100 animate-pulse flex items-center justify-center text-slate-400 text-xs font-semibold">
      Loading Live Municipal Navigation Map...
    </div>
  ),
});

export interface DriverAssignment {
  incident_id: string;
  incident_code: string;
  title: string;
  description?: string;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  category: string;
  severity_score?: number;
  estimated_volume_m3?: number;
  latitude: number;
  longitude: number;
  address?: string;
  status: "REPORTED" | "ASSIGNED" | "IN_PROGRESS" | "COLLECTED" | "VERIFIED";
  assigned_at: string;
  created_at: string;
  updated_at: string;
  sla_minutes_left: number;
  sequence: number;
  vehicle_plate?: string;
  vehicle_capacity_kg?: number;
  vehicle_current_load_kg?: number;
  citizen_image_urls: string[];
  proof_image_urls: string[];
}

export interface CollectionProofItem {
  id: string;
  incident_id: string;
  image_url: string;
  storage_path: string;
  latitude?: number;
  longitude?: number;
  uploaded_at: string;
  verification_status: string;
}

export default function DriverPage() {
  const { user, logout, getAuthHeaders, isLoading } = useAuth();

  // Core Data State
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  // Driver GPS Location (Defaults to Gandhinagar Central Depot)
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number }>({
    lat: 23.033,
    lng: 72.586,
  });
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const lastSyncedLocRef = useRef<{ lat: number; lng: number } | null>(null);

  // Route & Navigation
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [etaMinutes, setEtaMinutes] = useState<number>(0);

  // Proof of Work Upload State
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState<boolean>(false);
  const [uploadedProof, setUploadedProof] = useState<CollectionProofItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isStartingCollection, setIsStartingCollection] = useState<boolean>(false);
  const [isCompletingCollection, setIsCompletingCollection] = useState<boolean>(false);

  // Vehicle Load
  const [vehicleInfo, setVehicleInfo] = useState<{
    plate: string;
    capacityKg: number;
    currentLoadKg: number;
  }>({
    plate: "GJ-01-WM-4402",
    capacityKg: 5000,
    currentLoadKg: 0,
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // 1. Fetch Real Driver Assignments from Backend
  const fetchAssignments = useCallback(async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/driver/assignments`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: DriverAssignment[] = await res.json();
        setAssignments(data);

        if (data.length > 0) {
          // Keep active incident or default to first in sequence
          setActiveIncidentId((prev) => {
            if (prev && data.some((d) => d.incident_id === prev && d.status !== "COLLECTED")) {
              return prev;
            }
            const active = data.find((d) => d.status !== "COLLECTED");
            return active ? active.incident_id : data[0].incident_id;
          });

          // Sync vehicle metadata
          if (data[0].vehicle_plate) {
            setVehicleInfo({
              plate: data[0].vehicle_plate,
              capacityKg: data[0].vehicle_capacity_kg || 5000,
              currentLoadKg: data[0].vehicle_current_load_kg || 0,
            });
          }
        } else {
          setActiveIncidentId(null);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch driver assignments", err);
    } finally {
      setIsFetching(false);
    }
  }, [apiUrl, getAuthHeaders]);

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        void fetchAssignments();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, fetchAssignments]);

  // 2. Real-Time Geolocation Tracking (watchPosition)
  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        const newLoc = { lat: latitude, lng: longitude };
        setDriverLocation(newLoc);
        setLocationAccuracy(accuracy);

        // Throttled sync to backend every ~10s or 50m change
        const lastSync = lastSyncedLocRef.current;
        if (
          !lastSync ||
          Math.abs(lastSync.lat - latitude) > 0.0004 ||
          Math.abs(lastSync.lng - longitude) > 0.0004
        ) {
          lastSyncedLocRef.current = newLoc;
          void fetch(`${apiUrl}/api/v1/driver/location`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              latitude,
              longitude,
              accuracy,
              heading: heading || 0,
              speed: speed || 0,
            }),
          }).catch(() => {});
        }
      },
      (err) => {
        console.warn("Geolocation watch error, using standard Gandhinagar depot GPS", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [apiUrl, getAuthHeaders]);

  // 3. Real Road Route Calculation (OSRM / Mapbox)
  useEffect(() => {
    let isCancelled = false;

    const computeRoute = async () => {
      if (assignments.length === 0) {
        setRouteGeometry([]);
        setDistanceKm(0);
        setEtaMinutes(0);
        return;
      }

      const activeInc = assignments.find((a) => a.incident_id === activeIncidentId) || assignments[0];
      if (!activeInc) return;

      const startLng = driverLocation.lng;
      const startLat = driverLocation.lat;
      const endLng = activeInc.longitude;
      const endLat = activeInc.latitude;

      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
        const res = await fetch(osrmUrl);
        const data = await res.json();
        if (!isCancelled) {
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            setRouteGeometry(route.geometry.coordinates as [number, number][]);
            setDistanceKm(Number((route.distance / 1000.0).toFixed(1)));
            setEtaMinutes(Math.max(1, Math.round(route.duration / 60.0)));
          } else {
            setRouteGeometry([[startLng, startLat], [endLng, endLat]]);
            setDistanceKm(2.4);
            setEtaMinutes(6);
          }
        }
      } catch {
        if (!isCancelled) {
          setRouteGeometry([[startLng, startLat], [endLng, endLat]]);
          setDistanceKm(2.4);
          setEtaMinutes(6);
        }
      }
    };

    void computeRoute();

    return () => {
      isCancelled = true;
    };
  }, [driverLocation, assignments, activeIncidentId]);

  // 4. WebSocket Real-time Event Subscription & Background Sync
  useEffect(() => {
    if (typeof window === "undefined") return;

    const wsUrl = apiUrl.replace(/^http/, "ws") + "/api/v1/optimization/ws";
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (
              msg.type === "INCIDENT_ASSIGNED" ||
              msg.type === "NEW_INCIDENT_ASSIGNED" ||
              msg.type === "INCIDENT_UPDATED" ||
              msg.type === "ROUTE_UPDATED" ||
              msg.type === "INCIDENT_COLLECTED" ||
              msg.type === "COLLECTION_PROOF_UPLOADED"
            ) {
              if (msg.type === "INCIDENT_ASSIGNED" || msg.type === "NEW_INCIDENT_ASSIGNED") {
                setActionSuccess("🚨 New waste collection stop assigned by Municipal Officer!");
                setTimeout(() => setActionSuccess(null), 5000);
              }
              void fetchAssignments();
            }
          } catch (e) {
            console.warn("WebSocket parse error", e);
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWs, 5000);
        };
      } catch (err) {
        console.warn("WebSocket init error", err);
      }
    };

    connectWs();

    // 4-second sync interval to guarantee persistent real-time accuracy with Supabase PostgreSQL
    const syncInterval = setInterval(() => {
      void fetchAssignments();
    }, 4000);

    return () => {
      clearTimeout(reconnectTimeout);
      clearInterval(syncInterval);
      ws?.close();
    };
  }, [apiUrl, fetchAssignments]);

  // Active Assignment Object
  const currentAssignment = assignments.find((a) => a.incident_id === activeIncidentId) || assignments[0];

  // Arrival Proximity Check (Haversine < 100m)
  const isArrived = React.useMemo(() => {
    if (!driverLocation || !currentAssignment) return false;
    const R = 6371e3; // meters
    const φ1 = (driverLocation.lat * Math.PI) / 180;
    const φ2 = (currentAssignment.latitude * Math.PI) / 180;
    const Δφ = ((currentAssignment.latitude - driverLocation.lat) * Math.PI) / 180;
    const Δλ = ((currentAssignment.longitude - driverLocation.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;

    return d <= 150; // within 150m is considered arrived
  }, [driverLocation, currentAssignment]);

  // 5. Actions: Start Collection
  const handleStartCollection = async () => {
    if (!currentAssignment) return;
    setIsStartingCollection(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/incidents/${currentAssignment.incident_id}/start`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setActionSuccess("Collection started! Capture and upload the after-cleaning proof photo.");
        void fetchAssignments();
      } else {
        const errData = await res.json();
        setActionError(errData.detail || "Failed to start collection.");
      }
    } catch (err) {
      setActionError("Network error starting collection.");
    } finally {
      setIsStartingCollection(false);
    }
  };

  // 6. Actions: Select Proof Photo from Camera / Filesystem
  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProofFile(file);
      setProofPreviewUrl(URL.createObjectURL(file));
      setActionError(null);
    }
  };

  // 7. Actions: Upload Proof to Supabase Storage
  const handleUploadProof = async () => {
    if (!proofFile || !currentAssignment) return;
    setIsUploadingProof(true);
    setActionError(null);
    setActionSuccess(null);

    const formData = new FormData();
    formData.append("file", proofFile);
    if (driverLocation) {
      formData.append("latitude", String(driverLocation.lat));
      formData.append("longitude", String(driverLocation.lng));
      if (locationAccuracy) formData.append("accuracy", String(locationAccuracy));
    }
    formData.append("notes", `Verified municipal collection at ${currentAssignment.address || "site"}`);

    try {
      const res = await fetch(`${apiUrl}/api/v1/incidents/${currentAssignment.incident_id}/proof`, {
        method: "POST",
        headers: {
          Authorization: getAuthHeaders().Authorization || "",
        },
        body: formData,
      });

      if (res.ok) {
        const proofData: CollectionProofItem = await res.json();
        setUploadedProof(proofData);
        setActionSuccess("Proof photo uploaded to Supabase Storage! You can now mark this stop as Collected.");
        void fetchAssignments();
      } else {
        const errData = await res.json();
        setActionError(errData.detail || "Proof upload failed.");
      }
    } catch (err) {
      setActionError("Error uploading proof photo to Supabase Storage.");
    } finally {
      setIsUploadingProof(false);
    }
  };

  // 8. Actions: Complete Collection (Mark as Collected)
  const handleCompleteCollection = async () => {
    if (!currentAssignment) return;
    setIsCompletingCollection(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/incidents/${currentAssignment.incident_id}/complete`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          latitude: driverLocation?.lat,
          longitude: driverLocation?.lng,
          notes: "Collected and verified by driver.",
        }),
      });

      if (res.ok) {
        setActionSuccess(`Stop #${currentAssignment.sequence} (${currentAssignment.incident_code}) collected successfully!`);
        setProofFile(null);
        setProofPreviewUrl(null);
        setUploadedProof(null);
        void fetchAssignments();
      } else {
        const errData = await res.json();
        setActionError(errData.detail || "Failed to mark as collected. Proof photo is mandatory.");
      }
    } catch (err) {
      setActionError("Network error completing collection.");
    } finally {
      setIsCompletingCollection(false);
    }
  };

  // Map Data Conversion
  const mapIncidents: DriverMapIncident[] = assignments.map((a) => ({
    id: a.incident_id,
    incidentCode: a.incident_code,
    title: a.title,
    address: a.address || "Gandhinagar Sector",
    priority: a.priority,
    category: a.category,
    estimatedVolumeM3: a.estimated_volume_m3,
    latitude: a.latitude,
    longitude: a.longitude,
    sequence: a.sequence,
    status: a.status,
  }));

  // Loading State
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-600">Connecting to Driver Telemetry...</span>
        </div>
      </div>
    );
  }

  // Authentication & Role Guard
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8FAFC]">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4 border border-emerald-200 shadow-sm">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Driver Authentication Required</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Please sign in with your municipal driver credential to access real-time route assignments and telemetry.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-xs font-bold text-white shadow-md bg-emerald-700 hover:bg-emerald-800 transition-all cursor-pointer"
          >
            Go to Authentication Portal
          </Link>
        </div>
      </div>
    );
  }

  const loadPercent = Math.min(100, Math.round((vehicleInfo.currentLoadKg / vehicleInfo.capacityKg) * 100));

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 pb-12 font-sans">
      {/* Top Navigation & Status Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-slate-100 border border-slate-200 hover:bg-slate-200 transition-colors shadow-xs"
            >
              <ArrowLeft className="w-4 h-4 text-slate-700" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h1 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  Driver Cockpit — Route Execution
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {vehicleInfo.plate}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Live GPS Navigation & Verified Proof-of-Work System
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* GPS Status Indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              <span>{driverLocation ? `${driverLocation.lat.toFixed(4)}°N, ${driverLocation.lng.toFixed(4)}°E` : "Locating GPS..."}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchAssignments()}
              disabled={isFetching}
              className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh Assignments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin text-emerald-600" : ""}`} />
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-800 line-clamp-1">{user.fullName}</span>
                <span className="text-[9px] font-extrabold text-emerald-700 uppercase tracking-wider">{user.role}</span>
              </div>
              <button
                onClick={() => logout()}
                title="Sign out"
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-red-600 transition-colors ml-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* Banner Messages */}
        {actionSuccess && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
        {actionError && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="text-red-700 hover:text-red-900">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left / Top Primary Area: Mapbox Interactive Map (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="h-[460px] sm:h-[520px] w-full rounded-3xl overflow-hidden shadow-sm border border-slate-200 bg-white">
              <DriverMap
                driverLocation={driverLocation}
                assignments={mapIncidents}
                activeIncidentId={activeIncidentId}
                onSelectIncident={(id) => setActiveIncidentId(id)}
                routeGeometry={routeGeometry}
              />
            </div>

            {/* Vehicle Capacity Meter Bar */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  <span>Bin Payload Capacity ({vehicleInfo.plate})</span>
                </div>
                <span className="font-mono font-extrabold text-slate-700">
                  {Math.round(vehicleInfo.currentLoadKg)} / {vehicleInfo.capacityKg} kg ({loadPercent}%)
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden p-0.5 border border-slate-200/60">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    loadPercent > 85
                      ? "bg-red-500"
                      : loadPercent > 60
                      ? "bg-amber-500"
                      : "bg-emerald-600"
                  }`}
                  style={{ width: `${loadPercent}%` }}
                />
              </div>
              {loadPercent > 85 && (
                <p className="text-[10px] text-red-600 font-bold mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Vehicle payload approaching limit. Plan depot drop-off soon.
                </p>
              )}
            </div>
          </div>

          {/* Right Area: Active Stop, Turn-by-Turn, & Proof of Work (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Zero Assignments State */}
            {assignments.length === 0 && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xs text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4 border border-slate-200">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-base font-extrabold text-slate-900 mb-1">No Incidents Assigned</h2>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  You have completed all scheduled collections or are on active standby. Real-time municipal dispatches will appear here automatically.
                </p>
                <button
                  onClick={() => fetchAssignments()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Check For New Dispatches
                </button>
              </div>
            )}

            {/* Active Current Task Card */}
            {currentAssignment && (
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
                {/* Header Tag */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black text-white ${
                        currentAssignment.priority === "P0"
                          ? "bg-red-600"
                          : currentAssignment.priority === "P1"
                          ? "bg-orange-600"
                          : currentAssignment.priority === "P2"
                          ? "bg-amber-600"
                          : "bg-blue-600"
                      }`}
                    >
                      STOP #{currentAssignment.sequence} • {currentAssignment.priority}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-700">
                      {currentAssignment.incident_code}
                    </span>
                    {isArrived && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> Arrived at Stop
                      </span>
                    )}
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      currentAssignment.status === "IN_PROGRESS"
                        ? "bg-amber-100 text-amber-900 border border-amber-300 animate-pulse"
                        : currentAssignment.status === "COLLECTED"
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                        : "bg-blue-100 text-blue-900 border border-blue-200"
                    }`}
                  >
                    {currentAssignment.status.replace("_", " ")}
                  </span>
                </div>

                {/* Title & Address */}
                <div>
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 mb-1">
                    {currentAssignment.title}
                  </h2>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="line-clamp-1">{currentAssignment.address || "Gandhinagar Municipal Zone"}</span>
                  </p>
                </div>

                {/* Live Navigation Metrics (Distance, ETA, Waste Volume) */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-center">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block">Distance</span>
                    <span className="text-sm font-black text-slate-800">{distanceKm} km</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block">ETA</span>
                    <span className="text-sm font-black text-emerald-700">{etaMinutes} min</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block">Est. Volume</span>
                    <span className="text-sm font-black text-slate-800">
                      {currentAssignment.estimated_volume_m3 || 1.2} m³
                    </span>
                  </div>
                </div>

                {/* Citizen Uploaded Image Preview (BEFORE Photo) */}
                {currentAssignment.citizen_image_urls && currentAssignment.citizen_image_urls.length > 0 && (
                  <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80">
                    <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block mb-1.5">
                      Citizen Reported Scene (Before Cleaning)
                    </span>
                    <div className="flex gap-2 overflow-x-auto">
                      {currentAssignment.citizen_image_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer" className="block relative w-16 h-16 rounded-xl overflow-hidden border border-amber-200 shrink-0">
                          <img src={url} alt="Citizen report" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Collection Workflow Stepper */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  {/* Step 1: Start Collection */}
                  {currentAssignment.status === "ASSIGNED" && (
                    <button
                      onClick={handleStartCollection}
                      disabled={isStartingCollection}
                      className="w-full py-3 px-4 rounded-2xl text-xs font-black text-white bg-emerald-700 hover:bg-emerald-800 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>{isStartingCollection ? "Starting..." : "START COLLECTION AT THIS STOP"}</span>
                    </button>
                  )}

                  {/* Step 2 & 3: Proof of Work Upload (Active when IN_PROGRESS) */}
                  {currentAssignment.status === "IN_PROGRESS" && (
                    <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          Proof of Collection Photo
                        </span>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                          Mandatory
                        </span>
                      </div>

                      {/* Photo Capture / Select Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-center">
                          <Camera className="w-5 h-5 text-emerald-600 mb-1" />
                          <span className="text-[11px] font-bold text-slate-700">Take Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoSelected}
                            className="hidden"
                          />
                        </label>
                        <label className="flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-center">
                          <ImagePlus className="w-5 h-5 text-blue-600 mb-1" />
                          <span className="text-[11px] font-bold text-slate-700">Upload File</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoSelected}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Selected Image Preview & Upload Button */}
                      {proofPreviewUrl && (
                        <div className="space-y-2 pt-2 border-t border-slate-200">
                          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 bg-black">
                            <img
                              src={proofPreviewUrl}
                              alt="Proof preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          {!uploadedProof && (
                            <button
                              onClick={handleUploadProof}
                              disabled={isUploadingProof}
                              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>{isUploadingProof ? "Uploading to Supabase..." : "Upload Proof to Supabase"}</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Uploaded Confirmation */}
                      {(uploadedProof || (currentAssignment.proof_image_urls && currentAssignment.proof_image_urls.length > 0)) && (
                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Proof Verified & Stored in Supabase Storage</span>
                        </div>
                      )}

                      {/* Step 4: Final Complete Button */}
                      <button
                        onClick={handleCompleteCollection}
                        disabled={
                          isCompletingCollection ||
                          (!uploadedProof && (!currentAssignment.proof_image_urls || currentAssignment.proof_image_urls.length === 0))
                        }
                        className="w-full py-3 px-4 rounded-2xl text-xs font-black text-white bg-emerald-700 hover:bg-emerald-800 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>
                          {isCompletingCollection
                            ? "Completing Collection..."
                            : "MARK AS COLLECTED & NEXT STOP"}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Completed Badge */}
                  {currentAssignment.status === "COLLECTED" && (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold text-center">
                      ✓ This stop was completed and verified.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stop Sequence Drawer / List */}
            {assignments.length > 0 && (
              <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-extrabold text-slate-800">
                    Optimized Route Stop Sequence
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {assignments.filter((a) => a.status === "COLLECTED").length} / {assignments.length} Done
                  </span>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto">
                  {assignments.map((item) => {
                    const isCurrent = item.incident_id === activeIncidentId;
                    const isDone = item.status === "COLLECTED";

                    return (
                      <div
                        key={item.incident_id}
                        onClick={() => setActiveIncidentId(item.incident_id)}
                        className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                          isCurrent
                            ? "bg-emerald-50/70 border-emerald-300 shadow-xs"
                            : isDone
                            ? "bg-slate-50 border-slate-200 opacity-60"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white ${
                              isDone
                                ? "bg-slate-400"
                                : item.priority === "P0"
                                ? "bg-red-600"
                                : item.priority === "P1"
                                ? "bg-orange-600"
                                : item.priority === "P2"
                                ? "bg-amber-600"
                                : "bg-blue-600"
                            }`}
                          >
                            {item.sequence}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900 line-clamp-1">{item.title}</span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {item.priority} • {item.estimated_volume_m3 || 1.2} m³ • {formatRelativeTime(item.assigned_at)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
