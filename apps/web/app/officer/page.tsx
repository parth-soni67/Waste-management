"use client";

import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import Link from "next/link";
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
  title: string;
  category: string;
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  status: "REPORTED" | "ASSIGNED" | "IN_PROGRESS" | "COLLECTED" | "VERIFIED";
  lat: number;
  lng: number;
  reportsCount: number;
  timeAgo: string;
  slaMinutesLeft: number;
  assignedTruck?: string;
  sensitiveLocation?: string;
}

interface FleetVehicle {
  id: string;
  plate: string;
  type: string;
  capacityKg: number;
  currentLoadKg: number;
  status: "AVAILABLE" | "ASSIGNED" | "EN_ROUTE" | "COLLECTING";
  driver: string;
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
  assignedTruck: string;
  status: "ACTIVE" | "ON_BREAK" | "OFF_DUTY";
}

interface CitizenReportDetail {
  reportId: string;
  incidentId: string;
  reporterName: string;
  reporterPhone: string;
  description: string;
  address: string;
  category: string;
  photos: string[];
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

export default function OfficerPage() {
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

  // Citizen Reports Database (linked to incidents by incidentId)
  const [citizenReports, setCitizenReports] = useState<CitizenReportDetail[]>([
    {
      reportId: "REP-9482",
      incidentId: "INC-8091",
      reporterName: "Anita Sharma",
      reporterPhone: "+91 98765 43210",
      description: "Overflowing green bins near hospital main gate. Mixed waste including used masks, syringes visible, and plastic food packaging. Very foul smell. Patients and visitors are affected. This has been here for 2 days. Please clean urgently — this is a health hazard near the pediatric ward.",
      address: "Sector 12 Civil Hospital Main Gate, Gandhinagar",
      category: "Hazardous / Bio-Medical",
      photos: ["/demo-report-1.jpg"],
      submittedAt: "18 Aug 2026, 09:36 AM",
      aiCategory: "Hazardous Bio-Medical Waste",
      aiConfidence: 0.96,
      aiSeverity: 9.2,
      aiVolume: 3.4,
      aiTags: ["bio_hazard", "medical_waste", "overflow_bin", "syringes", "masks"],
      aiRecommendedAction: "IMMEDIATE: Dispatch Hazmat-certified Compactor. Notify hospital administration.",
    },
    {
      reportId: "REP-9380",
      incidentId: "INC-8091",
      reporterName: "Rakesh Patel",
      reporterPhone: "+91 99876 12340",
      description: "More waste piling up near the hospital side entrance. Same issue as other reports. Medical waste packaging visible.",
      address: "Sector 12 Civil Hospital Side Gate, Gandhinagar",
      category: "Hazardous / Bio-Medical",
      photos: ["/demo-report-1.jpg"],
      submittedAt: "18 Aug 2026, 09:48 AM",
      aiCategory: "Hazardous Bio-Medical Waste",
      aiConfidence: 0.92,
      aiSeverity: 8.8,
      aiVolume: 2.1,
      aiTags: ["bio_hazard", "medical_packaging", "overflow_bin"],
      aiRecommendedAction: "Cluster with existing INC-8091. Escalate priority.",
    },
    {
      reportId: "REP-9104",
      incidentId: "INC-8042",
      reporterName: "Meera Joshi",
      reporterPhone: "+91 98712 56789",
      description: "Huge pile of plastic bottles and packaging waste dumped next to the railway depot boundary wall. Looks like someone unloaded a truck of packaging waste here. Blocking the pedestrian path.",
      address: "Gandhinagar Railway Depot, Platform Side",
      category: "Plastic / Bottling",
      photos: ["/demo-report-2.jpg"],
      submittedAt: "18 Aug 2026, 08:50 AM",
      aiCategory: "Plastic Packaging Waste",
      aiConfidence: 0.94,
      aiSeverity: 7.6,
      aiVolume: 2.8,
      aiTags: ["plastic_bottles", "packaging", "illegal_dumping", "pedestrian_hazard"],
      aiRecommendedAction: "Dispatch 5-Tonne Compactor. Flag for illegal dumping investigation.",
    },
    {
      reportId: "REP-8920",
      incidentId: "INC-7994",
      reporterName: "Suresh Desai",
      reporterPhone: "+91 97654 32100",
      description: "Rotting vegetable waste from the wholesale market spilling onto the road. Strong smell attracting stray animals. Market vendors also dumping water from fish stalls.",
      address: "APMC Wholesale Yard, Gate 3, Sector 21",
      category: "Organic / Food",
      photos: ["/demo-report-2.jpg"],
      submittedAt: "18 Aug 2026, 08:00 AM",
      aiCategory: "Organic Food Waste",
      aiConfidence: 0.91,
      aiSeverity: 6.8,
      aiVolume: 4.2,
      aiTags: ["organic_waste", "food_waste", "market_spill", "stray_animals"],
      aiRecommendedAction: "Dispatch Tipper truck. Schedule daily pre-market cleanup.",
    },
    {
      reportId: "REP-8850",
      incidentId: "INC-7920",
      reporterName: "Kiran Thakor",
      reporterPhone: "+91 98890 11223",
      description: "Construction rubble and broken concrete blocks dumped on service road shoulder. Partly blocking traffic flow for two-wheelers.",
      address: "Service Road near Zone 2 Central Depot",
      category: "Construction Debris",
      photos: ["/demo-report-1.jpg"],
      submittedAt: "18 Aug 2026, 06:15 AM",
      aiCategory: "Construction & Demolition Waste",
      aiConfidence: 0.88,
      aiSeverity: 5.4,
      aiVolume: 6.0,
      aiTags: ["construction_debris", "concrete", "road_hazard", "illegal_dumping"],
      aiRecommendedAction: "Dispatch Heavy Tipper. Fine construction contractor if identifiable.",
    },
  ]);

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

  // Registered Vehicles State
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

  // Initial Route Polyline Coordinates (Truck -> Stop 1 -> Stop 2 -> Disposal Facility)
  const [routeCoordinates, setRouteCoordinates] = useState<Array<[number, number]>>([
    [72.578, 23.025], // Truck position
    [72.562, 23.018], // INC-8042 (P1)
    [72.548, 23.045], // INC-7994 (P2)
    [72.535, 23.060], // Waste Processing Plant
  ]);

  // Realistic seed incidents with clustered report intelligence
  const [incidents, setIncidents] = useState<IncidentItem[]>([
    {
      id: "INC-8091",
      title: "Hazardous mixed waste at Sector 12 Civil Hospital Red Zone",
      category: "Hazardous / Bio-Medical",
      priority: "P0",
      status: "REPORTED",
      lat: 23.033,
      lng: 72.586,
      reportsCount: 8,
      timeAgo: "24m ago",
      slaMinutesLeft: 36,
      sensitiveLocation: "Civil Hospital Buffer Zone (<200m)",
    },
    {
      id: "INC-8042",
      title: "Plastic packaging pile by Gandhinagar Railway Depot",
      category: "Plastic / Bottling",
      priority: "P1",
      status: "ASSIGNED",
      lat: 23.018,
      lng: 72.562,
      reportsCount: 4,
      timeAgo: "1h 10m ago",
      slaMinutesLeft: 110,
      assignedTruck: "GJ-01-WM-4402 (Compactor)",
    },
    {
      id: "INC-7994",
      title: "Organic market waste spill at Sector 21",
      category: "Organic / Food",
      priority: "P2",
      status: "IN_PROGRESS",
      lat: 23.045,
      lng: 72.548,
      reportsCount: 3,
      timeAgo: "2h ago",
      slaMinutesLeft: 240,
      assignedTruck: "GJ-01-WM-9120 (Tipper)",
      sensitiveLocation: "APMC Wholesale Yard",
    },
    {
      id: "INC-7920",
      title: "Construction debris dumped on service road",
      category: "Construction Debris",
      priority: "P3",
      status: "REPORTED",
      lat: 23.008,
      lng: 72.595,
      reportsCount: 2,
      timeAgo: "4h ago",
      slaMinutesLeft: 480,
    },
  ]);

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
      points.push({
        id: veh.id,
        lat: veh.lat,
        lng: veh.lng,
        title: `${veh.plate} (${veh.type} · Driver: ${veh.driver || "Unassigned"})`,
        type: "vehicle" as const,
      });
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

  useEffect(() => {
    const loadSyncedData = () => {
      try {
        const syncedIncidents = JSON.parse(localStorage.getItem("sync_incidents") || "[]");
        const syncedDetails = JSON.parse(localStorage.getItem("sync_report_details") || "[]");
        
        if (syncedIncidents.length > 0) {
          setIncidents(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newIncidents = syncedIncidents.filter((i: any) => !existingIds.has(i.id));
            if (newIncidents.length === 0) return prev;
            return [...newIncidents, ...prev];
          });
        }
        
        if (syncedDetails.length > 0) {
          setCitizenReports(prev => {
            const existingIds = new Set(prev.map(p => p.reportId));
            const newDetails = syncedDetails.filter((r: any) => !existingIds.has(r.reportId));
            if (newDetails.length === 0) return prev;
            return [...newDetails, ...prev];
          });
        }
      } catch (e) {
        console.error("Failed to load synced reports", e);
      }
    };

    loadSyncedData();
    window.addEventListener("storage", loadSyncedData);
    
    // Fallback: poll every 2s for demo purposes just in case they are in the same tab/window 
    // where storage events might not fire properly for the same document
    const interval = setInterval(loadSyncedData, 2000);

    return () => {
      window.removeEventListener("storage", loadSyncedData);
      clearInterval(interval);
    };
  }, []);

  const getMinutes = (timeStr: string) => {
    if (timeStr === "Just now") return 0;
    let mins = 0;
    const h = timeStr.match(/(\d+)\s*h/);
    const m = timeStr.match(/(\d+)\s*m/);
    if (h) mins += parseInt(h[1]) * 60;
    if (m) mins += parseInt(m[1]);
    return mins;
  };

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
      const minsA = getMinutes(a.timeAgo);
      const minsB = getMinutes(b.timeAgo);
      return filterTime === "LATEST" ? minsA - minsB : minsB - minsA;
    });

  const handleDispatch = (id: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? {
              ...inc,
              status: "ASSIGNED",
              assignedTruck: "GJ-01-WM-8820 (Best-fit Auto Assigned)",
            }
          : inc
      )
    );
  };

  // Open report detail drawer for an incident
  const handleViewReports = (incidentId: string) => {
    const reports = citizenReports.filter((r) => r.incidentId === incidentId);
    if (reports.length > 0) {
      setSelectedReportDetail(reports[0]);
      setReportDrawerOpen(true);
      setOfficerActionNote("");
      setManualSeverity("DEFAULT");
      setManualTruck("AUTO");
    }
  };

  // Get all citizen reports for a given incident
  const getReportsForIncident = (incidentId: string) => {
    return citizenReports.filter((r) => r.incidentId === incidentId);
  };

  // Officer action handlers on citizen reports
  const handleOfficerAction = (reportId: string, action: CitizenReportDetail["officerAction"]) => {
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
      const truckToSet = manualTruck !== "AUTO" ? manualTruck : "GJ-01-WM-4402 (Ramesh Patel)";
      
      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id === report.incidentId) {
            return {
              ...inc,
              ...(priorityToSet ? { priority: priorityToSet as any } : {}),
              ...(action === "APPROVED" ? { status: "ASSIGNED", assignedTruck: truckToSet } : {})
            };
          }
          return inc;
        })
      );
    }

    const actionLabels = { APPROVED: "Approved & Dispatched", ESCALATED: "Escalated to P0", REJECTED: "Rejected", DUPLICATE: "Marked Duplicate" };
    setSuccessToast(`✅ Report ${reportId}: ${actionLabels[action!] || action}`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleRecomputePriorities = () => {
    setIsRecomputing(true);
    setTimeout(() => {
      setIsRecomputing(false);
      setRecomputeAlert("Dynamic Priority Engine: Evaluated 14 active incidents, recalculated SLA deadlines & consensus scores.");
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
    setVehicles((prev) => prev.map((v) => v.id === id ? { ...v, status: v.status === "MAINTENANCE" ? "AVAILABLE" : "MAINTENANCE" } : v));
  };

  const handleDeleteVehicle = (id: string) => {
    if (confirm("Are you sure you want to remove this vehicle?")) {
      setVehicles((prev) => prev.filter((v) => v.id !== id));
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
    setDrivers((prev) => prev.map((d) => d.id === id ? { ...d, status: d.status === "ON LEAVE" ? "ACTIVE" : "ON LEAVE" } : d));
  };

  const handleDeleteDriver = (id: string) => {
    if (confirm("Are you sure you want to remove this driver?")) {
      setDrivers((prev) => prev.filter((d) => d.id !== id));
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

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] p-8 flex items-center justify-center">
        <div className="animate-pulse text-sm text-slate-500 font-medium">Loading Command Center...</div>
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
            {filteredIncidents.map((inc, idx) => (
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
                  <span className="text-[11px] font-semibold text-slate-400">{inc.timeAgo}</span>
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
            ))}
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
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">4 Active</span>
          </div>

          <div className="space-y-2.5 max-h-[320px] overflow-y-auto">
            {[
              {
                type: "critical",
                title: "P0 Emergency: Bio-hazard near Hospital",
                message: "Hazardous waste within 200m of Civil Hospital pediatric wing.",
                action: "View & Dispatch",
                time: "2m ago",
              },
              {
                type: "warning",
                title: "SLA Breach: INC-8091 exceeds 2h target",
                message: "Hazardous mixed waste at Sector 12 Civil Hospital Red Zone has exceeded P0 SLA. Currently at 2h 24m.",
                action: "Escalate Priority",
                time: "14m ago",
              },
              {
                type: "ai",
                title: "AI: Sector 21 approaching critical",
                message: "89% accumulation probability by 09:30 AM. Recommend pre-dispatch by 06:00 AM.",
                action: "Schedule Pre-dispatch",
                time: "28m ago",
              },
              {
                type: "info",
                title: "Route optimization saved 14.2 km",
                message: "Dynamic re-routing saved 2.56L fuel and 6.86 kg CO₂ today.",
                time: "1h ago",
              },
            ].map((alert, i) => (
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
                <div className="grid grid-cols-1 gap-3">
                  {selectedReportDetail.photos.map((photo, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                      <img
                        src={photo}
                        alt={`Report photo ${i + 1}`}
                        className="w-full h-56 object-cover"
                      />
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                        Photo {i + 1} of {selectedReportDetail.photos.length}
                      </div>
                    </div>
                  ))}
                </div>
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
                          className="w-full text-xs p-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-white"
                        >
                          <option value="AUTO">Auto-Assign Best Truck</option>
                          {vehicles.map(v => (
                            <option key={v.id} value={`${v.plate} (${v.driver})`}>
                              {v.plate} ({v.driver})
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
    </div>
  );
}
