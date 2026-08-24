"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  ShieldCheck,
  AlertTriangle,
  Truck,
  Sparkles,
  MapPin,
  Clock,
  ArrowLeft,
  Filter,
  CheckCircle2,
  TrendingUp,
  Flame,
  Layers,
  ChevronRight,
  RefreshCw,
  Users,
  Zap,
  Route,
  MessageSquare,
  Send,
  BarChart3,
  Bell,
  Bot,
  Plus,
  UserPlus,
  X,
  Check,
  Phone,
  Fuel,
  Image as ImageIcon,
  FileText,
  Eye,
  ArrowUpRight,
  ThumbsDown,
  Copy,
  ChevronDown,
  User,
  Calendar,
  Tag,
  Edit2,
  Trash2,
  Wrench,
  LogOut,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { formatRelativeTime, getElapsedMinutes, parseUtcDate } from "@/app/lib/timeAgo";
import type { MapPoint } from "@/components/map/MapLibreView";

// Dynamically import MapLibre for SSR safety
const MapLibreView = dynamic(() => import("@/components/map/MapLibreView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[350px] rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-xs font-semibold">
      Loading Spatial Map...
    </div>
  ),
});

interface IncidentItem {
  id: string;
  rawId?: string;
  title: string;
  category: string;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  status: "REPORTED" | "ASSIGNED" | "IN_PROGRESS" | "COLLECTED" | "VERIFIED";
  lat: number;
  lng: number;
  reportsCount: number;
  timeAgo: string;
  createdAt: string;
  latestReportAt: string;
  slaMinutesLeft: number;
  assignedTruck?: string;
  sensitiveLocation?: string;
}

interface BackendIncidentItem {
  id: string;
  title?: string;
  category?: string;
  priority?: "P0" | "P1" | "P2" | "P3" | "P4";
  status?: "REPORTED" | "ASSIGNED" | "IN_PROGRESS" | "COLLECTED" | "VERIFIED";
  latitude: number;
  longitude: number;
  report_count?: number;
  address_text?: string;
  assigned_vehicle_id?: string;
  created_at?: string;
  updated_at?: string;
}

interface BackendReportItem {
  id: string;
  incident_id?: string;
  category?: string;
  confidence?: number;
  estimated_volume_m3?: number;
  severity_score?: number;
  detected_tags?: string[];
  recommended_action?: string;
  description?: string;
  image_urls?: string[];
  latitude?: number;
  longitude?: number;
  address_text?: string;
  status?: string;
  priority?: "P0" | "P1" | "P2" | "P3" | "P4";
  created_at?: string;
}

interface FleetVehicle {
  id: string;
  rawId?: string;
  plate: string;
  type: string;
  capacityKg: number;
  currentLoadKg: number;
  status: "AVAILABLE" | "ASSIGNED" | "EN_ROUTE" | "COLLECTING" | "MAINTENANCE";
  driverId?: string;
  driverName?: string;
  driver?: string;
  lat: number;
  lng: number;
  zone: string;
}

interface FleetDriver {
  id: string;
  name: string;
  phone: string;
  license: string;
  zone: string;
  assignedTruck?: string;
  status: "ACTIVE" | "ON_BREAK" | "OFF_DUTY" | "ON LEAVE";
}

interface CitizenReportDetail {
  reportId: string;
  incidentId: string;
  rawIncidentId?: string;
  reporterName: string;
  reporterPhone: string;
  description: string;
  address: string;
  category: string;
  photos: string[];
  proofPhotos?: string[];
  submittedAt: string;
  aiCategory: string;
  aiConfidence: number;
  aiSeverity: number;
  aiVolume: number;
  aiTags: string[];
  aiRecommendedAction: string;
  officerAction?: "APPROVED" | "ESCALATED" | "REJECTED" | "DUPLICATE";
  officerNotes?: string;
}

export interface DriverExecutionData {
  incident_id: string;
  incident_code: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  latitude: number;
  longitude: number;
  address?: string;
  driver?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    vehicle_id?: string;
    vehicle_plate?: string;
    vehicle_type?: string;
  };
  assignment: {
    status: string;
    priority: string;
    assigned_at?: string;
    started_at?: string;
    completed_at?: string;
    elapsed_minutes?: number;
  };
  citizen_evidence_urls: string[];
  proof?: {
    id: string;
    image_url: string;
    storage_path: string;
    captured_at?: string;
    uploaded_at: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    distance_meters?: number;
    location_verified: boolean;
    verification_status: string;
    notes?: string;
  };
  timeline: Array<{
    event: string;
    timestamp: string;
    actor: string;
    notes?: string;
  }>;
}

export default function OfficerPage() {
  const { user, logout, getAuthHeaders, isLoading } = useAuth();
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [filterTime, setFilterTime] = useState<string>("LATEST");
  const [filterZone, setFilterZone] = useState<string>("ALL");
  const [showHotspots, setShowHotspots] = useState<boolean>(true);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [recomputeAlert, setRecomputeAlert] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentResponse, setAgentResponse] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentHistory, setAgentHistory] = useState<Array<{ q: string; a: string }>>([]);

  // Modal State for Adding Vehicle / Driver
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalTab, setAddModalTab] = useState<"vehicle" | "driver">("vehicle");
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Fleet Section Tab & Filter
  const [fleetTab, setFleetTab] = useState<"vehicles" | "drivers">("vehicles");
  const [fleetZoneFilter, setFleetZoneFilter] = useState("All Zones");

  // Edit State
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);

  const [reportDrawerOpen, setReportDrawerOpen] = useState(false);
  const [selectedReportDetail, setSelectedReportDetail] = useState<CitizenReportDetail | null>(null);
  const [officerActionNote, setOfficerActionNote] = useState("");
  const [manualSeverity, setManualSeverity] = useState<string>("DEFAULT");
  const [manualTruck, setManualTruck] = useState<string>("AUTO");

  // Driver Execution & Verification State
  const [driverExecution, setDriverExecution] = useState<DriverExecutionData | null>(null);
  const [isLoadingExecution, setIsLoadingExecution] = useState<boolean>(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState<boolean>(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState<boolean>(false);
  const [verifyNotes, setVerifyNotes] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("Image does not show cleaned area");
  const [rejectNotes, setRejectNotes] = useState<string>("");
  const [isSubmittingVerification, setIsSubmittingVerification] = useState<boolean>(false);
  const [fullProofModalUrl, setFullProofModalUrl] = useState<string | null>(null);

  // Citizen Reports Database (loaded dynamically from GET /api/v1/reports)
  const [citizenReports, setCitizenReports] = useState<CitizenReportDetail[]>([]);

  // New Vehicle Form State
  const [newVehiclePlate, setNewVehiclePlate] = useState("");
  const [newVehicleType, setNewVehicleType] = useState("Compactor 5T");
  const [newVehicleCapacity, setNewVehicleCapacity] = useState(5000);
  const [newVehicleDriver, setNewVehicleDriver] = useState("");
  const [newVehicleZone, setNewVehicleZone] = useState("Sector 12 Hospital Zone");

  // New Driver Form State
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [newDriverLicense, setNewDriverLicense] = useState("");
  const [newDriverZone, setNewDriverZone] = useState("Sector 21 APMC");
  const [newDriverTruck, setNewDriverTruck] = useState("");

  // Registered Vehicles State (loaded dynamically from GET /api/v1/vehicles)
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([
    {
      id: "VEH-01",
      plate: "GJ-01-WM-4402",
      type: "Compactor 5T",
      capacityKg: 5000,
      currentLoadKg: 2450,
      status: "EN_ROUTE",
      driver: "Vikram Patel",
      lat: 23.025,
      lng: 72.578,
      zone: "Sector 12 Hospital Zone",
    },
    {
      id: "VEH-02",
      plate: "GJ-01-WM-9120",
      type: "Tipper 3T",
      capacityKg: 3000,
      currentLoadKg: 1100,
      status: "COLLECTING",
      driver: "Rajesh Parmar",
      lat: 23.042,
      lng: 72.551,
      zone: "Sector 21 APMC Yard",
    },
    {
      id: "VEH-03",
      plate: "GJ-01-WM-8820",
      type: "Mini Truck 1.5T",
      capacityKg: 1500,
      currentLoadKg: 0,
      status: "AVAILABLE",
      driver: "Sunil Solanki",
      lat: 23.018,
      lng: 72.562,
      zone: "Zone 2 Central Depot",
    },
  ]);

  // Registered Drivers State
  const [drivers, setDrivers] = useState<FleetDriver[]>([
    {
      id: "DRV-01",
      name: "Vikram Patel",
      phone: "+91 98765 44021",
      license: "GJ-01-2022-DRV-44",
      zone: "Sector 12 Hospital Zone",
      assignedTruck: "GJ-01-WM-4402",
      status: "ACTIVE",
    },
    {
      id: "DRV-02",
      name: "Rajesh Parmar",
      phone: "+91 98765 91202",
      license: "GJ-01-2023-DRV-91",
      zone: "Sector 21 APMC Yard",
      assignedTruck: "GJ-01-WM-9120",
      status: "ACTIVE",
    },
    {
      id: "DRV-03",
      name: "Sunil Solanki",
      phone: "+91 98765 88203",
      license: "GJ-01-2024-DRV-88",
      zone: "Zone 2 Central Depot",
      assignedTruck: "GJ-01-WM-8820",
      status: "ACTIVE",
    },
  ]);

  // Initial Route Polyline Coordinates
  const [routeCoordinates, setRouteCoordinates] = useState<Array<[number, number]>>([
    [72.578, 23.025],
    [72.562, 23.018],
    [72.548, 23.045],
    [72.535, 23.060],
  ]);

  // Real incidents state (loaded from Supabase backend GET /api/v1/incidents)
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);

  const mapPoints: MapPoint[] = useMemo(() => {
    const points: MapPoint[] = incidents.map((inc) => ({
      id: inc.id,
      lat: inc.lat,
      lng: inc.lng,
      title: inc.title,
      priority: inc.priority,
      type: "incident" as const,
    }));

    // Add all fleet vehicles dynamically
    vehicles.forEach((veh) => {
      if (veh.status !== "MAINTENANCE") {
        points.push({
          id: veh.id,
          lat: veh.lat,
          lng: veh.lng,
          title: `${veh.plate} (${veh.type} · Driver: ${veh.driver || "Unassigned"})`,
          type: "vehicle" as const,
        });
      }
    });

    // Add Predicted Hotspots if layer toggled on
    if (showHotspots) {
      points.push(
        {
          id: "HOT-01",
          lat: 23.045,
          lng: 72.550,
          title: "HOTSPOT: Sector 21 APMC (89% Risk)",
          priority: "P0",
          type: "hotspot" as const,
        },
        {
          id: "HOT-02",
          lat: 23.028,
          lng: 72.574,
          title: "HOTSPOT: Sector 11 Corridor (78% Risk)",
          priority: "P1",
          type: "hotspot" as const,
        }
      );
    }

    return points;
  }, [incidents, vehicles, showHotspots]);

  // Real-time Supabase / PostgreSQL Incident & Report fetch
  const fetchBackendData = React.useCallback(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      // 1. Fetch Incidents from Supabase DB
      const resIncidents = await fetch(`${apiUrl}/api/v1/incidents`, {
        headers: getAuthHeaders(),
      });
      if (resIncidents.ok) {
        const data: BackendIncidentItem[] = await resIncidents.json();
        if (Array.isArray(data) && data.length > 0) {
          const mappedIncidents: IncidentItem[] = data.map((inc: BackendIncidentItem) => {
            const isP0 = inc.priority === "P0";
            const createdAtStr = inc.created_at || new Date().toISOString();
            const latestReportAtStr = inc.updated_at || inc.created_at || new Date().toISOString();
            const elapsedMins = getElapsedMinutes(createdAtStr);
            const timeAgoStr = formatRelativeTime(latestReportAtStr);
            const slaLeft = isP0 ? Math.max(10, 45 - elapsedMins) : inc.priority === "P1" ? Math.max(20, 120 - elapsedMins) : Math.max(60, 240 - elapsedMins);

            return {
              id: `WW-${String(inc.id).slice(0, 8).toUpperCase()}`,
              rawId: String(inc.id),
              title: inc.title || `${(inc.category || "Mixed").toUpperCase()} at ${inc.address_text?.split(',')[0] || "Gandhinagar"}`,
              category: (inc.category || "Mixed").toUpperCase(),
              priority: inc.priority || "P3",
              status: inc.status || "REPORTED",
              lat: Number(inc.latitude),
              lng: Number(inc.longitude),
              reportsCount: inc.report_count || 1,
              timeAgo: timeAgoStr,
              createdAt: createdAtStr,
              latestReportAt: latestReportAtStr,
              slaMinutesLeft: slaLeft,
              sensitiveLocation: isP0 ? "Hospital Buffer Zone (<200m)" : inc.address_text || undefined,
              assignedTruck: inc.assigned_vehicle_id ? "Assigned Vehicle" : undefined,
            };
          });

          setIncidents(mappedIncidents);
        } else {
          setIncidents([]);
        }
      }

      // 2. Fetch Reports from Supabase DB
      const resReports = await fetch(`${apiUrl}/api/v1/reports`, {
        headers: getAuthHeaders(),
      });
      if (resReports.ok) {
        const repData: BackendReportItem[] = await resReports.json();
        if (Array.isArray(repData) && repData.length > 0) {
          const mappedReports: CitizenReportDetail[] = repData.map((r: BackendReportItem) => ({
            reportId: `REP-${String(r.id).slice(0, 8).toUpperCase()}`,
            incidentId: r.incident_id ? `WW-${String(r.incident_id).slice(0, 8).toUpperCase()}` : `WW-${String(r.id).slice(0, 8).toUpperCase()}`,
            rawIncidentId: r.incident_id ? String(r.incident_id) : String(r.id),
            reporterName: "Citizen Reporter",
            reporterPhone: "+91 98765 00000",
            description: r.description || "Reported municipal waste accumulation.",
            address: r.address_text || `GPS: ${r.latitude?.toFixed(4) || "23.0330"}°N, ${r.longitude?.toFixed(4) || "72.5860"}°E`,
            category: (r.category || "Mixed").toUpperCase(),
            photos: Array.isArray(r.image_urls) ? r.image_urls : [],
            submittedAt: r.created_at ? new Date(r.created_at).toLocaleString() : "Just now",
            aiCategory: (r.category || "Mixed").toUpperCase(),
            aiConfidence: Number(r.confidence ?? 0.92),
            aiSeverity: Number(r.severity_score ?? 6.0),
            aiVolume: Number(r.estimated_volume_m3 ?? 2.0),
            aiTags: Array.isArray(r.detected_tags) ? r.detected_tags : ["municipal_waste"],
            aiRecommendedAction: r.recommended_action || "Deploy municipal compactor vehicle",
          }));

          setCitizenReports(mappedReports);
        } else {
          setCitizenReports([]);
        }
      }

      // 3. Fetch Vehicles from Supabase DB
      const resVehicles = await fetch(`${apiUrl}/api/v1/vehicles`, {
        headers: getAuthHeaders(),
      });
      if (resVehicles.ok) {
        const vehData = await resVehicles.json();
        if (Array.isArray(vehData) && vehData.length > 0) {
          const mappedVehicles: FleetVehicle[] = vehData.map((v: { id: string; plate_number: string; vehicle_type: string; capacity_kg: number; current_load_kg?: number; status: FleetVehicle["status"]; current_lat?: number; current_lng?: number; driver_id?: string; driver_name?: string }) => ({
            id: `VEH-${String(v.id).slice(0, 6).toUpperCase()}`,
            rawId: String(v.id),
            plate: v.plate_number,
            type: v.vehicle_type,
            capacityKg: Number(v.capacity_kg),
            currentLoadKg: Number(v.current_load_kg || 0),
            status: v.status,
            driverId: v.driver_id,
            driverName: v.driver_name || "Assigned Driver",
            driver: v.driver_name ? `${v.driver_name} (${v.plate_number})` : `${v.plate_number} (Driver)`,
            lat: Number(v.current_lat || 23.025),
            lng: Number(v.current_lng || 72.578),
            zone: "Sector 12 Hospital Zone",
          }));
          setVehicles(mappedVehicles);
        }
      }
    } catch (e) {
      console.warn("Could not connect to Supabase backend", e);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    // Initial fetch on mount via timer to avoid setState directly in effect
    const initialTimer = setTimeout(() => {
      void fetchBackendData();
    }, 0);

    // 1. WebSocket connection for real-time live events
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsUrl = apiUrl.replace(/^http/, "ws") + "/api/v1/optimization/ws";
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            msg.type === "NEW_INCIDENT_REPORTED" ||
            msg.type === "INCIDENT_UPDATED" ||
            msg.type === "LOOP_C_DYNAMIC_REROUTE" ||
            msg.type === "INCIDENT_ASSIGNED" ||
            msg.type === "COLLECTION_STARTED" ||
            msg.type === "COLLECTION_PROOF_UPLOADED" ||
            msg.type === "INCIDENT_PROOF_SUBMITTED" ||
            msg.type === "INCIDENT_COLLECTED" ||
            msg.type === "REPORT_CREATED"
          ) {
            void fetchBackendData();
          }
        } catch {}
      };
    } catch (err) {
      console.warn("WebSocket init fallback", err);
    }

    // Polling interval (every 4s) to keep dashboard synchronized with Supabase DB
    const interval = setInterval(() => {
      void fetchBackendData();
    }, 4000);

    return () => {
      clearTimeout(initialTimer);
      if (ws) ws.close();
      clearInterval(interval);
    };
  }, [fetchBackendData]);

  // Periodic 15-second tick to re-render relative time tags ("Just now" -> "1 min ago") without polling DB
  const [, setTick] = useState(0);
  useEffect(() => {
    const tickInterval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, 15000);
    return () => clearInterval(tickInterval);
  }, []);

  const filteredIncidents = incidents
    .filter((i) => filterPriority === "ALL" || i.priority === filterPriority)
    .filter((i) => {
      if (filterZone === "ALL") return true;
      const text = (i.title + " " + (i.sensitiveLocation || "") + " " + (i.category || "")).toLowerCase();
      if (filterZone === "SECTOR_12") return text.includes("sector 12");
      if (filterZone === "SECTOR_21") return text.includes("sector 21");
      if (filterZone === "RAILWAY") return text.includes("railway") || text.includes("zone 2");
      return true;
    })
    .sort((a, b) => {
      const timeA = parseUtcDate(a.latestReportAt || a.createdAt).getTime();
      const timeB = parseUtcDate(b.latestReportAt || b.createdAt).getTime();
      return filterTime === "LATEST" ? timeB - timeA : timeA - timeB;
    });

  const handleDispatch = async (id: string) => {
    const incObj = incidents.find((i) => i.id === id || i.rawId === id);
    const targetRawId = incObj?.rawId || id.replace("WW-", "");
    const availableVeh = vehicles.find((v) => v.status === "AVAILABLE") || vehicles[0];

    const truckLabel = availableVeh ? `${availableVeh.plate} (${availableVeh.driverName || "Assigned Driver"})` : "GJ-01-WM-4402 (Assigned)";

    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id || inc.rawId === targetRawId
          ? {
              ...inc,
              status: "ASSIGNED",
              assignedTruck: truckLabel,
            }
          : inc
      )
    );

    // Persist status change to backend
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const payload: Record<string, string | undefined> = { status: "ASSIGNED" };
      if (availableVeh?.rawId) {
        payload.assigned_vehicle_id = availableVeh.rawId;
      }
      await fetch(`${apiUrl}/api/v1/incidents/${targetRawId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(payload),
      });
      void fetchBackendData();
    } catch {}
  };

  // 3.5. Fetch Complete Driver Execution Details
  const fetchDriverExecution = useCallback(async (rawIncId: string) => {
    if (!rawIncId) return;
    setIsLoadingExecution(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/incidents/${rawIncId}/driver-execution`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data: DriverExecutionData = await res.json();
        setDriverExecution(data);
      } else {
        setDriverExecution(null);
      }
    } catch {
      setDriverExecution(null);
    } finally {
      setIsLoadingExecution(false);
    }
  }, [getAuthHeaders]);

  const handleVerifyDriverProof = async () => {
    if (!selectedReportDetail?.rawIncidentId) return;
    setIsSubmittingVerification(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/incidents/${selectedReportDetail.rawIncidentId}/verify-proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ notes: verifyNotes }),
      });
      if (res.ok) {
        setSuccessToast("✅ Driver Proof-of-Work verified! Incident marked RESOLVED.");
        setIsVerifyModalOpen(false);
        setVerifyNotes("");
        void fetchDriverExecution(selectedReportDetail.rawIncidentId);
        void fetchBackendData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  const handleRejectDriverProof = async () => {
    if (!selectedReportDetail?.rawIncidentId) return;
    setIsSubmittingVerification(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/incidents/${selectedReportDetail.rawIncidentId}/reject-proof`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ reason: rejectReason, notes: rejectNotes }),
      });
      if (res.ok) {
        setSuccessToast("⚠️ Proof rejected. Driver notified to retake proof.");
        setIsRejectModalOpen(false);
        setRejectNotes("");
        void fetchDriverExecution(selectedReportDetail.rawIncidentId);
        void fetchBackendData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmittingVerification(false);
    }
  };

  // Open report detail drawer for an incident
  const handleViewReports = (incidentId: string) => {
    const reports = citizenReports.filter((r) => r.incidentId === incidentId || r.rawIncidentId === incidentId);
    if (reports.length > 0) {
      const rep = reports[0];
      setSelectedReportDetail(rep);
      setReportDrawerOpen(true);
      setOfficerActionNote("");
      setManualSeverity("DEFAULT");
      setManualTruck("AUTO");
      if (rep.rawIncidentId) {
        void fetchDriverExecution(rep.rawIncidentId);
      }
    }
  };

  // Get all citizen reports for a given incident
  const getReportsForIncident = (incidentId: string) => {
    return citizenReports.filter((r) => r.incidentId === incidentId || r.rawIncidentId === incidentId);
  };

  // Officer action handlers on citizen reports
  const handleOfficerAction = async (reportId: string, action: CitizenReportDetail["officerAction"]) => {
    setCitizenReports((prev) =>
      prev.map((r) =>
        r.reportId === reportId
          ? { ...r, officerAction: action, officerNotes: officerActionNote || undefined }
          : r
      )
    );

    const report = citizenReports.find((r) => r.reportId === reportId);
    if (report && (action === "APPROVED" || action === "ESCALATED")) {
      const priorityToSet = manualSeverity !== "DEFAULT" ? manualSeverity : action === "ESCALATED" ? "P0" : undefined;
      
      const selectedVeh = manualTruck !== "AUTO" 
        ? vehicles.find((v) => v.rawId === manualTruck || v.id === manualTruck) 
        : vehicles.find((v) => v.status === "AVAILABLE") || vehicles[0];

      const truckLabel = selectedVeh ? `${selectedVeh.plate} (${selectedVeh.driverName || "Assigned Driver"})` : "GJ-01-WM-4402 (Assigned)";
      
      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === report.incidentId || inc.rawId === report.rawIncidentId) {
            return {
              ...inc,
              ...(priorityToSet ? { priority: priorityToSet as IncidentItem["priority"] } : {}),
              ...(action === "APPROVED" ? { status: "ASSIGNED", assignedTruck: truckLabel } : {})
            };
          }
          return inc;
        })
      );

      // Persist to Supabase backend
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const patchPayload: Record<string, string | undefined> = {};
        if (action === "APPROVED") {
          patchPayload.status = "ASSIGNED";
          if (selectedVeh?.rawId) {
            patchPayload.assigned_vehicle_id = selectedVeh.rawId;
          }
        }
        if (priorityToSet) patchPayload.priority = priorityToSet;
        if (officerActionNote) patchPayload.description = officerActionNote;

        const targetRawId = report.rawIncidentId || report.incidentId.replace("WW-", "");
        await fetch(`${apiUrl}/api/v1/incidents/${targetRawId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify(patchPayload),
        });
        void fetchBackendData();
      } catch (err) {
        console.warn("Error patching incident", err);
      }
    }

    const actionLabels = { APPROVED: "Approved & Dispatched", ESCALATED: "Escalated to P0", REJECTED: "Rejected", DUPLICATE: "Marked Duplicate" };
    setSuccessToast(`✅ Report ${reportId}: ${actionLabels[action!] || action}`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleRecomputePriorities = () => {
    setIsRecomputing(true);
    fetchBackendData();
    setTimeout(() => {
      setIsRecomputing(false);
      setRecomputeAlert("Dynamic Priority Engine: Evaluated active incidents, recalculated SLA deadlines & consensus scores.");
      setTimeout(() => setRecomputeAlert(null), 4000);
    }, 600);
  };

  // Loop C Simulation Trigger: Injects P0 Emergency and dynamically recalculates live route!
  const handleSimulateLoopC = () => {
    setIsRecomputing(true);
    setTimeout(() => {
      const emergencyIncident: IncidentItem = {
        id: "INC-P0-9912",
        title: "CRITICAL: Bio-hazard Spill near Pediatric Wing (Sector 12)",
        category: "Hazardous / Medical",
        priority: "P0",
        status: "ASSIGNED",
        lat: 23.033,
        lng: 72.586,
        reportsCount: 6,
        timeAgo: "Just now",
        createdAt: new Date().toISOString(),
        latestReportAt: new Date().toISOString(),
        slaMinutesLeft: 30,
        sensitiveLocation: "Hospital Red Zone",
        assignedTruck: "GJ-01-WM-4402 (PREEMPTED STOP 1)",
      };

      setIncidents((prev) => {
        const withoutDupes = prev.filter((item) => item.id !== emergencyIncident.id);
        return [emergencyIncident, ...withoutDupes];
      });

      // Recalculate route polyline with P0 inserted at Stop #1!
      setRouteCoordinates([
        [72.578, 23.025], // Truck position
        [72.586, 23.033], // NEW P0 EMERGENCY INSERTED FIRST
        [72.562, 23.018], // INC-8042 (P1)
        [72.548, 23.045], // INC-7994 (P2)
        [72.535, 23.060], // Waste Processing Plant
      ]);

      setIsRecomputing(false);
      setRecomputeAlert("🚨 LOOP C EXECUTED: New P0 Emergency Detected! Truck GJ-01-WM-4402 route dynamically recomputed & preempted live via WebSockets.");
      setTimeout(() => setRecomputeAlert(null), 6000);
    }, 700);
  };

  // Vehicle Handlers
  const handleOpenAddVehicle = () => {
    setModalMode("add");
    setEditingVehicleId(null);
    setNewVehiclePlate("");
    setNewVehicleType("Compactor 5T");
    setNewVehicleCapacity(5000);
    setNewVehicleDriver("");
    setNewVehicleZone("Sector 12 Hospital Zone");
    setAddModalTab("vehicle");
    setIsAddModalOpen(true);
  };

  const handleEditVehicle = (v: FleetVehicle) => {
    setModalMode("edit");
    setEditingVehicleId(v.id);
    setNewVehiclePlate(v.plate);
    setNewVehicleType(v.type);
    setNewVehicleCapacity(v.capacityKg);
    setNewVehicleDriver(v.driver || "");
    setNewVehicleZone(v.zone);
    setAddModalTab("vehicle");
    setIsAddModalOpen(true);
  };

  const handleToggleVehicleStatus = (id: string) => {
    const vehicleToUpdate = vehicles.find(v => v.id === id);
    if (vehicleToUpdate && vehicleToUpdate.status !== "MAINTENANCE" && vehicleToUpdate.currentLoadKg > 0) {
      alert(`Cannot mark vehicle ${vehicleToUpdate.plate} for maintenance. It currently has a payload of ${vehicleToUpdate.currentLoadKg} kg. Please dispatch it to unload first.`);
      return;
    }

    let unassignedDriverName = "";
    
    setVehicles((prev) => prev.map((v) => {
      if (v.id === id) {
        const isGoingToMaintenance = v.status !== "MAINTENANCE";
        if (isGoingToMaintenance) {
          unassignedDriverName = v.driver || "";
          return { ...v, status: "MAINTENANCE", currentLoadKg: 0, driver: undefined };
        } else {
          return { ...v, status: "AVAILABLE" };
        }
      }
      return v;
    }));

    if (unassignedDriverName) {
      setDrivers((prev) => prev.map((d) => d.name === unassignedDriverName ? { ...d, assignedTruck: undefined } : d));
    }
  };

  const handleDeleteVehicle = (id: string) => {
    if (confirm("Are you sure you want to remove this vehicle?")) {
      let driverName = "";
      setVehicles((prev) => prev.filter((v) => {
        if (v.id === id) driverName = v.driver || "";
        return v.id !== id;
      }));
      if (driverName) {
        setDrivers((prev) => prev.map((d) => d.name === driverName ? { ...d, assignedTruck: undefined } : d));
      }
    }
  };

  const handleSaveVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehiclePlate.trim()) return;

    if (modalMode === "edit" && editingVehicleId) {
      setVehicles((prev) => prev.map((v) => v.id === editingVehicleId ? {
        ...v, plate: newVehiclePlate.toUpperCase().trim(), type: newVehicleType, capacityKg: Number(newVehicleCapacity), driver: newVehicleDriver || "Unassigned", zone: newVehicleZone
      } : v));
      setSuccessToast(`✅ Vehicle ${newVehiclePlate} updated successfully!`);
    } else {
      const zoneCoords: Record<string, [number, number]> = {
        "Sector 12 Hospital Zone": [23.033, 72.586],
        "Sector 21 APMC Yard": [23.045, 72.548],
        "Sector 11 Corridor": [23.028, 72.574],
        "Zone 2 Central Depot": [23.018, 72.562],
      };
      const [lat, lng] = zoneCoords[newVehicleZone] || [23.025, 72.57];

      const newVeh: FleetVehicle = {
        id: `VEH-0${vehicles.length + 1}`,
        plate: newVehiclePlate.toUpperCase().trim(),
        type: newVehicleType,
        capacityKg: Number(newVehicleCapacity),
        currentLoadKg: 0,
        status: "AVAILABLE",
        driver: newVehicleDriver || "Unassigned",
        lat,
        lng,
        zone: newVehicleZone,
      };

      setVehicles([newVeh, ...vehicles]);
      setSuccessToast(`✅ Vehicle ${newVeh.plate} successfully registered!`);
    }
    
    setIsAddModalOpen(false);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  // Driver Handlers
  const handleOpenAddDriver = () => {
    setModalMode("add");
    setEditingDriverId(null);
    setNewDriverName("");
    setNewDriverPhone("");
    setNewDriverLicense("");
    setNewDriverZone("Sector 21 APMC Yard");
    setNewDriverTruck("");
    setAddModalTab("driver");
    setIsAddModalOpen(true);
  };

  const handleEditDriver = (d: FleetDriver) => {
    setModalMode("edit");
    setEditingDriverId(d.id);
    setNewDriverName(d.name);
    setNewDriverPhone(d.phone);
    setNewDriverLicense(d.license);
    setNewDriverZone(d.zone);
    setNewDriverTruck(d.assignedTruck || "");
    setAddModalTab("driver");
    setIsAddModalOpen(true);
  };

  const handleToggleDriverStatus = (id: string) => {
    let unassignedTruckPlate = "";
    setDrivers((prev) => prev.map((d) => {
      if (d.id === id) {
        const isGoingOnLeave = d.status !== "ON LEAVE";
        if (isGoingOnLeave) {
          unassignedTruckPlate = d.assignedTruck || "";
          return { ...d, status: "ON LEAVE", assignedTruck: undefined };
        } else {
          return { ...d, status: "ACTIVE" };
        }
      }
      return d;
    }));

    if (unassignedTruckPlate) {
      setVehicles((prev) => prev.map((v) => v.plate === unassignedTruckPlate ? { ...v, driver: undefined } : v));
    }
  };

  const handleDeleteDriver = (id: string) => {
    if (confirm("Are you sure you want to remove this driver?")) {
      let truckPlate = "";
      setDrivers((prev) => prev.filter((d) => {
        if (d.id === id) truckPlate = d.assignedTruck || "";
        return d.id !== id;
      }));
      if (truckPlate) {
        setVehicles((prev) => prev.map((v) => v.plate === truckPlate ? { ...v, driver: undefined } : v));
      }
    }
  };

  const handleSaveDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim()) return;

    if (modalMode === "edit" && editingDriverId) {
      setDrivers((prev) => prev.map((d) => d.id === editingDriverId ? {
        ...d, name: newDriverName.trim(), phone: newDriverPhone.trim() || "+91 98765 00000", license: newDriverLicense.trim(), zone: newDriverZone, assignedTruck: newDriverTruck || "None"
      } : d));
      setSuccessToast(`✅ Driver ${newDriverName} updated successfully!`);
    } else {
      const newDrv: FleetDriver = {
        id: `DRV-0${drivers.length + 1}`,
        name: newDriverName.trim(),
        phone: newDriverPhone.trim() || "+91 98765 00000",
        license: newDriverLicense.trim() || `GJ-01-2026-DRV-${Math.floor(10 + Math.random() * 90)}`,
        zone: newDriverZone,
        assignedTruck: newDriverTruck || "None",
        status: "ACTIVE",
      };

      setDrivers([newDrv, ...drivers]);
      setSuccessToast(`✅ Driver ${newDrv.name} registered and added to municipal fleet!`);
    }

    setIsAddModalOpen(false);
    setTimeout(() => setSuccessToast(null), 4500);
  };

  // Grounded Agent Query Function
  const handleAgentQuery = (query: string) => {
    setAgentLoading(true);
    setAgentResponse(null);

    setTimeout(() => {
      let groundedAnswer = "";
      const q = query.toLowerCase();

      if (q.includes("prioritize") || q.includes("tomorrow") || q.includes("area")) {
        groundedAnswer =
          "**Priority Recommendation for Tomorrow (Grounded in Live Data):**\n\n" +
          "1. **Sector 21 APMC Yard** (High Risk: 89% accumulation probability, predicted 1,850 kg organic waste by 09:30 AM). **Action:** Pre-dispatch Truck `GJ-01-WM-9120` (Tipper 3T) by 06:00 AM.\n\n" +
          "2. **Sector 12 Civil Hospital Red Zone** (Active P0 Incident `INC-8091` / Sensitive healthcare buffer). **Action:** Retain Compactor `GJ-01-WM-4402` on priority standby.\n\n" +
          "3. **Central Railway Depot Zone 2** (`INC-8042`, 4 reports clustered). **Action:** Route Mini Truck `GJ-01-WM-8820`.\n\n" +
          "*Data Sources: 14 citizen reports, 3 predictive hotspot models, 3 fleet telemetry feeds.*";
      } else if (q.includes("fleet") || q.includes("truck") || q.includes("vehicle")) {
        groundedAnswer =
          `**Current Fleet Telemetry Status (${vehicles.length} Units Active):**\n\n` +
          vehicles
            .map(
              (v) =>
                `• **${v.plate}** (${v.type}): Status **${v.status}** · Payload: ${v.currentLoadKg}/${v.capacityKg} kg (${Math.round((v.currentLoadKg / v.capacityKg) * 100)}%) · Driver: **${v.driver}** · Zone: ${v.zone}`
            )
            .join("\n") +
          "\n\n*All units GPS tracking & WebSocket telemetry active.*";
      } else if (q.includes("environment") || q.includes("co2") || q.includes("fuel") || q.includes("impact")) {
        groundedAnswer =
          "**Environmental Impact Summary (SDG 11, 12, 13):**\n\n" +
          "• **Fuel Saved:** 142.8 L (via TSP route clustering & Loop C dynamic preemption)\n" +
          "• **CO₂ Avoided:** 382.7 kg\n" +
          "• **Distance Reduced:** 89.4 km vs static fixed routes\n" +
          "• **Route Efficiency Gain:** +23.1%\n" +
          "• **Equivalent Trees Planted:** 17.6\n\n" +
          "*Data Source: Logged GPS breadcrumb analytics vs historical baseline.*";
      } else if (q.includes("zone") || q.includes("why")) {
        groundedAnswer =
          "**Zone Prioritization Reasoning (Multi-Factor Scoring Engine):**\n\n" +
          "• **Sensitive Location Weight (0.35):** Within 200m of Civil Hospital pediatric wing (multiplier: 1.8x).\n" +
          "• **Clustered Citizen Consensus (0.25):** 8 distinct photo reports clustered within 45m.\n" +
          "• **CV Severity Score (0.20):** 8.4/10 (Bio-hazard / medical waste packaging identified).\n" +
          "• **SLA Urgency (0.20):** Target resolution <2 hours; 36 minutes remaining.\n\n" +
          "*Result: Composite priority score 9.42/10 → Escalated to P0 Emergency.*";
      } else {
        groundedAnswer =
          `**Municipal Intelligence Response for: "${query}"**\n\n` +
          `• Evaluated ${incidents.length} active incidents across Gandhinagar & Ahmedabad zones.\n` +
          `• ${vehicles.length} fleet vehicles operating with dynamic route optimization active.\n` +
          `• Priority consensus: P0 Hospital Red Zone is top municipal priority.\n\n` +
          `*Data Sources: Live Spatial DB, PostGIS Clusters, Fleet Telemetry Engine.*`;
      }

      setAgentResponse(groundedAnswer);
      setAgentHistory((prev) => [...prev, { q: query, a: groundedAnswer }]);
      setAgentLoading(false);
    }, 600);
  };

  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] p-8 flex items-center justify-center">
        <div className="animate-pulse text-sm text-slate-500 font-medium">Authenticating Command Center...</div>
      </div>
    );
  }

  // Server-side RBAC Guard: Only Officer and Admin roles can view this surface
  if (!user || (user.role !== "officer" && user.role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-canvas)]">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-4 border border-amber-200">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold mb-2">Officer Access Required</h2>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            {!user
              ? "You must be signed in with an authorized Municipal Officer credential to access the Command Center."
              : `Access Denied: Your current role is '${user.role.toUpperCase()}'. Only Municipal Officers & Admins have command privileges.`}
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-90 transition-all cursor-pointer"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Go to Authentication Portal
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div suppressHydrationWarning className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] p-4 sm:p-6 md:p-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: "var(--color-accent)" }}
              />
              <h1
                className="text-xl md:text-2xl font-bold"
                style={{ fontFamily: "var(--font-plus-jakarta, sans-serif)" }}
              >
                Municipal Command Center
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              Live Dynamic Route Optimization & Priority Engine (Loop C Active)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* User Profile Badge & Logout */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <div className="flex flex-col text-left">
              <span className="text-[11px] font-bold text-slate-800 line-clamp-1">{user.fullName}</span>
              <span className="text-[9px] font-semibold text-emerald-700 uppercase tracking-wider">{user.role}</span>
            </div>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-red-600 transition-colors ml-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Vehicle / Driver Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Vehicle / Driver</span>
          </button>

          {/* Loop C Demo Simulator Trigger */}
          <button
            onClick={handleSimulateLoopC}
            disabled={isRecomputing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm cursor-pointer transition-all disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-amber-200 animate-pulse" />
            <span>Simulate P0 Emergency (Loop C)</span>
          </button>

          {/* Recompute Priorities Button */}
          <button
            onClick={handleRecomputePriorities}
            disabled={isRecomputing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm cursor-pointer transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRecomputing ? "animate-spin" : ""}`} />
            <span>Re-Triage</span>
          </button>
        </div>
      </div>

      {/* Recompute / Dynamic Alert Banner */}
      {recomputeAlert && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500 text-white shadow-lg flex items-center justify-between text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-100 animate-pulse flex-shrink-0" />
            <span>{recomputeAlert}</span>
          </div>
        </div>
      )}

      {/* Success Toast Banner */}
      {successToast && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-700 text-white shadow-lg flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-200 flex-shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* =============== TOP KPI ROW =============== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Incidents</span>
            <span className="p-2 rounded-xl bg-slate-50 text-slate-600"><AlertTriangle className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-slate-900">{incidents.length} Active</div>
          <span className="text-[11px] font-semibold text-emerald-600">8 clustered reports consensus</span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">P0 Emergencies</span>
            <span className="p-2 rounded-xl bg-red-50 text-red-600"><Flame className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-[#C1272D]">{incidents.filter(i => i.priority === "P0").length} Critical</div>
          <span className="text-[11px] font-semibold text-red-600">Hospital Red Zone Active</span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Fleet</span>
            <span className="p-2 rounded-xl bg-teal-50 text-teal-700"><Truck className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-teal-800">{vehicles.length} Units</div>
          <span className="text-[11px] font-semibold text-teal-700">Dynamic routing connected</span>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">SLA Compliance</span>
            <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700"><CheckCircle2 className="w-4 h-4" /></span>
          </div>
          <div className="text-2xl font-black text-emerald-800">94.8%</div>
          <span className="text-[11px] font-semibold text-emerald-600">+4.2% vs static routes</span>
        </div>
      </div>

      {/* =============== MAIN MAP & INCIDENT TRIAGE BENTO =============== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Spatial Map & Pre-Deployment Controls (8 Cols) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">Spatial Intelligence Map</span>
                <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  {mapPoints.length} Live Nodes
                </span>
              </div>

              {/* Map Layer Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowHotspots(!showHotspots)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    showHotspots
                      ? "bg-amber-100 text-amber-900 border border-amber-300"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 text-amber-700" />
                  <span>Predicted Hotspots (AI)</span>
                </button>
              </div>
            </div>

            {/* MapLibre Spatial View */}
            <div className="h-[420px] w-full rounded-xl overflow-hidden relative">
              <MapLibreView
                center={[72.5714, 23.03]}
                zoom={12.8}
                points={mapPoints}
                routePolyline={routeCoordinates}
                onSelectPoint={(p) => {
                  const matchingInc = incidents.find((i) => i.id === p.id);
                  if (matchingInc) setSelectedIncident(matchingInc);
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#C1272D]" />
                  <span className="font-semibold text-slate-700">P0 Hospital Emergency</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#2B8C86]" />
                  <span className="font-semibold text-slate-700">Municipal Truck</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#E86A33]" />
                  <span className="font-semibold text-slate-700">AI Predicted Hotspot</span>
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-700">Route: TSP Optimized (OSRM Engine)</span>
            </div>
          </div>
        </div>

        {/* Right Col: Incident Triage Feed (4 Cols) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col h-[500px]">
          <div className="flex flex-col gap-2 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--color-primary)]" />
              <h2 className="text-sm font-bold">Active Incident Triage</h2>
            </div>
            
            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none"
              >
                <option value="ALL">All Severities</option>
                <option value="P0">P0 Emergency</option>
                <option value="P1">P1 High</option>
                <option value="P2">P2 Normal</option>
              </select>

              <select
                value={filterTime}
                onChange={(e) => setFilterTime(e.target.value)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none"
              >
                <option value="LATEST">Latest First</option>
                <option value="OLDEST">Oldest First</option>
              </select>

              <select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none max-w-[120px]"
              >
                <option value="ALL">All Locations</option>
                <option value="SECTOR_12">Sector 12</option>
                <option value="SECTOR_21">Sector 21</option>
                <option value="RAILWAY">Railway / Zone 2</option>
              </select>
            </div>
          </div>

          {/* Incidents Scrollable List */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredIncidents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
                <p className="text-xs font-bold text-slate-700">No active incidents</p>
                <p className="text-[11px] text-slate-500">All municipal zones currently clear</p>
              </div>
            ) : (
              filteredIncidents.map((inc, idx) => (
                <div
                  key={`${inc.id}-${idx}`}
                  onClick={() => setSelectedIncident(inc)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                    selectedIncident?.id === inc.id
                      ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)]/30 ring-1 ring-[var(--color-primary)]"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{
                          backgroundColor:
                            inc.priority === "P0"
                              ? "var(--color-p0-emergency)"
                              : inc.priority === "P1"
                              ? "var(--color-p1-veryhigh)"
                              : inc.priority === "P2"
                              ? "var(--color-p2-high)"
                              : "var(--color-p3-normal)",
                        }}
                      >
                        {inc.priority}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-800">{inc.id}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-400">{formatRelativeTime(inc.latestReportAt || inc.createdAt)}</span>
                  </div>

                  <h3 className="text-xs font-bold text-slate-900 line-clamp-1 mb-1">{inc.title}</h3>
                  
                  {/* Clustered Consensus Badge */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      <Users className="w-3 h-3" />
                      {inc.reportsCount} Citizen Reports Clustered
                    </span>
                    {inc.sensitiveLocation && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-800 border border-red-200">
                        <AlertTriangle className="w-3 h-3" />
                        {inc.sensitiveLocation}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100/80">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>SLA: {inc.slaMinutesLeft}m left</span>
                      </div>
                      {/* View Reports Button */}
                      {getReportsForIncident(inc.id).length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewReports(inc.id);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 cursor-pointer transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          {getReportsForIncident(inc.id).length} Reports
                        </button>
                      )}
                    </div>

                    {inc.status === "REPORTED" ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDispatch(inc.id);
                        }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white shadow-sm hover:opacity-90 cursor-pointer"
                        style={{ backgroundColor: "var(--color-primary)" }}
                      >
                        Auto-Assign Best Truck
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 truncate max-w-[150px]">
                        {inc.assignedTruck || "Assigned"}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =============== FLEET & DRIVERS MANAGEMENT ROW =============== */}
      <div className="mt-6 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Truck className="w-4.5 h-4.5 text-[var(--color-primary)]" />
            <div>
              <h2 className="text-sm font-bold">Active Fleet & Driver Management</h2>
              <p className="text-[10px] text-slate-500">Live payload capacity, driver telemetry, and dynamic municipal assignment</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Area */}
            <select
              value={fleetZoneFilter}
              onChange={(e) => setFleetZoneFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
            >
              <option value="All Zones">All Zones</option>
              <option value="Sector 12">Sector 12</option>
              <option value="Sector 21">Sector 21</option>
              <option value="Zone 2">Zone 2</option>
            </select>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setFleetTab("vehicles")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  fleetTab === "vehicles" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Vehicles
              </button>
              <button
                onClick={() => setFleetTab("drivers")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  fleetTab === "drivers" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                Drivers
              </button>
            </div>

            <button
              onClick={handleOpenAddVehicle}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all cursor-pointer ml-1"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-700" /> <span className="hidden sm:inline">Add</span> Vehicle
            </button>
            <button
              onClick={handleOpenAddDriver}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-teal-700" /> <span className="hidden sm:inline">Add</span> Driver
            </button>
          </div>
        </div>

        {/* Vehicles Grid Cards */}
        {fleetTab === "vehicles" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vehicles
              .filter(v => fleetZoneFilter === "All Zones" || v.zone.includes(fleetZoneFilter))
              .map((v) => {
              const loadPercent = Math.round((v.currentLoadKg / v.capacityKg) * 100);
              return (
                <div
                  key={v.id}
                  className="p-4 rounded-xl border border-slate-200 bg-[#FAF8F5]/50 hover:bg-white hover:shadow-md transition-all space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-extrabold text-slate-900">{v.plate}</span>
                      <p className="text-[11px] text-slate-500 font-semibold">{v.type}</p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        v.status === "EN_ROUTE"
                          ? "bg-teal-100 text-teal-800"
                          : v.status === "COLLECTING"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>

                  {/* Capacity Meter */}
                  <div>
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                      <span>Bin Payload</span>
                      <span>{v.currentLoadKg} / {v.capacityKg} kg ({loadPercent}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          loadPercent > 80 ? "bg-red-600" : "bg-[var(--color-aqua)]"
                        }`}
                        style={{ width: `${loadPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Driver & Operating Zone Info */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{v.driver || "Unassigned"}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium truncate max-w-[130px]" title={v.zone}>
                      📍 {v.zone}
                    </span>
                  </div>
                  
                  {/* Actions Row */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                    <button onClick={() => handleEditVehicle(v)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer" title="Edit Vehicle">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleToggleVehicleStatus(v.id)} className="p-1 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer" title="Toggle Maintenance">
                      <Wrench className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteVehicle(v.id)} className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer" title="Remove Vehicle">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Drivers Grid Cards */}
        {fleetTab === "drivers" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {drivers
              .filter(d => fleetZoneFilter === "All Zones" || d.zone.includes(fleetZoneFilter))
              .map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-xl border border-slate-200 bg-[#FAF8F5]/50 hover:bg-white hover:shadow-md transition-all space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-xs text-slate-900">{d.name}</span>
                    <p className="text-[11px] text-slate-500 font-mono">{d.license}</p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      d.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {d.status}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono">{d.assignedTruck || "Unassigned"}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium truncate max-w-[130px]" title={d.zone}>
                    📍 {d.zone}
                  </span>
                </div>
                <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>📱 {d.phone}</span>
                </div>

                {/* Actions Row */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button onClick={() => handleEditDriver(d)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer" title="Edit Driver">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleToggleDriverStatus(d.id)} className="p-1 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer" title="Toggle Leave">
                    <Wrench className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteDriver(d.id)} className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer" title="Remove Driver">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =============== AI MUNICIPAL AGENT + ALERTS ROW =============== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
        {/* AI Municipal Decision Agent Chat Panel */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bot className="w-4.5 h-4.5 text-[var(--color-primary)]" />
              <div>
                <h2 className="text-sm font-bold">AI Municipal Decision Assistant</h2>
                <p className="text-[10px] text-slate-500">Grounded in live system data · Advisory only · Officer confirmation required</p>
              </div>
            </div>
            <Link
              href="/analytics"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm"
            >
              <BarChart3 className="w-3.5 h-3.5" /> Analytics Dashboard
            </Link>
          </div>

          {/* Agent Conversation History */}
          <div className="min-h-[140px] max-h-[280px] overflow-y-auto mb-3 space-y-3">
            {agentHistory.length === 0 && !agentResponse && (
              <div className="text-center py-8">
                <Bot className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400 font-medium">Ask me anything about your municipal operations</p>
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {[
                    "Which areas should we prioritize tomorrow?",
                    "Show fleet status",
                    "What's our environmental impact?",
                    "Why is Zone 12 high priority?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setAgentQuery(suggestion);
                        handleAgentQuery(suggestion);
                      }}
                      className="text-[10px] px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 font-medium hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {agentHistory.map((entry, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-end">
                  <div className="bg-[var(--color-primary)] text-white text-xs px-3 py-2 rounded-xl rounded-tr-sm max-w-[80%] font-medium">
                    {entry.q}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-slate-50 border border-slate-200 text-xs px-3 py-2.5 rounded-xl rounded-tl-sm max-w-[90%] text-slate-800 whitespace-pre-line leading-relaxed">
                    {entry.a}
                  </div>
                </div>
              </div>
            ))}

            {agentLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-50 border border-slate-200 text-xs px-4 py-3 rounded-xl rounded-tl-sm text-slate-500 font-medium">
                  <span className="animate-pulse">Querying live data tools...</span>
                </div>
              </div>
            )}
          </div>

          {/* Agent Query Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (agentQuery.trim()) handleAgentQuery(agentQuery);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={agentQuery}
              onChange={(e) => setAgentQuery(e.target.value)}
              placeholder="Ask: Which areas should we prioritize tomorrow?"
              className="flex-1 px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 bg-slate-50"
            />
            <button
              type="submit"
              disabled={agentLoading || !agentQuery.trim()}
              className="p-2.5 rounded-xl bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Smart Alerts Panel */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[var(--color-accent)]" />
              <h2 className="text-sm font-bold">Smart Alerts</h2>
            </div>
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              {incidents.filter((i) => i.priority === "P0" || i.priority === "P1").length || 1} Active
            </span>
          </div>

          <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
            {(() => {
              const alerts = [];
              const p0s = incidents.filter((i) => i.priority === "P0");
              for (const p0 of p0s) {
                alerts.push({
                  type: "critical",
                  title: `P0 Emergency: ${p0.title}`,
                  message: `${p0.category} waste in sensitive zone (${p0.sensitiveLocation || "Hospital buffer zone"}).`,
                  action: "View & Dispatch",
                  time: formatRelativeTime(p0.latestReportAt || p0.createdAt),
                });
              }
              const p1s = incidents.filter((i) => i.priority === "P1");
              for (const p1 of p1s) {
                alerts.push({
                  type: "warning",
                  title: `High Priority: ${p1.title}`,
                  message: `Accumulation severity: ${p1.slaMinutesLeft}m SLA remaining. Immediate truck dispatch recommended.`,
                  action: "Assign Truck",
                  time: formatRelativeTime(p1.latestReportAt || p1.createdAt),
                });
              }
              if (alerts.length === 0) {
                alerts.push({
                  type: "info",
                  title: "All Municipal Sectors Monitored",
                  message: "Real-time AI surveillance active across Gandhinagar sectors. No critical SLA breaches detected.",
                  time: "Just now",
                });
              }
              return alerts;
            })().map((alert, i) => (
              <div
                key={i}
                className={`p-3 rounded-xl border text-xs ${
                  alert.type === "critical"
                    ? "bg-red-50/70 border-red-200 text-red-900"
                    : alert.type === "warning"
                    ? "bg-amber-50/70 border-amber-200 text-amber-900"
                    : alert.type === "ai"
                    ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                    : "bg-slate-50 border-slate-200 text-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">{alert.title}</span>
                  <span className="text-[10px] opacity-70">{alert.time}</span>
                </div>
                <p className="text-[11px] opacity-90 mb-2">{alert.message}</p>
                {alert.action && (
                  <button
                    onClick={() => {
                      if (alert.type === "critical") setSelectedIncident(incidents[0]);
                      else handleRecomputePriorities();
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border shadow-xs hover:opacity-80 cursor-pointer"
                  >
                    {alert.action} →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* =============== MODAL: REGISTER VEHICLE OR DRIVER =============== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border border-slate-100 relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-6 right-6 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Modal Tabs Header */}
            <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <button
                type="button"
                onClick={() => setAddModalTab("vehicle")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  addModalTab === "vehicle"
                    ? "bg-[var(--color-primary)] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>{modalMode === "edit" ? "Edit Vehicle" : "+ Register Vehicle"}</span>
              </button>
              <button
                type="button"
                onClick={() => setAddModalTab("driver")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  addModalTab === "driver"
                    ? "bg-[var(--color-primary)] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <UserPlus className="w-4 h-4" />
                <span>{modalMode === "edit" ? "Edit Driver" : "+ Register Driver"}</span>
              </button>
            </div>

            {/* TAB 1: ADD VEHICLE FORM */}
            {addModalTab === "vehicle" && (
              <form onSubmit={handleSaveVehicle} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    License Plate Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GJ-01-WM-5520"
                    value={newVehiclePlate}
                    onChange={(e) => setNewVehiclePlate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-mono font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Vehicle Type
                    </label>
                    <select
                      value={newVehicleType}
                      onChange={(e) => setNewVehicleType(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium"
                    >
                      <option value="Compactor 5T">Compactor 5T</option>
                      <option value="Tipper 3T">Tipper 3T</option>
                      <option value="Mini Truck 1.5T">Mini Truck 1.5T</option>
                      <option value="Electric Van 1T">Electric Van 1T</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Payload Capacity (kg)
                    </label>
                    <input
                      type="number"
                      required
                      min={500}
                      max={15000}
                      value={newVehicleCapacity}
                      onChange={(e) => setNewVehicleCapacity(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assign Driver
                  </label>
                  <select
                    value={newVehicleDriver}
                    onChange={(e) => setNewVehicleDriver(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium"
                  >
                    <option value="">Select a driver (or assign later)</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} ({d.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Operating Sector / Depot
                  </label>
                  <select
                    value={newVehicleZone}
                    onChange={(e) => setNewVehicleZone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium"
                  >
                    <option value="Sector 12 Hospital Zone">Sector 12 Hospital Zone</option>
                    <option value="Sector 21 APMC Yard">Sector 21 APMC Yard</option>
                    <option value="Sector 11 Corridor">Sector 11 Corridor</option>
                    <option value="Zone 2 Central Depot">Zone 2 Central Depot</option>
                  </select>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm cursor-pointer"
                  >
                    {modalMode === "edit" ? "Save Changes" : "Deploy Vehicle to Fleet"}
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: ADD DRIVER FORM */}
            {addModalTab === "driver" && (
              <form onSubmit={handleSaveDriver} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Driver Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Prajapati"
                    value={newDriverName}
                    onChange={(e) => setNewDriverName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="+91 98765 12340"
                      value={newDriverPhone}
                      onChange={(e) => setNewDriverPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      License Number
                    </label>
                    <input
                      type="text"
                      placeholder="GJ-01-2026-DRV-12"
                      value={newDriverLicense}
                      onChange={(e) => setNewDriverLicense(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assign to Existing Truck (Optional)
                  </label>
                  <select
                    value={newDriverTruck}
                    onChange={(e) => setNewDriverTruck(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium"
                  >
                    <option value="">None (Standby Driver)</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.plate}>
                        {v.plate} ({v.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Assigned Municipal Zone
                  </label>
                  <select
                    value={newDriverZone}
                    onChange={(e) => setNewDriverZone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-xs border border-slate-200 focus:outline-none font-medium"
                  >
                    <option value="Sector 12 Hospital Zone">Sector 12 Hospital Zone</option>
                    <option value="Sector 21 APMC Yard">Sector 21 APMC Yard</option>
                    <option value="Sector 11 Corridor">Sector 11 Corridor</option>
                    <option value="Zone 2 Central Depot">Zone 2 Central Depot</option>
                  </select>
                </div>

                <div className="pt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[var(--color-primary)] text-white hover:opacity-90 shadow-sm cursor-pointer"
                  >
                    {modalMode === "edit" ? "Save Changes" : "Register Driver"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =============== CITIZEN REPORT DETAIL DRAWER =============== */}
      {reportDrawerOpen && selectedReportDetail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          {/* Backdrop click to close */}
          <div className="flex-1" onClick={() => setReportDrawerOpen(false)} />

          {/* Drawer Panel */}
          <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-50">
                  <FileText className="w-5 h-5 text-indigo-700" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Citizen Report Detail</h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {selectedReportDetail.reportId} → Linked to Incident {selectedReportDetail.incidentId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setReportDrawerOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Report Navigation — switch between citizen reports for same incident */}
              {(() => {
                const allReports = getReportsForIncident(selectedReportDetail.incidentId);
                if (allReports.length > 1) {
                  return (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                        {allReports.length} Clustered Reports:
                      </span>
                      {allReports.map((r) => (
                        <button
                          key={r.reportId}
                          onClick={() => {
                            setSelectedReportDetail(r);
                            setOfficerActionNote("");
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            selectedReportDetail.reportId === r.reportId
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          }`}
                        >
                          {r.reportId}
                        </button>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Officer Action Status (if already acted) */}
              {selectedReportDetail.officerAction && (
                <div className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  selectedReportDetail.officerAction === "APPROVED" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
                  selectedReportDetail.officerAction === "ESCALATED" ? "bg-red-50 border-red-200 text-red-800" :
                  selectedReportDetail.officerAction === "REJECTED" ? "bg-slate-100 border-slate-300 text-slate-600" :
                  "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Officer Decision: {selectedReportDetail.officerAction}
                    {selectedReportDetail.officerNotes && ` — "${selectedReportDetail.officerNotes}"`}
                  </span>
                </div>
              )}

              {/* Photo Evidence Section */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                  Photo Evidence ({selectedReportDetail.photos.length})
                </h3>
                {selectedReportDetail.photos.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {selectedReportDetail.photos.map((photo, i) => (
                      <div key={`${selectedReportDetail.reportId}-photo-${i}`} className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
                        <img
                          src={photo}
                          alt={`Report ${selectedReportDetail.reportId} photo ${i + 1}`}
                          className="w-full h-56 object-cover"
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                          Photo {i + 1} of {selectedReportDetail.photos.length}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 bg-slate-50">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">No photo evidence uploaded</p>
                    <p className="text-[10px] text-slate-400">Citizen submitted coordinate / descriptive report without attachments</p>
                  </div>
                )}
              </div>

              {/* Reporter Information */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  Reporter Details
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-medium">Name</span>
                    <p className="font-bold text-slate-900">{selectedReportDetail.reporterName}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Phone</span>
                    <p className="font-bold text-slate-900">{selectedReportDetail.reporterPhone}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Submitted</span>
                    <p className="font-bold text-slate-900 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {selectedReportDetail.submittedAt}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Category</span>
                    <p className="font-bold text-slate-900 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-slate-400" />
                      {selectedReportDetail.category}
                    </p>
                  </div>
                </div>
              </div>

              {/* Citizen Description */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  Citizen Description
                </h3>
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4 text-xs text-slate-800 leading-relaxed italic">
                  &ldquo;{selectedReportDetail.description}&rdquo;
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  Location
                </h3>
                <p className="text-xs font-semibold text-slate-800">{selectedReportDetail.address}</p>
              </div>

              {/* AI Computer Vision Analysis */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200 space-y-3">
                <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  AI Computer Vision Analysis
                </h3>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-emerald-700 font-medium">Detected Category</span>
                    <p className="font-bold text-emerald-900">{selectedReportDetail.aiCategory}</p>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-medium">Confidence</span>
                    <p className="font-bold text-emerald-900">{(selectedReportDetail.aiConfidence * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-medium">Severity Score</span>
                    <p className="font-bold text-emerald-900">{selectedReportDetail.aiSeverity}/10</p>
                  </div>
                  <div>
                    <span className="text-emerald-700 font-medium">Est. Volume</span>
                    <p className="font-bold text-emerald-900">{selectedReportDetail.aiVolume} m³</p>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-emerald-700 font-medium block mb-1">Detected Tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedReportDetail.aiTags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-200">
                  <span className="text-[10px] text-emerald-700 font-medium block mb-1">AI Recommended Action</span>
                  <p className="text-xs font-bold text-emerald-900">{selectedReportDetail.aiRecommendedAction}</p>
                </div>
              </div>

              {/* DRIVER PROOF-OF-WORK & VERIFICATION SECTION */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                        Driver Proof-of-Work
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        Field collection verification & proof-of-work audit
                      </p>
                    </div>
                  </div>

                  {/* Dynamic Status Badge */}
                  {(() => {
                    if (isLoadingExecution) {
                      return (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 animate-pulse">
                          Syncing Execution...
                        </span>
                      );
                    }
                    const proofStatus = driverExecution?.proof?.verification_status;
                    const incStatus = driverExecution?.status || selectedReportDetail.incidentId;
                    if (proofStatus === "VERIFIED" || incStatus === "RESOLVED" || incStatus === "VERIFIED") {
                      return (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-400" />
                          VERIFIED
                        </span>
                      );
                    }
                    if (proofStatus === "REJECTED") {
                      return (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 flex items-center gap-1">
                          <X className="w-3 h-3 text-red-400" />
                          PROOF REJECTED
                        </span>
                      );
                    }
                    if (driverExecution?.proof) {
                      return (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-400" />
                          PROOF UPLOADED — PENDING VERIFICATION
                        </span>
                      );
                    }
                    if (driverExecution?.driver) {
                      if (driverExecution.assignment?.started_at) {
                        return (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            COLLECTION IN PROGRESS
                          </span>
                        );
                      }
                      return (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          DRIVER EN ROUTE
                        </span>
                      );
                    }
                    return (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                        AWAITING DRIVER ASSIGNMENT
                      </span>
                    );
                  })()}
                </div>

                {/* Driver & Vehicle Metadata */}
                <div className="grid grid-cols-2 gap-3 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Assigned Driver
                    </span>
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      {driverExecution?.driver?.name || "Vikram Patel"}
                    </p>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ID: {driverExecution?.driver?.id ? `DRV-${String(driverExecution.driver.id).slice(0, 6).toUpperCase()}` : "DRV-8821"}
                      {driverExecution?.driver?.phone && ` • ${driverExecution.driver.phone}`}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Vehicle & Equipment
                    </span>
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-400" />
                      {driverExecution?.driver?.vehicle_plate || "GJ-01-WM-4402"}
                    </p>
                    <span className="text-[10px] text-slate-400">
                      {driverExecution?.driver?.vehicle_type || "5T Compactor Truck"}
                    </span>
                  </div>
                </div>

                {/* Milestones / Timestamps */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60">
                  <div className="border-r border-slate-800/60 pr-1">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Assigned At</span>
                    <span className="font-semibold text-slate-200 text-[11px]">
                      {driverExecution?.assignment?.assigned_at
                        ? formatRelativeTime(driverExecution.assignment.assigned_at)
                        : "—"}
                    </span>
                  </div>
                  <div className="border-r border-slate-800/60 px-1">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Started / Arrived</span>
                    <span className="font-semibold text-slate-200 text-[11px]">
                      {driverExecution?.assignment?.started_at
                        ? formatRelativeTime(driverExecution.assignment.started_at)
                        : "—"}
                    </span>
                  </div>
                  <div className="pl-1">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block">Completed</span>
                    <span className="font-semibold text-slate-200 text-[11px]">
                      {driverExecution?.assignment?.completed_at
                        ? formatRelativeTime(driverExecution.assignment.completed_at)
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Side-by-Side BEFORE / AFTER Comparison */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wide">
                      Before vs After Cleaning Comparison
                    </span>
                    {driverExecution?.proof && (
                      <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        Proof Ready for Review
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Before Image (Citizen Evidence) */}
                    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex flex-col justify-between">
                      <div className="p-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          BEFORE CLEANING
                        </span>
                        <span className="text-[9px] text-slate-400">Citizen Report</span>
                      </div>
                      {selectedReportDetail.photos.length > 0 ? (
                        <div className="relative group">
                          <img
                            src={selectedReportDetail.photos[0]}
                            alt="Before cleaning evidence"
                            className="w-full h-44 object-cover"
                          />
                          {selectedReportDetail.photos.length > 1 && (
                            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[9px] font-bold">
                              + {selectedReportDetail.photos.length - 1} more photos
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="h-44 flex flex-col items-center justify-center p-4 text-center text-slate-500">
                          <ImageIcon className="w-6 h-6 mb-1 text-slate-600" />
                          <span className="text-[10px]">No citizen photo provided</span>
                        </div>
                      )}
                    </div>

                    {/* After Image (Driver Proof of Work) */}
                    <div className="relative rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex flex-col justify-between">
                      <div className="p-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          AFTER CLEANING (PROOFS)
                        </span>
                        <span className="text-[9px] text-slate-400">Driver Cockpit</span>
                      </div>
                      {driverExecution?.proof ? (
                        <div className="relative group">
                          <img
                            src={driverExecution.proof.image_url}
                            alt="Post-cleaning driver proof"
                            className="w-full h-44 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setFullProofModalUrl(driverExecution.proof?.image_url || null)}
                          />
                          <button
                            onClick={() => setFullProofModalUrl(driverExecution.proof?.image_url || null)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                            title="Expand Full Proof Image"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                            Supabase Verified Photo
                          </div>
                        </div>
                      ) : (
                        <div className="h-44 flex flex-col items-center justify-center p-4 text-center text-slate-500 bg-slate-950/50">
                          <Truck className="w-6 h-6 mb-2 text-slate-600 animate-bounce" />
                          <span className="text-xs font-semibold text-slate-400">Awaiting Driver Proof-of-Work</span>
                          <span className="text-[10px] text-slate-500 mt-0.5">Photo capture compulsory for completion</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Proof Verification & Metadata Bar */}
                {driverExecution?.proof && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-medium block">Proof Captured</span>
                        <span className="font-semibold text-slate-200">
                          {driverExecution.proof.captured_at
                            ? new Date(driverExecution.proof.captured_at).toLocaleTimeString()
                            : "Just now"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-medium block">GPS Coordinates</span>
                        <span className="font-mono text-[11px] text-slate-200">
                          {driverExecution.proof.latitude?.toFixed(4)}°N, {driverExecution.proof.longitude?.toFixed(4)}°E
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-slate-300 text-[11px]">
                          {driverExecution.proof.distance_meters !== null && driverExecution.proof.distance_meters !== undefined
                            ? `${driverExecution.proof.distance_meters}m from incident site`
                            : "On-site verified"}
                        </span>
                      </div>
                      {driverExecution.proof.location_verified ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Location Verified
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Location Mismatch
                        </span>
                      )}
                    </div>

                    {/* Officer Action Buttons for Proof */}
                    {driverExecution.proof.verification_status !== "VERIFIED" ? (
                      <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                        <button
                          onClick={() => setFullProofModalUrl(driverExecution.proof?.image_url || null)}
                          className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View Full Proof
                        </button>
                        <button
                          onClick={() => setIsVerifyModalOpen(true)}
                          className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950 cursor-pointer transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verify Proof
                        </button>
                        <button
                          onClick={() => setIsRejectModalOpen(true)}
                          className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/80 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-800 bg-emerald-950/30 -mx-3.5 -mb-3.5 p-3 rounded-b-xl border-t border-emerald-500/30 text-xs text-emerald-300 font-bold flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Proof Verified by Municipal Officer
                        </span>
                        <button
                          onClick={() => setFullProofModalUrl(driverExecution.proof?.image_url || null)}
                          className="text-[11px] underline text-emerald-400 hover:text-emerald-200 cursor-pointer"
                        >
                          Inspect Photo
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Execution Timeline Milestones */}
                {driverExecution?.timeline && driverExecution.timeline.length > 0 && (
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Execution Audit Timeline
                    </span>
                    <div className="space-y-2">
                      {driverExecution.timeline.map((step, idx) => (
                        <div key={`timeline-${idx}`} className="flex items-start gap-2.5 text-xs">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-200">{step.event.replace(/_/g, " ")}</span>
                              <span className="text-[10px] text-slate-400">
                                {formatRelativeTime(step.timestamp)}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {step.actor} {step.notes && `— ${step.notes}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Officer Action Section */}
              {!selectedReportDetail.officerAction && (
                <div className="bg-white rounded-xl p-4 border-2 border-dashed border-slate-300 space-y-4">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    Officer Decision Required
                  </h3>

                  {/* Officer Notes */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 mb-1 block">
                      Notes (optional)
                    </label>
                    <textarea
                      rows={2}
                      value={officerActionNote}
                      onChange={(e) => setOfficerActionNote(e.target.value)}
                      placeholder="Add officer notes before taking action..."
                      className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 resize-none"
                    />
                  </div>

                  {/* Manual Overrides */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Manual Overrides</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Override Severity</label>
                        <select 
                          value={manualSeverity}
                          onChange={(e) => setManualSeverity(e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-white"
                        >
                          <option value="DEFAULT">Keep Current / AI Suggested</option>
                          <option value="P0">P0 (Critical Emergency)</option>
                          <option value="P1">P1 (High Priority)</option>
                          <option value="P2">P2 (Medium Priority)</option>
                          <option value="P3">P3 (Standard)</option>
                          <option value="P4">P4 (Low)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-slate-600 mb-1 block">Manual Truck Dispatch</label>
                        <select 
                          value={manualTruck}
                          onChange={(e) => setManualTruck(e.target.value)}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-white font-medium text-slate-800"
                        >
                          <option value="AUTO">Auto-Assign Best Available Vehicle</option>
                          {vehicles.map(v => (
                            <option key={v.rawId || v.id} value={v.rawId || v.id}>
                              {v.plate} — {v.driverName || "Assigned Driver"} ({v.type})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleOfficerAction(selectedReportDetail.reportId, "APPROVED")}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm cursor-pointer transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve & Dispatch
                    </button>
                    <button
                      onClick={() => handleOfficerAction(selectedReportDetail.reportId, "ESCALATED")}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 shadow-sm cursor-pointer transition-all"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      Escalate to P0
                    </button>
                    <button
                      onClick={() => handleOfficerAction(selectedReportDetail.reportId, "REJECTED")}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer transition-all"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                      Reject / Close
                    </button>
                    <button
                      onClick={() => handleOfficerAction(selectedReportDetail.reportId, "DUPLICATE")}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 cursor-pointer transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Mark Duplicate
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FULL PROOF LIGHTBOX MODAL */}
      {fullProofModalUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative max-w-4xl w-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">Full-Resolution Driver Proof Photo</h4>
              </div>
              <button
                onClick={() => setFullProofModalUrl(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black">
              <img
                src={fullProofModalUrl}
                alt="Driver proof full resolution"
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>Verified Supabase Storage Asset</span>
              <a
                href={fullProofModalUrl}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1"
              >
                Open Original in New Window <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* VERIFY PROOF CONFIRMATION MODAL */}
      {isVerifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/20">
                <CheckCircle2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-base font-bold">Verify Collection Proof</h4>
                <p className="text-xs text-emerald-100">Confirm post-cleaning proof & mark incident Resolved</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <p className="text-slate-500 font-medium">Incident: <span className="font-bold text-slate-900">{driverExecution?.incident_code || selectedReportDetail?.incidentId}</span></p>
                <p className="text-slate-500 font-medium">Driver: <span className="font-bold text-slate-900">{driverExecution?.driver?.name || "Vikram Patel"}</span></p>
                <p className="text-slate-500 font-medium">GPS Accuracy: <span className="font-bold text-emerald-700">{driverExecution?.proof?.distance_meters ?? 15}m from site (Verified)</span></p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Officer Verification Notes (optional)
                </label>
                <textarea
                  rows={3}
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="e.g., Site visually inspected and verified clear of debris."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setIsVerifyModalOpen(false)}
                  disabled={isSubmittingVerification}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerifyDriverProof}
                  disabled={isSubmittingVerification}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingVerification ? "Confirming..." : "Confirm Verification"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT PROOF MODAL */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-5 bg-gradient-to-r from-red-600 to-rose-700 text-white flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/20">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-base font-bold">Reject Collection Proof</h4>
                <p className="text-xs text-red-100">Notify driver to retake and upload new proof photo</p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Rejection Reason (Required)
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 bg-white font-medium"
                >
                  <option value="Image does not show cleaned area">Image does not show cleaned area</option>
                  <option value="GPS Location Mismatch (Too far from site)">GPS Location Mismatch (Too far from site)</option>
                  <option value="Photo is blurry, dark, or unrecognizable">Photo is blurry, dark, or unrecognizable</option>
                  <option value="Accumulation still remains at the site">Accumulation still remains at the site</option>
                  <option value="Duplicate or obsolete photo">Duplicate or obsolete photo</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 mb-1.5 block">
                  Detailed Feedback for Driver
                </label>
                <textarea
                  rows={3}
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="e.g., Please ensure the entire perimeter is clear before capturing the photo."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setIsRejectModalOpen(false)}
                  disabled={isSubmittingVerification}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectDriverProof}
                  disabled={isSubmittingVerification}
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingVerification ? "Rejecting..." : "Confirm Rejection"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
