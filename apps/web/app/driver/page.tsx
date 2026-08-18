"use client";

import React, { useState, useEffect } from "react";
import {
  Truck,
  Navigation,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Camera,
  MapPin,
  ChevronRight,
  ShieldAlert,
  Fuel,
  Zap,
  Route,
  ShieldCheck,
  ImagePlus,
} from "lucide-react";
import Link from "next/link";

interface DriverTask {
  id: string;
  incidentId: string;
  title: string;
  address: string;
  priority: "P0" | "P1" | "P2" | "P3";
  estimatedKg: number;
  etaMinutes: number;
  status: "PENDING" | "EN_ROUTE" | "ARRIVED" | "COLLECTING" | "EVIDENCE_UPLOADED" | "COMPLETED";
}

export default function DriverPage() {
  const [vehicleStatus, setVehicleStatus] = useState("EN_ROUTE");
  const [currentLoad, setCurrentLoad] = useState(2450);
  const maxCapacity = 5000;
  const [hasRerouteAlert, setHasRerouteAlert] = useState(true);
  const [verificationResult, setVerificationResult] = useState<{
    confidence: number;
    status: string;
    notes: string[];
  } | null>(null);

  const [tasks, setTasks] = useState<DriverTask[]>([
    {
      id: "TSK-P0",
      incidentId: "INC-P0-9912",
      title: "CRITICAL: Bio-hazard Spill near Pediatric Wing (Sector 12)",
      address: "Civil Hospital Red Zone, Sector 12",
      priority: "P0",
      estimatedKg: 650,
      etaMinutes: 4,
      status: "EN_ROUTE",
    },
    {
      id: "TSK-101",
      incidentId: "INC-8091",
      title: "Hazardous mixed waste (Sector 12)",
      address: "Sector 12 Civil Hospital Red Zone",
      priority: "P0",
      estimatedKg: 850,
      etaMinutes: 12,
      status: "PENDING",
    },
    {
      id: "TSK-102",
      incidentId: "INC-8042",
      title: "Plastic packaging pile by Railway Depot",
      address: "Central Bus Depot, Zone 2",
      priority: "P1",
      estimatedKg: 420,
      etaMinutes: 26,
      status: "PENDING",
    },
    {
      id: "TSK-103",
      incidentId: "INC-7994",
      title: "Organic market waste spill",
      address: "Sector 21 Vegetable Yard",
      priority: "P2",
      estimatedKg: 600,
      etaMinutes: 48,
      status: "PENDING",
    },
  ]);

  const activeTask = tasks.find((t) => t.status !== "COMPLETED") || tasks[0];

  const updateTaskStatus = (newStatus: DriverTask["status"]) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === activeTask.id
          ? {
              ...t,
              status: newStatus,
            }
          : t
      )
    );

    if (newStatus === "COMPLETED") {
      setCurrentLoad((prev) => Math.min(maxCapacity, prev + activeTask.estimatedKg));
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadPercentage = Math.round((currentLoad / maxCapacity) * 100);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] p-8 flex items-center justify-center">
        <div className="animate-pulse text-sm text-slate-500 font-medium">Loading Driver Cockpit...</div>
      </div>
    );
  }

  return (
    <div suppressHydrationWarning className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] p-4 sm:p-6 max-w-xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <h1
              className="text-lg font-bold"
              style={{ fontFamily: "var(--font-plus-jakarta, sans-serif)" }}
            >
              Driver Cockpit
            </h1>
            <p className="text-xs text-slate-500 font-mono">GJ-01-WM-4402 · 5T Compactor</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
          <span>Loop C Live Nav</span>
        </div>
      </div>

      {/* Dynamic Re-route Emergency Alert Banner */}
      {hasRerouteAlert && (
        <div className="mb-4 p-3.5 rounded-2xl bg-red-50 border border-red-300 text-xs text-red-950 flex items-start gap-2.5 shadow-sm">
          <ShieldAlert className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">🚨 Dynamic Route Preemption (Loop C)</p>
            <p className="text-[11px] text-red-800 mt-0.5">
              P0 Hospital Emergency inserted at Stop 1. Routine stops deferred. Optimal route updated live.
            </p>
          </div>
          <button
            onClick={() => setHasRerouteAlert(false)}
            className="text-[10px] text-red-700 font-bold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Vehicle Capacity Meter */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm mb-4">
        <div className="flex items-center justify-between text-xs font-bold mb-2">
          <span className="text-slate-600 flex items-center gap-1">
            <Truck className="w-3.5 h-3.5 text-teal-700" /> Bin Load Capacity
          </span>
          <span className={loadPercentage > 85 ? "text-red-700" : "text-slate-900"}>
            {currentLoad.toLocaleString()} / {maxCapacity.toLocaleString()} kg ({loadPercentage}%)
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              loadPercentage > 85 ? "bg-red-600" : "bg-[var(--color-aqua)]"
            }`}
            style={{ width: `${loadPercentage}%` }}
          />
        </div>
      </div>

      {/* Active Assignment Card */}
      {activeTask && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-md mb-6 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
              style={{
                backgroundColor:
                  activeTask.priority === "P0"
                    ? "var(--color-p0-emergency)"
                    : "var(--color-p1-veryhigh)",
              }}
            >
              {activeTask.priority} · Emergency Stop #1
            </span>
            <span className="text-xs font-bold text-teal-800 flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5" /> ETA: {activeTask.etaMinutes} mins
            </span>
          </div>

          <h2 className="text-base font-bold text-slate-900 mb-1">{activeTask.title}</h2>
          <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {activeTask.address}
          </p>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 mb-4 flex items-center justify-between text-xs">
            <span className="text-slate-600">Est. Payload Volume:</span>
            <span className="font-bold text-slate-900">~{activeTask.estimatedKg} kg</span>
          </div>

          {/* Action State Lifecycle */}
          <div className="space-y-2">
            {activeTask.status === "EN_ROUTE" && (
              <button
                onClick={() => updateTaskStatus("ARRIVED")}
                className="w-full py-3 rounded-xl text-white font-bold text-sm bg-teal-700 hover:bg-teal-800 flex items-center justify-center gap-2 shadow cursor-pointer"
              >
                <MapPin className="w-4 h-4" />
                <span>Mark Arrived at Location</span>
              </button>
            )}

            {activeTask.status === "ARRIVED" && (
              <button
                onClick={() => updateTaskStatus("COLLECTING")}
                className="w-full py-3 rounded-xl text-white font-bold text-sm bg-amber-600 hover:bg-amber-700 flex items-center justify-center gap-2 shadow cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                <span>Begin Waste Loading</span>
              </button>
            )}

            {activeTask.status === "COLLECTING" && (
              <button
                onClick={() => {
                  // Simulate evidence upload + AI verification
                  updateTaskStatus("EVIDENCE_UPLOADED");
                  setTimeout(() => {
                    setVerificationResult({
                      confidence: 93.2,
                      status: "VERIFIED",
                      notes: [
                        "Analyzed 1 before image(s) and 2 after image(s)",
                        "Structural comparison: 93.2% area clearance detected",
                        "Waste accumulation no longer visible at reported coordinates",
                        "High-confidence clearance — minimal residual detected",
                      ],
                    });
                  }, 600);
                }}
                className="w-full py-3 rounded-xl text-white font-bold text-sm bg-emerald-700 hover:bg-emerald-800 flex items-center justify-center gap-2 shadow cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Upload After-Evidence Photos</span>
              </button>
            )}

            {activeTask.status === "EVIDENCE_UPLOADED" && verificationResult && (
              <div className="space-y-3">
                {/* AI Verification Result Card */}
                <div className={`p-4 rounded-xl border ${
                  verificationResult.status === "VERIFIED"
                    ? "bg-emerald-50 border-emerald-300"
                    : "bg-amber-50 border-amber-300"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className={`w-4 h-4 ${
                        verificationResult.status === "VERIFIED" ? "text-emerald-700" : "text-amber-700"
                      }`} />
                      <span className="text-xs font-bold">
                        AI Visual Clearance: {verificationResult.confidence}%
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                      verificationResult.status === "VERIFIED" ? "bg-emerald-700" : "bg-amber-700"
                    }`}>
                      {verificationResult.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {verificationResult.notes.map((note, ni) => (
                      <p key={ni} className="text-[11px] text-slate-600">• {note}</p>
                    ))}
                  </div>
                </div>

                {/* Confirm completion */}
                <button
                  onClick={() => updateTaskStatus("COMPLETED")}
                  className="w-full py-3 rounded-xl text-white font-bold text-sm bg-[var(--color-primary)] hover:opacity-90 flex items-center justify-center gap-2 shadow cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Confirm Collection Complete</span>
                </button>
              </div>
            )}

            {activeTask.status === "COMPLETED" && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold text-center flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                <span>Collection Completed & AI Verified (93.2% Clearance)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Sequence List */}
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1 flex items-center justify-between">
        <span>Optimized Stop Sequence ({tasks.length})</span>
        <span className="text-[10px] text-teal-800 font-bold flex items-center gap-1">
          <Route className="w-3 h-3" /> TSP Optimized
        </span>
      </h3>
      <div className="space-y-2.5">
        {tasks.map((task, i) => (
          <div
            key={`${task.id}-${i}`}
            className={`p-4 rounded-xl border bg-white flex items-center justify-between transition-shadow ${
              task.status === "COMPLETED" ? "opacity-60 border-slate-100" : "border-slate-200 shadow-sm"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                  task.priority === "P0"
                    ? "bg-red-100 text-red-800"
                    : task.status === "COMPLETED"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {i + 1}
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{task.title}</h4>
                <p className="text-[11px] text-slate-500">~{task.estimatedKg} kg · ETA {task.etaMinutes}m</p>
              </div>
            </div>

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                task.priority === "P0"
                  ? "bg-red-100 text-red-800"
                  : task.status === "COMPLETED"
                  ? "bg-emerald-100 text-emerald-800"
                  : task.status === "EN_ROUTE"
                  ? "bg-teal-100 text-teal-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {task.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
