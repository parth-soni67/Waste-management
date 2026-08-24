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
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import { formatRelativeTime } from "@/app/lib/timeAgo";
import type { DriverMapIncident } from "./DriverMap";
import CameraCaptureModal from "./CameraCaptureModal";

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

function computeHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // in meters
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
  const [routeError, setRouteError] = useState<boolean>(false);

  // Proof of Work & Camera Modal
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
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
        console.warn("Geolocation watch info", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [apiUrl, getAuthHeaders]);

  // 3. Real Road Route Calculation (Mapbox / OSRM)
  const computeRoute = useCallback(async () => {
    if (assignments.length === 0) {
      setRouteGeometry([]);
      setDistanceKm(0);
      setEtaMinutes(0);
      setRouteError(false);
      return;
    }

    const activeInc = assignments.find((a) => a.incident_id === activeIncidentId) || assignments[0];
    if (!activeInc) return;

    const startLng = driverLocation.lng;
    const startLat = driverLocation.lat;
    const endLng = activeInc.longitude;
    const endLat = activeInc.latitude;

    const directDistKm = Number(
      (computeHaversineDistance(startLat, startLng, endLat, endLng) / 1000.0).toFixed(1)
    );

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    // Try Mapbox Directions API if configured
    if (mapboxToken) {
      try {
        const mbUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`;
        const res = await fetch(mbUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            setRouteGeometry(route.geometry.coordinates as [number, number][]);
            setDistanceKm(Number((route.distance / 1000.0).toFixed(1)));
            setEtaMinutes(Math.max(1, Math.round(route.duration / 60.0)));
            setRouteError(false);
            return;
          }
        }
      } catch {}
    }

    // Try Public OSRM Directions
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
      const res = await fetch(osrmUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          setRouteGeometry(route.geometry.coordinates as [number, number][]);
          setDistanceKm(Number((route.distance / 1000.0).toFixed(1)));
          setEtaMinutes(Math.max(1, Math.round(route.duration / 60.0)));
          setRouteError(false);
          return;
        }
      }
    } catch {}

    // Fallback to direct geometric bearing
    setRouteGeometry([[startLng, startLat], [endLng, endLat]]);
    setDistanceKm(directDistKm);
    setEtaMinutes(Math.max(1, Math.round((directDistKm / 25.0) * 60.0))); // ~25 km/h urban speed
    setRouteError(true);
  }, [driverLocation, assignments, activeIncidentId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void computeRoute();
    }, 0);
    return () => clearTimeout(timer);
  }, [computeRoute]);

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
              msg.type === "COLLECTION_PROOF_UPLOADED" ||
              msg.type === "INCIDENT_PROOF_SUBMITTED"
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

  // Arrival Proximity & GPS Distance Check
  const distanceToIncidentMeters = React.useMemo(() => {
    if (!driverLocation || !currentAssignment) return null;
    return Math.round(
      computeHaversineDistance(
        driverLocation.lat,
        driverLocation.lng,
        currentAssignment.latitude,
        currentAssignment.longitude
      )
    );
  }, [driverLocation, currentAssignment]);

  const isArrived = distanceToIncidentMeters !== null && distanceToIncidentMeters <= 150;

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
    } catch {
      setActionError("Network error starting collection.");
    } finally {
      setIsStartingCollection(false);
    }
  };

  // 6. Actions: Handle Photo Captured from Camera Modal
  const handlePhotoCapturedFromModal = (file: File, previewUrl: string) => {
    setProofFile(file);
    setProofPreviewUrl(previewUrl);
    setActionError(null);
    setActionSuccess("Photo captured with device camera. Ready to upload.");
  };

  // 7. Actions: Select Photo from Device Filesystem
  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProofFile(file);
      setProofPreviewUrl(URL.createObjectURL(file));
      setActionError(null);
    }
  };

  // 8. Actions: Upload Proof to Supabase Storage
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
    } catch {
      setActionError("Error uploading proof photo to Supabase Storage.");
    } finally {
      setIsUploadingProof(false);
    }
  };

  // 9. Actions: Complete Collection (Mark as Collected)
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
    } catch {
      setActionError("Network error completing collection.");
    } finally {
      setIsCompletingCollection(false);
    }
  };

  // Convert assignments for Map representation
  const mapIncidents: DriverMapIncident[] = React.useMemo(() => {
    return assignments.map((a) => ({
      id: a.incident_id,
      incidentCode: a.incident_code,
      title: a.title,
      address: a.address || "Gandhinagar Municipal Zone",
      priority: a.priority,
      category: a.category,
      estimatedVolumeM3: a.estimated_volume_m3,
      latitude: a.latitude,
      longitude: a.longitude,
      sequence: a.sequence,
      status: a.status,
    }));
  }, [assignments]);

  // Auth Guard: Only Authenticated Drivers
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== "driver" && user.role !== "DRIVER" && user.role !== "officer" && user.role !== "admin")) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-red-900/40 border border-red-500/40 flex items-center justify-center mx-auto text-red-400">
            <Lock className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-white">Municipal Driver Access Required</h1>
          <p className="text-xs text-slate-400">
            Please log in with an authorized Municipal Driver credential to access vehicle telemetry and real-time dispatches.
          </p>
          <Link
            href="/"
            className="block w-full py-3 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Go to Platform Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans pb-12">
      {/* Real Browser Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onPhotoCaptured={handlePhotoCapturedFromModal}
      />

      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-800 flex items-center justify-center text-white shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-black text-slate-900 leading-none">
                  WasteWise Cockpit
                </h1>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Municipal Fleet Operations & Route Execution
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Driver Profile Tag */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
              <User className="w-3.5 h-3.5 text-emerald-700" />
              <span>{user.fullName || user.email}</span>
            </div>

            {/* GPS Telemetry Indicator */}
            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden md:inline">GPS Active</span>
              <span className="font-mono text-[10px] text-emerald-600">
                {driverLocation.lat.toFixed(3)}, {driverLocation.lng.toFixed(3)}
              </span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchAssignments()}
              disabled={isFetching}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors disabled:opacity-50 cursor-pointer"
              title="Refresh Assignments"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              className="p-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
        {/* Banner Alert Messages */}
        {actionSuccess && (
          <div className="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {actionError && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-red-700 hover:text-red-900 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Vehicle Telemetry Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Vehicle Registration
            </span>
            <span className="text-sm sm:text-base font-black text-slate-900 font-mono">
              {vehicleInfo.plate}
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Assigned Stops
            </span>
            <span className="text-sm sm:text-base font-black text-emerald-800">
              {assignments.filter((a) => a.status !== "COLLECTED").length} Pending / {assignments.length} Total
            </span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Payload Telemetry
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm sm:text-base font-black text-slate-900">
                {Math.round(vehicleInfo.currentLoadKg)}
              </span>
              <span className="text-xs text-slate-400 font-medium">/ {vehicleInfo.capacityKg} kg</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              GPS Proximity Status
            </span>
            <span className={`text-xs sm:text-sm font-black flex items-center gap-1 ${isArrived ? "text-emerald-600" : "text-slate-700"}`}>
              {isArrived ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Arrived (&lt;150m)
                </>
              ) : distanceToIncidentMeters !== null ? (
                <>
                  <Navigation className="w-3.5 h-3.5 text-blue-600" /> {distanceToIncidentMeters}m to stop
                </>
              ) : (
                "Locating..."
              )}
            </span>
          </div>
        </div>

        {/* 2-Column Responsive Cockpit Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (Map & Navigation) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            <div className="bg-white p-2 sm:p-3 rounded-3xl border border-slate-200 shadow-sm">
              <div className="h-[460px] sm:h-[540px] w-full rounded-2xl overflow-hidden">
                <DriverMap
                  driverLocation={driverLocation}
                  assignments={mapIncidents}
                  activeIncidentId={activeIncidentId}
                  onSelectIncident={(id) => setActiveIncidentId(id)}
                  routeGeometry={routeGeometry}
                  routeError={routeError}
                  onRetryRoute={computeRoute}
                />
              </div>
            </div>
          </div>

          {/* Right Column (Active Stop Dispatch & Mandatory Proof Workflow) */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            {/* Empty State when no dispatches */}
            {assignments.length === 0 && !isFetching && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
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
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block relative w-16 h-16 rounded-xl overflow-hidden border border-amber-200 shrink-0"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
                        {/* 1. Open Real Camera Modal */}
                        <button
                          type="button"
                          onClick={() => setIsCameraModalOpen(true)}
                          className="flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 cursor-pointer transition-colors text-center"
                        >
                          <Camera className="w-5 h-5 text-emerald-700 mb-1" />
                          <span className="text-[11px] font-extrabold text-emerald-900">Take Photo</span>
                          <span className="text-[9px] text-emerald-600">Open Camera</span>
                        </button>

                        {/* 2. Upload from Device Filesystem */}
                        <label className="flex flex-col items-center justify-center p-3 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-center">
                          <ImagePlus className="w-5 h-5 text-blue-600 mb-1" />
                          <span className="text-[11px] font-extrabold text-slate-700">Upload File</span>
                          <span className="text-[9px] text-slate-400">Device Gallery</span>
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
                          <div className="relative w-full h-36 rounded-xl overflow-hidden border border-slate-200 bg-black">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={proofPreviewUrl}
                              alt="Proof preview"
                              className="w-full h-full object-contain"
                            />
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-bold">
                              Selected Proof
                            </div>
                          </div>

                          {/* GPS Proximity Check Tag */}
                          <div className="p-2 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-slate-600">Proof Location Proximity:</span>
                            {distanceToIncidentMeters !== null && distanceToIncidentMeters <= 250 ? (
                              <span className="font-bold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> GPS Verified ({distanceToIncidentMeters}m)
                              </span>
                            ) : distanceToIncidentMeters !== null ? (
                              <span className="font-bold text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Distance: {distanceToIncidentMeters}m
                              </span>
                            ) : (
                              <span className="text-slate-400">GPS Attached</span>
                            )}
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
