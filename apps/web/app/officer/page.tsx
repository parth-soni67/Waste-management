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

export default function OfficerPage() {
  const [filterPriority, setFilterPriority] = useState<string>("ALL");
  const [showHotspots, setShowHotspots] = useState<boolean>(true);
  const [isRecomputing, setIsRecomputing] = useState(false);
  const [recomputeAlert, setRecomputeAlert] = useState<string | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentResponse, setAgentResponse] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentHistory, setAgentHistory] = useState<Array<{q: string; a: string}>>([]);

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

    // Add active collection trucks
    points.push(
      {
        id: "TRK-01",
        lat: 23.025,
        lng: 72.578,
        title: "GJ-01-WM-4402 (En Route)",
        type: "vehicle" as const,
      },
      {
        id: "TRK-02",
        lat: 23.042,
        lng: 72.551,
        title: "GJ-01-WM-9120 (Collecting)",
        type: "vehicle" as const,
      }
    );

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
  }, [incidents, showHotspots]);

  const filteredIncidents =
    filterPriority === "ALL"
      ? incidents
      : incidents.filter((i) => i.priority === filterPriority);

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
          {/* Loop C Demo Simulator Trigger */}
          <button
            onClick={handleSimulateLoopC}
            disabled={isRecomputing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white shadow-sm hover:opacity-90 cursor-pointer animate-pulse"
            style={{ backgroundColor: "var(--color-p0-emergency)" }}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Simulate P0 Emergency (Loop C)</span>
          </button>

          <button
            onClick={handleRecomputePriorities}
            disabled={isRecomputing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isRecomputing ? "animate-spin" : ""}`} />
            <span>Recompute Priority</span>
          </button>

          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
            <span>WebSocket Live</span>
          </div>
        </div>
      </div>

      {recomputeAlert && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 font-bold flex items-center justify-between shadow-sm">
          <span>{recomputeAlert}</span>
        </div>
      )}

      {/* Bento Grid Top Row: Key Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Active Incidents", value: `${incidents.length}`, change: "+3 clustered today", alert: true },
          { label: "Predicted Hotspots", value: "4 Zones", change: "89% peak risk", highlight: true },
          { label: "Active Fleet", value: "8 / 10", change: "80% utilization" },
          { label: "Route Distance Saved", value: "14.2 km", change: "18% fuel saved" },
          { label: "CO₂ Avoided", value: "38.1 kg", change: "SDG 11 / 12 aligned", safe: true },
          { label: "Avg Response", value: "28 min", change: "44% faster" },
        ].map((kpi, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between"
            style={{ borderRadius: "var(--radius-card)" }}
          >
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {kpi.label}
            </p>
            <p
              className={`text-2xl font-extrabold ${
                kpi.alert
                  ? "text-red-700"
                  : kpi.highlight
                  ? "text-[var(--color-accent)]"
                  : kpi.safe
                  ? "text-emerald-700"
                  : "text-[var(--color-primary)]"
              }`}
            >
              {kpi.value}
            </p>
            <span className="text-[10px] text-slate-400 font-medium mt-1">{kpi.change}</span>
          </div>
        ))}
      </div>

      {/* Main Grid: Interactive Map + Real-time Incident Triage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Map (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col h-[620px]">
          {/* Map Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold text-slate-800">Live Spatial Routing & Hotspot Layer</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 font-bold text-[var(--color-primary)]">
                <Route className="w-3.5 h-3.5" /> Dynamic Polyline Active
              </span>
              <button
                onClick={() => setShowHotspots(!showHotspots)}
                className={`px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                  showHotspots
                    ? "bg-amber-100 text-amber-900 border-amber-300"
                    : "bg-slate-50 text-slate-600 border-slate-200"
                }`}
              >
                🔥 Hotspots: {showHotspots ? "ON" : "OFF"}
              </button>
              <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-bold">P0 Emergency</span>
              <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 font-bold">🚛 Live Fleet</span>
            </div>
          </div>

          {/* MapLibre Container with Dynamic Route Polyline */}
          <div className="flex-1 w-full relative">
            <MapLibreView
              points={mapPoints}
              routePolyline={routeCoordinates}
              onSelectPoint={(pt) => {
                const found = incidents.find((i) => i.id === pt.id);
                if (found) setSelectedIncident(found);
              }}
            />
          </div>
        </div>

        {/* Right Column: Triage Incident Queue (5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col h-[620px]">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold">Incident Triage Queue</h2>
              <p className="text-xs text-slate-500">Auto-ranked by Dynamic Priority Engine</p>
            </div>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1 bg-slate-50 font-semibold"
            >
              <option value="ALL">All Severities</option>
              <option value="P0">P0 Emergency</option>
              <option value="P1">P1 High</option>
              <option value="P2">P2 Normal</option>
            </select>
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
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>SLA: {inc.slaMinutesLeft}m left</span>
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
                    ? "bg-red-50 border-red-200"
                    : alert.type === "warning"
                    ? "bg-amber-50 border-amber-200"
                    : alert.type === "ai"
                    ? "bg-blue-50 border-blue-200"
                    : "bg-slate-50 border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className={`font-bold text-xs leading-tight ${
                    alert.type === "critical" ? "text-red-900" : alert.type === "warning" ? "text-amber-900" : alert.type === "ai" ? "text-blue-900" : "text-slate-800"
                  }`}>
                    {alert.type === "ai" && "🤖 "}{alert.title}
                  </h3>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{alert.time}</span>
                </div>
                <p className="text-[11px] text-slate-600 mb-2">{alert.message}</p>
                {alert.action && (
                  <button className={`text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer ${
                    alert.type === "critical" ? "bg-red-700 text-white" : alert.type === "warning" ? "bg-amber-700 text-white" : "bg-blue-700 text-white"
                  }`}>
                    {alert.action}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  function handleAgentQuery(query: string) {
    setAgentLoading(true);
    setAgentQuery("");

    // Simulate grounded agent response
    setTimeout(() => {
      const lowerQ = query.toLowerCase();
      let answer = "";

      if (lowerQ.includes("priorit") || lowerQ.includes("tomorrow") || lowerQ.includes("focus")) {
        answer = `**Priority Recommendation based on 14 active incidents and 4 predicted hotspots:**

1. **Sector 21 APMC Market** — 4 active incidents (avg P1)
2. **Sector 11 Residential Corridor** — 3 active incidents (avg P1)
3. **Sector 12 Civil Hospital Buffer** — 2 active incidents (avg P0)

**Tomorrow's Predicted Surges:**
- Sector 21 APMC Market: expected 4.2m³ — dispatch by 06:00 AM
- Sector 7 School Cluster: expected 1.8m³ — dispatch by 07:30 AM

⚠️ 2 SLA violations currently active. 5 incidents unresolved >4 hours.

_Data sources: incidents.top_zones, hotspots.predicted_tomorrow_`;
      } else if (lowerQ.includes("fleet") || lowerQ.includes("vehicle") || lowerQ.includes("truck")) {
        answer = `**Fleet Status — 8/10 vehicles active (80% utilization):**

- **GJ-01-WM-4402** (Compactor) — EN_ROUTE, 49% loaded, 3 tasks
- **GJ-01-WM-9120** (Tipper) — COLLECTING, 72% loaded, 2 tasks
- **GJ-01-WM-8820** (Compactor) — AVAILABLE, 0% loaded, 0 tasks
- **GJ-01-WM-5510** (Electric Mini) — AVAILABLE, 0% loaded, 0 tasks

1 in maintenance, 1 offline.

_Data source: fleet.vehicles_`;
      } else if (lowerQ.includes("environment") || lowerQ.includes("co2") || lowerQ.includes("fuel") || lowerQ.includes("sdg")) {
        answer = `**Environmental Impact Dashboard (SDG 11 & 12):**

- Fuel saved: **142.8 liters**
- CO₂ avoided: **382.7 kg**
- Distance reduced: **89.4 km**
- Route efficiency improvement: **23.1%**
- Waste diverted from landfill: **4,200 kg**

Aligned with: SDG 11 (Sustainable Cities), SDG 12 (Responsible Consumption)

_Data source: environmental.*_`;
      } else if (lowerQ.includes("zone") || lowerQ.includes("why") || lowerQ.includes("high")) {
        answer = `**Zone Priority Analysis:**

- **Sector 21 APMC Market**: 4 incidents, avg priority P1 — Hotspot reason: Daily wholesale market influx generates 3.2T organic waste
- **Sector 11 Residential Corridor**: 3 incidents, avg priority P1
- **Sector 12 Hospital Buffer**: 2 incidents, avg priority P0 — Hotspot reason: Bio-medical waste accumulation near pediatric wing
- **Railway Depot Zone 2**: 2 incidents, avg priority P2

_Data sources: incidents.top_zones, hotspots.critical_zones_`;
      } else if (lowerQ.includes("analytic") || lowerQ.includes("performance") || lowerQ.includes("sla")) {
        answer = `**Today's Operational Performance:**

- Collections completed: **18**
- Waste collected: **12,400 kg**
- Avg response time: **28 minutes**
- SLA compliance: **91.2%**
- Citizen satisfaction: **87.5%**
- Repeat incident rate: **8.3%**

_Data source: analytics.today_`;
      } else {
        answer = `**System Overview:**

- **14** active incidents (2 P0 emergencies)
- **8/10** vehicles active (80% utilization)
- **18** collections completed today (12,400 kg)
- Avg response: **28 min** | SLA compliance: **91.2%**
- 2 SLA violations | 5 unresolved >4h

_Data sources: incidents.summary, fleet.summary, analytics.today_`;
      }

      setAgentHistory(prev => [...prev, { q: query, a: answer }]);
      setAgentLoading(false);
    }, 800);
  }
}
