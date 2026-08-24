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
  ShieldCheck,
  ImagePlus,
  LogOut,
  Lock,
  User,
  RefreshCw,
  Upload,
  Check,
  CheckCircle2,
  Layers,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth-context";
import type { DriverMapIncident } from "./DriverMap";
import CameraCaptureModal from "./CameraCaptureModal";

// Dynamically import MapLibre Component (disable SSR)
const DriverMap = dynamic(() => import("./DriverMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[440px] bg-slate-900/90 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-3 border border-slate-800">
      <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-slate-300">Initializing Live Navigation Map...</span>
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
  volume_source?: string;
  volume_confidence?: number;
  report_count?: number;
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
  primary_image_urls?: string[];
  cluster_image_urls?: string[];
  citizen_image_urls?: string[];
  proof_image_urls?: string[];
}

export interface CollectionProofItem {
  id: string;
  incident_id: string;
  image_url: string;
  storage_path: string;
  latitude?: number;
  longitude?: number;
  distance_meters?: number;
  uploaded_at: string;
  verification_status: string;
}

function computeHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // in meters
}

function formatDistanceDisplay(meters: number | null): string {
  if (meters === null || isNaN(meters)) return "Calculating...";
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatEtaDisplay(minutes: number | null): string {
  if (minutes === null || isNaN(minutes)) return "Calculating...";
  if (minutes < 1) return "< 1 min";
  if (minutes >= 60) {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  }
  return `${minutes} min`;
}

export default function DriverPage() {
  const { user, logout, getAuthHeaders, isLoading } = useAuth();

  // Core Data State
  const [assignments, setAssignments] = useState<DriverAssignment[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(false);

  // Driver GPS Location
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [isGpsAcquiring, setIsGpsAcquiring] = useState<boolean>(true);
  const lastSyncedLocRef = useRef<{ lat: number; lng: number } | null>(null);

  // Route & Navigation
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
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
          // Keep active incident or default to first pending in sequence
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

  // 2. Real-Time Geolocation Tracking (watchPosition + single lock)
  const refreshGpsLocation = useCallback(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setIsGpsAcquiring(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setDriverLocation({ lat: latitude, lng: longitude });
        setLocationAccuracy(accuracy);
        setIsGpsAcquiring(false);
      },
      (err) => {
        console.warn("GPS acquire note:", err.message);
        setIsGpsAcquiring(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshGpsLocation();
    }, 0);

    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return () => clearTimeout(timer);
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, heading, speed } = pos.coords;
        const newLoc = { lat: latitude, lng: longitude };
        setDriverLocation(newLoc);
        setLocationAccuracy(accuracy);
        setIsGpsAcquiring(false);

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
        setIsGpsAcquiring(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => {
      clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [apiUrl, getAuthHeaders, refreshGpsLocation]);

  // 3. Real Road Route Calculation (Mapbox / OSRM)
  const computeRoute = useCallback(async () => {
    if (assignments.length === 0) {
      setRouteGeometry([]);
      setDistanceMeters(null);
      setEtaMinutes(null);
      setRouteError(false);
      return;
    }

    const activeInc = assignments.find((a) => a.incident_id === activeIncidentId) || assignments[0];
    if (!activeInc) return;

    if (!driverLocation) {
      setRouteGeometry([]);
      setDistanceMeters(null);
      setEtaMinutes(null);
      setRouteError(false);
      return;
    }

    const startLng = driverLocation.lng;
    const startLat = driverLocation.lat;
    const endLng = activeInc.longitude;
    const endLat = activeInc.latitude;

    const directDistM = computeHaversineDistance(startLat, startLng, endLat, endLng);
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
            setDistanceMeters(Math.round(route.distance));
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
          setDistanceMeters(Math.round(route.distance));
          setEtaMinutes(Math.max(1, Math.round(route.duration / 60.0)));
          setRouteError(false);
          return;
        }
      }
    } catch {}

    // Fallback to direct geometric bearing
    setRouteGeometry([[startLng, startLat], [endLng, endLat]]);
    setDistanceMeters(Math.round(directDistM));
    setEtaMinutes(Math.max(1, Math.round((directDistM / 1000.0 / 25.0) * 60.0))); // ~25 km/h urban speed
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
              msg.type === "INCIDENT_PROOF_SUBMITTED" ||
              msg.type === "INCIDENT_VERIFIED" ||
              msg.type === "INCIDENT_PROOF_REJECTED"
            ) {
              if (msg.type === "INCIDENT_ASSIGNED" || msg.type === "NEW_INCIDENT_ASSIGNED") {
                setActionSuccess("🚨 New waste collection stop assigned by Municipal Officer!");
                setTimeout(() => setActionSuccess(null), 5000);
              } else if (msg.type === "INCIDENT_PROOF_REJECTED") {
                setActionError(
                  `⚠️ Proof rejected by Officer: ${msg.rejection_reason || "Area not fully cleared"}. Please retake and upload proof.`
                );
                setUploadedProof(null);
              } else if (msg.type === "INCIDENT_VERIFIED") {
                setActionSuccess("✅ Proof verified by Municipal Officer! Great job.");
                setTimeout(() => setActionSuccess(null), 6000);
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

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [apiUrl, fetchAssignments]);

  // 5. Active Incident Details
  const currentAssignment = assignments.find((a) => a.incident_id === activeIncidentId) || (assignments.length > 0 ? assignments[0] : null);

  // Calculate distance between driver and current incident
  const distanceToIncidentMeters =
    driverLocation && currentAssignment
      ? Math.round(
          computeHaversineDistance(
            driverLocation.lat,
            driverLocation.lng,
            currentAssignment.latitude,
            currentAssignment.longitude
          )
        )
      : null;

  const isArrived = distanceToIncidentMeters !== null && distanceToIncidentMeters <= 150;

  // 6. Action: Start Collection
  const handleStartCollection = async () => {
    if (!currentAssignment) return;
    setIsStartingCollection(true);
    setActionError(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/incidents/${currentAssignment.incident_id}/start`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to start collection");
      }

      setActionSuccess(`Collection started at Stop #${currentAssignment.sequence}. Clean the site and upload proof photo.`);
      setTimeout(() => setActionSuccess(null), 6000);
      await fetchAssignments();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Failed to start collection");
    } finally {
      setIsStartingCollection(false);
    }
  };

  // 7. Action: Handle Camera Photo Captured from Modal
  const handleCameraPhotoCaptured = (file: File, preview: string) => {
    setProofFile(file);
    if (proofPreviewUrl) {
      URL.revokeObjectURL(proofPreviewUrl);
    }
    setProofPreviewUrl(preview);
    setActionSuccess("Photo captured with device camera. Click 'Upload & Verify Proof' below.");
    setTimeout(() => setActionSuccess(null), 5000);
  };

  // 8. Action: Handle File Selected from Device Filesystem
  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProofFile(file);
      if (proofPreviewUrl) {
        URL.revokeObjectURL(proofPreviewUrl);
      }
      setProofPreviewUrl(URL.createObjectURL(file));
    }
  };

  // 9. Action: Upload Proof-of-Work to Supabase Storage
  const handleUploadProof = async () => {
    if (!currentAssignment || !proofFile) return;
    setIsUploadingProof(true);
    setActionError(null);

    try {
      const formData = new FormData();
      formData.append("file", proofFile);
      if (driverLocation) {
        formData.append("latitude", driverLocation.lat.toString());
        formData.append("longitude", driverLocation.lng.toString());
      }
      if (locationAccuracy) {
        formData.append("accuracy", locationAccuracy.toString());
      }
      formData.append("notes", `Cleaned by driver. Plate: ${vehicleInfo.plate}`);

      const res = await fetch(`${apiUrl}/api/v1/incidents/${currentAssignment.incident_id}/proof`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to upload proof of work");
      }

      const proofData: CollectionProofItem = await res.json();
      setUploadedProof(proofData);
      setActionSuccess("Proof photo uploaded and GPS verified! You may now complete this stop.");
      await fetchAssignments();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Proof upload failed");
    } finally {
      setIsUploadingProof(false);
    }
  };

  // 10. Action: Mark Collection Complete
  const handleCompleteCollection = async () => {
    if (!currentAssignment) return;
    if (!uploadedProof && (!currentAssignment.proof_image_urls || currentAssignment.proof_image_urls.length === 0)) {
      setActionError("Proof-of-work photo is required before completing this stop.");
      return;
    }
    setIsCompletingCollection(true);
    setActionError(null);

    try {
      const bodyPayload = driverLocation
        ? { latitude: driverLocation.lat, longitude: driverLocation.lng, notes: "Complete" }
        : { notes: "Complete" };

      const res = await fetch(`${apiUrl}/api/v1/incidents/${currentAssignment.incident_id}/complete`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Cannot complete collection without uploaded photo proof");
      }

      setActionSuccess(`✅ Stop #${currentAssignment.sequence} (${currentAssignment.incident_code}) collected successfully!`);
      setTimeout(() => setActionSuccess(null), 6000);

      // Reset proof state for next stop
      setProofFile(null);
      if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
      setProofPreviewUrl(null);
      setUploadedProof(null);

      await fetchAssignments();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Completion failed");
    } finally {
      setIsCompletingCollection(false);
    }
  };

  // Map Data Conversion
  const mapIncidents: DriverMapIncident[] = assignments.map((a) => ({
    id: a.incident_id,
    incidentCode: a.incident_code,
    title: a.title,
    address: a.address || "Municipal Sector",
    priority: a.priority,
    category: a.category,
    estimatedVolumeM3: a.estimated_volume_m3,
    latitude: a.latitude,
    longitude: a.longitude,
    sequence: a.sequence,
    status: a.status,
  }));

  // Render Gate: Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-emerald-800">
          <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider">Loading Driver Cockpit...</span>
        </div>
      </div>
    );
  }

  // Render Gate: Unauthenticated or Not Driver
  if (!user || (user.role !== "driver" && user.role !== "officer" && user.role !== "admin")) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 border border-slate-200 shadow-xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4 text-amber-700">
            <Lock className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Driver Authentication Required</h1>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Please log in with an authorized Municipal Driver account to access vehicle navigation, route dispatches, and proof-of-work submission.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-all shadow-md"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      {/* Top Cockpit Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              title="Home"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 leading-tight">
                  Driver Cockpit
                </h1>
                <p className="text-[11px] font-medium text-slate-500">
                  Municipal Fleet Operations & Route Navigation
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
            <div
              onClick={refreshGpsLocation}
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-900 cursor-pointer hover:bg-emerald-100 transition-colors"
              title="Click to refresh GPS fix"
            >
              <span className={`w-2 h-2 rounded-full ${driverLocation ? "bg-emerald-600 animate-pulse" : "bg-amber-500 animate-ping"}`} />
              <span className="hidden md:inline">
                {driverLocation ? "GPS Active" : isGpsAcquiring ? "Acquiring GPS..." : "GPS Standby"}
              </span>
              {driverLocation && (
                <span className="font-mono text-[10px] text-emerald-700 font-bold">
                  {driverLocation.lat.toFixed(4)}°N, {driverLocation.lng.toFixed(4)}°E
                </span>
              )}
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
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold px-2"
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
              className="text-red-700 hover:text-red-900 cursor-pointer font-bold px-2"
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
            <span className={`text-xs sm:text-sm font-black flex items-center gap-1.5 ${isArrived ? "text-emerald-600" : "text-slate-700"}`}>
              {isArrived ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Arrived (&le;150m)
                </>
              ) : distanceToIncidentMeters !== null ? (
                <>
                  <Navigation className="w-3.5 h-3.5 text-blue-600" /> {formatDistanceDisplay(distanceToIncidentMeters)} to stop
                </>
              ) : isGpsAcquiring ? (
                "Acquiring GPS..."
              ) : (
                "Waiting for GPS fix"
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

            {/* Sequence of Stops Carousel */}
            {assignments.length > 0 && (
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                    Optimized Collection Sequence
                  </h3>
                  <span className="text-[11px] font-bold text-slate-500">
                    {assignments.length} {assignments.length === 1 ? "Stop" : "Stops"}
                  </span>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2">
                  {assignments.map((assignment) => {
                    const isSelected = assignment.incident_id === activeIncidentId;
                    const isCollected = assignment.status === "COLLECTED";

                    return (
                      <button
                        key={assignment.incident_id}
                        onClick={() => setActiveIncidentId(assignment.incident_id)}
                        className={`shrink-0 w-52 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-500/20"
                            : isCollected
                            ? "border-slate-200 bg-slate-50/50 opacity-60"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-black text-white ${
                              assignment.priority === "P0"
                                ? "bg-red-600"
                                : assignment.priority === "P1"
                                ? "bg-orange-600"
                                : assignment.priority === "P2"
                                ? "bg-amber-600"
                                : "bg-blue-600"
                            }`}
                          >
                            STOP #{assignment.sequence} • {assignment.priority}
                          </span>

                          {isCollected ? (
                            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Done
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400">
                              {assignment.incident_code}
                            </span>
                          )}
                        </div>

                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1 mb-1">
                          {assignment.title}
                        </h4>
                        <p className="text-[10px] text-slate-500 line-clamp-1">
                          {assignment.address || "Municipal Sector"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
                    <span className="text-xs sm:text-sm font-black text-slate-800">
                      {distanceMeters !== null ? formatDistanceDisplay(distanceMeters) : "Acquiring..."}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block">ETA</span>
                    <span className="text-xs sm:text-sm font-black text-emerald-700">
                      {etaMinutes !== null ? formatEtaDisplay(etaMinutes) : "Calculating..."}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-slate-400 block">Est. Volume</span>
                    <span className="text-xs sm:text-sm font-black text-slate-800">
                      {currentAssignment.estimated_volume_m3 !== undefined
                        ? Number(currentAssignment.estimated_volume_m3).toFixed(2)
                        : "1.50"}{" "}
                      m³
                    </span>
                  </div>
                </div>

                {/* Volume Sourcing Badge */}
                <div className="flex items-center justify-between text-[11px] bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <span className="text-slate-500 font-medium">Volume Calculation:</span>
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-emerald-600" />
                    {currentAssignment.volume_source === "CLUSTER_AGGREGATE"
                      ? `Cluster Aggregated (${currentAssignment.report_count || 1} reports)`
                      : "AI Vision Estimate"}
                  </span>
                </div>

                {/* Primary Citizen Report Photo(s) */}
                {currentAssignment.primary_image_urls && currentAssignment.primary_image_urls.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/90 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Primary Citizen Report — {currentAssignment.primary_image_urls.length} Photo{currentAssignment.primary_image_urls.length > 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] font-bold bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full">
                        Direct Evidence
                      </span>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto pb-1">
                      {currentAssignment.primary_image_urls.map((url, i) => (
                        <a
                          key={`prim-${i}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block relative w-20 h-20 rounded-xl overflow-hidden border-2 border-amber-300 shrink-0 shadow-xs hover:opacity-90 transition-opacity"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Primary citizen report" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clustered Reports Evidence (if multiple citizen reports merged) */}
                {currentAssignment.cluster_image_urls && currentAssignment.cluster_image_urls.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200/90 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Cluster Evidence — {currentAssignment.cluster_image_urls.length} Photo{currentAssignment.cluster_image_urls.length > 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] font-bold bg-blue-200/70 text-blue-900 px-2 py-0.5 rounded-full">
                        {currentAssignment.report_count ? `${currentAssignment.report_count} Clustered Reports` : "Nearby Reports"}
                      </span>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto pb-1">
                      {currentAssignment.cluster_image_urls.map((url, i) => (
                        <a
                          key={`clust-${i}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block relative w-20 h-20 rounded-xl overflow-hidden border-2 border-blue-300 shrink-0 shadow-xs hover:opacity-90 transition-opacity"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Clustered report evidence" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback Citizen Image Preview if legacy incident */}
                {(!currentAssignment.primary_image_urls || currentAssignment.primary_image_urls.length === 0) &&
                  currentAssignment.citizen_image_urls &&
                  currentAssignment.citizen_image_urls.length > 0 && (
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
                                <CheckCircle2 className="w-3.5 h-3.5" /> GPS Verified ({formatDistanceDisplay(distanceToIncidentMeters)})
                              </span>
                            ) : distanceToIncidentMeters !== null ? (
                              <span className="font-bold text-amber-700 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> {formatDistanceDisplay(distanceToIncidentMeters)} from incident
                              </span>
                            ) : (
                              <span className="text-slate-500">Acquiring GPS fix...</span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={handleUploadProof}
                            disabled={isUploadingProof}
                            className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                          >
                            <Upload className="w-4 h-4" />
                            <span>{isUploadingProof ? "Uploading & Verifying..." : "Upload & Verify Proof Photo"}</span>
                          </button>
                        </div>
                      )}

                      {/* Display Existing Uploaded Proof */}
                      {uploadedProof && (
                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <div>
                              <span className="font-bold text-emerald-950 block">Proof Uploaded & Stored</span>
                              <span className="text-[10px] text-emerald-700">Status: {uploadedProof.verification_status}</span>
                            </div>
                          </div>
                          <a
                            href={uploadedProof.image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-emerald-800 underline"
                          >
                            View
                          </a>
                        </div>
                      )}

                      {/* Step 3: Complete Collection Button (Enabled only if proof uploaded) */}
                      <button
                        onClick={handleCompleteCollection}
                        disabled={isCompletingCollection || !uploadedProof}
                        className="w-full py-3 px-4 rounded-2xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isCompletingCollection ? "Submitting..." : "MARK COLLECTED & PROCEED TO NEXT STOP"}</span>
                      </button>
                    </div>
                  )}

                  {/* Completed State */}
                  {currentAssignment.status === "COLLECTED" && (
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
                      <span className="text-xs font-extrabold text-emerald-800 flex items-center justify-center gap-1 mb-0.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" /> Collection Complete
                      </span>
                      <p className="text-[11px] text-emerald-600">
                        Waste collected and verified. Select next stop on map.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Real Browser Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onPhotoCaptured={handleCameraPhotoCaptured}
      />
    </div>
  );
}
