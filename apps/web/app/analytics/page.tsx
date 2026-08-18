"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Leaf,
  Fuel,
  BarChart3,
  Activity,
  Clock,
  CheckCircle2,
  Users,
  Truck,
  AlertTriangle,
  TreePine,
  Globe,
  ChevronRight,
  Recycle,
  Zap,
  ShieldCheck,
  Award,
} from "lucide-react";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<"operational" | "environmental">("operational");

  // Operational KPIs
  const kpis = {
    collectionsCompleted: 18,
    wasteCollectedKg: 12400,
    avgResponseMinutes: 28,
    slaCompliancePct: 91.2,
    citizenSatisfactionPct: 87.5,
    repeatIncidentRatePct: 8.3,
    activeIncidents: 14,
    resolvedToday: 12,
    fleetUtilizationPct: 80.0,
    routeEfficiencyPct: 82.4,
  };

  // Environmental impact
  const env = {
    fuelSavedLiters: 142.8,
    co2AvoidedKg: 382.7,
    distanceReducedKm: 89.4,
    wasteDivertedKg: 4200,
    routeEfficiencyPct: 23.1,
    treesEquivalent: 17.6,
  };

  // Weekly trend data for inline mini charts
  const weeklyCollections = [14, 16, 19, 15, 18, 22, 18];
  const weeklyResponse = [34, 31, 29, 32, 28, 26, 28];
  const weeklySLA = [85.0, 87.2, 89.5, 86.8, 90.1, 93.4, 91.2];
  const weeklyWaste = [8200, 9400, 11800, 9100, 10600, 14200, 12400];
  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Zone breakdown
  const zones = [
    { zone: "Sector 21 APMC Market", incidents: 4, wasteKg: 3200, priority: "P1", status: "Active" },
    { zone: "Sector 12 Hospital", incidents: 2, wasteKg: 1800, priority: "P0", status: "Critical" },
    { zone: "Sector 11 Residential", incidents: 3, wasteKg: 2100, priority: "P1", status: "Active" },
    { zone: "Railway Depot Zone 2", incidents: 2, wasteKg: 1400, priority: "P2", status: "Active" },
    { zone: "Sector 3 Industrial", incidents: 2, wasteKg: 3300, priority: "P2", status: "Active" },
    { zone: "Sector 7 School Cluster", incidents: 1, wasteKg: 600, priority: "P3", status: "Monitored" },
  ];

  const priorityDist = { P0: 2, P1: 3, P2: 4, P3: 3, P4: 2 };
  const totalIncidents = Object.values(priorityDist).reduce((s, v) => s + v, 0);

  const priorityColors: Record<string, string> = {
    P0: "#C1272D", P1: "#E86A33", P2: "#E3A62F", P3: "#2B8C86", P4: "#1F5E3F",
  };

  // Simple inline sparkline component
  function Sparkline({ data, color = "#1F5E3F", height = 32 }: { data: number[]; color?: string; height?: number }) {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const w = 100;
    const points = data
      .map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4)}`)
      .join(" ");
    return (
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
    );
  }

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] p-8 flex items-center justify-center">
        <div className="animate-pulse text-sm text-slate-500 font-medium">Loading Analytics Dashboard...</div>
      </div>
    );
  }

  return (
    <div suppressHydrationWarning className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            href="/officer"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[var(--color-primary)]" />
              <h1 className="text-xl md:text-2xl font-bold" style={{ fontFamily: "var(--font-plus-jakarta, sans-serif)" }}>
                Analytics & Impact Dashboard
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              Real-time operational KPIs, environmental impact, and SDG alignment metrics
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
          <button
            onClick={() => setActiveTab("operational")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === "operational"
                ? "bg-[var(--color-primary)] text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Activity className="w-3.5 h-3.5 inline mr-1" /> Operational
          </button>
          <button
            onClick={() => setActiveTab("environmental")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === "environmental"
                ? "bg-emerald-700 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Leaf className="w-3.5 h-3.5 inline mr-1" /> Environmental Impact
          </button>
        </div>
      </div>

      {/* =============== OPERATIONAL TAB =============== */}
      {activeTab === "operational" && (
        <>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {[
              { label: "Collections Today", value: kpis.collectionsCompleted, suffix: "", icon: CheckCircle2, color: "text-emerald-700", trend: weeklyCollections },
              { label: "Waste Collected", value: `${(kpis.wasteCollectedKg / 1000).toFixed(1)}T`, suffix: "", icon: Recycle, color: "text-[var(--color-primary)]", trend: weeklyWaste },
              { label: "Avg Response", value: kpis.avgResponseMinutes, suffix: " min", icon: Clock, color: "text-teal-700", trend: weeklyResponse, inverted: true },
              { label: "SLA Compliance", value: kpis.slaCompliancePct, suffix: "%", icon: ShieldCheck, color: "text-emerald-700", trend: weeklySLA },
              { label: "Citizen Satisfaction", value: kpis.citizenSatisfactionPct, suffix: "%", icon: Users, color: "text-[var(--color-aqua)]" },
            ].map((kpi, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm"
                style={{ borderRadius: "var(--radius-card)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <p className={`text-2xl font-extrabold ${kpi.color}`}>
                  {kpi.value}{kpi.suffix}
                </p>
                {kpi.trend && (
                  <div className="mt-2">
                    <Sparkline data={kpi.trend} color={kpi.color.includes("emerald") ? "#047857" : "#1F5E3F"} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Second Row: Fleet & Incident Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Active Incidents</p>
              <p className="text-3xl font-extrabold text-red-700">{kpis.activeIncidents}</p>
              <p className="text-[10px] text-slate-400 mt-1">{kpis.resolvedToday} resolved today</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fleet Utilization</p>
              <p className="text-3xl font-extrabold text-[var(--color-aqua)]">{kpis.fleetUtilizationPct}%</p>
              <p className="text-[10px] text-slate-400 mt-1">8 / 10 vehicles active</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Route Efficiency</p>
              <p className="text-3xl font-extrabold text-[var(--color-primary)]">{kpis.routeEfficiencyPct}%</p>
              <p className="text-[10px] text-slate-400 mt-1">14.2 km saved today</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Repeat Incidents</p>
              <p className="text-3xl font-extrabold text-amber-700">{kpis.repeatIncidentRatePct}%</p>
              <p className="text-[10px] text-slate-400 mt-1">↓ 2.1% from last week</p>
            </div>
          </div>

          {/* Priority Distribution + Zone Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Priority Distribution */}
            <div className="lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold mb-4">Priority Distribution</h2>
              <div className="space-y-3">
                {Object.entries(priorityDist).map(([p, count]) => {
                  const pct = (count / totalIncidents) * 100;
                  return (
                    <div key={p}>
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: priorityColors[p] }}
                          />
                          {p} {p === "P0" ? "Emergency" : p === "P1" ? "Very High" : p === "P2" ? "High" : p === "P3" ? "Normal" : "Low"}
                        </span>
                        <span className="text-slate-600">{count} ({Math.round(pct)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: priorityColors[p] }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Zone Breakdown Table */}
            <div className="lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold mb-4">Zone Performance Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2.5 px-2 font-bold text-slate-500 uppercase tracking-wider">Zone</th>
                      <th className="text-center py-2.5 px-2 font-bold text-slate-500 uppercase tracking-wider">Incidents</th>
                      <th className="text-center py-2.5 px-2 font-bold text-slate-500 uppercase tracking-wider">Waste (kg)</th>
                      <th className="text-center py-2.5 px-2 font-bold text-slate-500 uppercase tracking-wider">Priority</th>
                      <th className="text-center py-2.5 px-2 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zones.map((z, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-2 font-semibold text-slate-800">{z.zone}</td>
                        <td className="py-3 px-2 text-center font-bold">{z.incidents}</td>
                        <td className="py-3 px-2 text-center font-medium text-slate-600">{z.wasteKg.toLocaleString()}</td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: priorityColors[z.priority] }}
                          >
                            {z.priority}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              z.status === "Critical"
                                ? "bg-red-50 text-red-800 border-red-200"
                                : z.status === "Active"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            }`}
                          >
                            {z.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* =============== ENVIRONMENTAL TAB =============== */}
      {activeTab === "environmental" && (
        <>
          {/* SDG Alignment Banner */}
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
            <Globe className="w-6 h-6 text-emerald-700 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-900">United Nations Sustainable Development Goals Alignment</p>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {["SDG 11 — Sustainable Cities", "SDG 12 — Responsible Consumption", "SDG 13 — Climate Action"].map((sdg) => (
                  <span key={sdg} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                    {sdg}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Environmental KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: "Fuel Saved", value: `${env.fuelSavedLiters}L`, icon: Fuel, color: "text-amber-700", bg: "bg-amber-50" },
              { label: "CO₂ Avoided", value: `${env.co2AvoidedKg} kg`, icon: Leaf, color: "text-emerald-700", bg: "bg-emerald-50" },
              { label: "Distance Reduced", value: `${env.distanceReducedKm} km`, icon: TrendingUp, color: "text-[var(--color-primary)]", bg: "bg-[#EDF5F0]" },
              { label: "Waste Diverted", value: `${(env.wasteDivertedKg / 1000).toFixed(1)}T`, icon: Recycle, color: "text-teal-700", bg: "bg-teal-50" },
              { label: "Route Efficiency", value: `+${env.routeEfficiencyPct}%`, icon: Zap, color: "text-[var(--color-accent)]", bg: "bg-orange-50" },
              { label: "Trees Equivalent", value: `${env.treesEquivalent}`, icon: TreePine, color: "text-emerald-700", bg: "bg-emerald-50" },
            ].map((kpi, i) => (
              <div
                key={i}
                className={`rounded-2xl p-4 border border-slate-200 shadow-sm ${kpi.bg}`}
                style={{ borderRadius: "var(--radius-card)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{kpi.label}</p>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <p className={`text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Impact Visualization */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* CO₂ Reduction Breakdown */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-700" /> Carbon Reduction Breakdown
              </h2>
              <div className="space-y-4">
                {[
                  { source: "Route Optimization", saved: 186.4, pct: 48.7 },
                  { source: "Fleet Right-sizing", saved: 89.2, pct: 23.3 },
                  { source: "Predictive Pre-dispatch", saved: 62.8, pct: 16.4 },
                  { source: "Dynamic Re-routing (Loop C)", saved: 44.3, pct: 11.6 },
                ].map((item, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="text-slate-700">{item.source}</span>
                      <span className="text-emerald-700">{item.saved} kg CO₂ ({item.pct}%)</span>
                    </div>
                    <div className="w-full bg-emerald-100 rounded-full h-2.5">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-all"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                <span className="text-slate-600">Total CO₂ Avoided</span>
                <span className="text-emerald-700 text-lg">{env.co2AvoidedKg} kg</span>
              </div>
            </div>

            {/* Efficiency Gains */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-[var(--color-accent)]" /> Efficiency Gains Summary
              </h2>
              <div className="space-y-4">
                {[
                  { metric: "Fuel Consumption", before: "621.2 L", after: "478.4 L", improvement: "23.0%", direction: "down" },
                  { metric: "Total Route Distance", before: "476.8 km", after: "387.4 km", improvement: "18.7%", direction: "down" },
                  { metric: "Response Time (avg)", before: "52 min", after: "28 min", improvement: "46.2%", direction: "down" },
                  { metric: "SLA Compliance", before: "72.4%", after: "91.2%", improvement: "26.0%", direction: "up" },
                  { metric: "Citizen Satisfaction", before: "61.0%", after: "87.5%", improvement: "43.4%", direction: "up" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-2.5 border-b border-slate-50 last:border-0">
                    <span className="font-semibold text-slate-700 w-1/3">{item.metric}</span>
                    <span className="text-slate-400 line-through w-1/6 text-center">{item.before}</span>
                    <span className="font-bold text-[var(--color-primary)] w-1/6 text-center">{item.after}</span>
                    <span
                      className={`font-bold w-1/6 text-right ${
                        item.direction === "down" ? "text-emerald-700" : "text-emerald-700"
                      }`}
                    >
                      {item.direction === "down" ? "↓" : "↑"} {item.improvement}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
