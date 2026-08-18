"use client";

import React, { useState, useEffect } from "react";
import {
  Camera,
  UploadCloud,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  Send,
  Sparkles,
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Eye,
  Layers,
} from "lucide-react";
import Link from "next/link";

interface CitizenReport {
  id: string;
  category: string;
  description: string;
  address: string;
  status: "REPORTED" | "ASSIGNED" | "COLLECTING" | "COLLECTED" | "VERIFIED" | "REOPENED";
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  createdAt: string;
  imageCount: number;
}

interface CVAnalysis {
  category: string;
  confidence: number;
  volumeM3: number;
  severityScore: number;
  tags: string[];
  recommendedAction: string;
}

export default function CitizenPage() {
  const [activeTab, setActiveTab] = useState<"report" | "history">("report");
  const [images, setImages] = useState<string[]>([]);
  const [category, setCategory] = useState("mixed");
  const [description, setDescription] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>({
    lat: 23.0330,
    lng: 72.5860,
  });
  const [address, setAddress] = useState("Sector 12 Civil Hospital Red Zone, Gandhinagar");
  const [isLocating, setIsLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<CVAnalysis | null>(null);
  const [submittedReport, setSubmittedReport] = useState<CitizenReport | null>(null);
  const [resolutionFeedback, setResolutionFeedback] = useState<Record<string, { response: string; count: number }>>({});

  // Mock list of initial citizen reports for testing
  const [reportsList, setReportsList] = useState<CitizenReport[]>([
    {
      id: "REP-9482",
      category: "Mixed Municipal Waste",
      description: "Overflowing community bin spreading near market square.",
      address: "Sector 11 Market, Gandhinagar",
      status: "COLLECTED",
      priority: "P1",
      createdAt: "2 hours ago",
      imageCount: 2,
    },
    {
      id: "REP-9380",
      category: "Organic / Food Waste",
      description: "Decomposing vegetable waste at Sector 21 wholesale market.",
      address: "APMC Yard, Sector 21",
      status: "COLLECTING",
      priority: "P0",
      createdAt: "3 hours ago",
      imageCount: 3,
    },
    {
      id: "REP-9104",
      category: "Plastic & Packaging",
      description: "Discarded plastic packaging pile behind bus terminal.",
      address: "Central Bus Depot, Zone 2",
      status: "VERIFIED",
      priority: "P3",
      createdAt: "Yesterday",
      imageCount: 1,
    },
  ]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      const newUrls = newFiles.map((file) => URL.createObjectURL(file));
      setImages((prev) => [...prev, ...newUrls].slice(0, 5));

      // Trigger instant Computer Vision Analysis Simulation
      setAnalyzingImage(true);
      setTimeout(() => {
        setAiAnalysis({
          category: category === "plastic" ? "Plastic Packaging" : "Mixed Municipal Solid Waste",
          confidence: 0.94,
          volumeM3: 2.8,
          severityScore: 7.6,
          tags: ["overflow_bin", "plastic_wrappers", "street_spill"],
          recommendedAction: "Dispatch 5-Tonne Compactor (High Accumulation Rate)",
        });
        setAnalyzingImage(false);
      }, 600);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) setAiAnalysis(null);
      return updated;
    });
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
          });
          setAddress(`GPS: ${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E`);
          setIsLocating(false);
        },
        () => {
          setCoords({ lat: 23.0225, lng: 72.5714 });
          setIsLocating(false);
        }
      );
    } else {
      setIsLocating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    setTimeout(() => {
      const newReport: CitizenReport = {
        id: `REP-${Math.floor(1000 + Math.random() * 9000)}`,
        category: category.toUpperCase(),
        description: description || "No description provided.",
        address: address,
        status: "REPORTED",
        priority: aiAnalysis?.severityScore && aiAnalysis.severityScore > 7.0 ? "P1" : "P2",
        createdAt: "Just now",
        imageCount: images.length,
      };

      setReportsList([newReport, ...reportsList]);
      setSubmittedReport(newReport);
      setSubmitting(false);
      setImages([]);
      setDescription("");
      setAiAnalysis(null);
    }, 800);
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[var(--color-canvas)] p-8 flex items-center justify-center">
        <div className="animate-pulse text-sm text-slate-500 font-medium">Loading Citizen Portal...</div>
      </div>
    );
  }

  return (
    <div suppressHydrationWarning className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] p-4 sm:p-6 md:p-8">
      <div suppressHydrationWarning className="max-w-4xl mx-auto">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: "var(--color-primary)" }}
                />
                <h1
                  className="text-xl font-bold"
                  style={{ fontFamily: "var(--font-plus-jakarta, sans-serif)" }}
                >
                  Citizen Service Portal
                </h1>
              </div>
              <p className="text-xs text-slate-500">
                WasteWise AI · Automated Vision Triage Active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm text-xs font-semibold">
              <button
                onClick={() => {
                  setActiveTab("report");
                  setSubmittedReport(null);
                }}
                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === "report"
                    ? "bg-[var(--color-primary)] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Report Waste
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`px-4 py-2 rounded-lg transition-all cursor-pointer ${
                  activeTab === "history"
                    ? "bg-[var(--color-primary)] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                My Reports ({reportsList.length})
              </button>
            </div>
          </div>
        </div>

        {/* Tab 1: New Report Form */}
        {activeTab === "report" && (
          <div>
            {submittedReport ? (
              <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-4 border border-emerald-200">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Report Successfully Dispatched!</h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
                  Ticket <span className="font-bold text-slate-900">{submittedReport.id}</span> is now
                  queued in the Municipal Incident Engine. The Computer Vision model assigned initial priority{" "}
                  <span className="font-bold text-amber-700">{submittedReport.priority}</span>.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setSubmittedReport(null)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 hover:bg-slate-50 cursor-pointer"
                  >
                    Submit Another Report
                  </button>
                  <button
                    onClick={() => setActiveTab("history")}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-primary)] shadow-sm hover:opacity-95 cursor-pointer"
                  >
                    Track Resolution
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Photo Dropzone with CV Analysis Card */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold">1. Photo Evidence</h3>
                      <p className="text-xs text-slate-500">
                        Upload up to 5 photos. AI CV automatically analyzes volume and waste type.
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 bg-amber-50 text-amber-800 rounded-md border border-amber-200 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-600" /> Real-time CV Pipeline
                    </span>
                  </div>

                  {/* Thumbnail Previews */}
                  {images.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
                      {images.map((url, i) => (
                        <div
                          key={i}
                          className="relative group rounded-xl overflow-hidden aspect-square border border-slate-200 bg-slate-50"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Uploaded evidence"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(i)}
                            className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-full opacity-90 hover:opacity-100 shadow"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Vision Live Feedback Card */}
                  {analyzingImage && (
                    <div className="mb-4 p-4 rounded-xl bg-teal-50 border border-teal-200 flex items-center gap-3 text-xs text-teal-800 font-semibold animate-pulse">
                      <Sparkles className="w-4 h-4 text-teal-700 animate-spin" />
                      <span>WasteWise CV Engine: Analyzing waste volume, hazard index, and classification...</span>
                    </div>
                  )}

                  {aiAnalysis && (
                    <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
                      <div className="flex items-center justify-between font-bold mb-2 pb-1.5 border-b border-emerald-200/60">
                        <span className="flex items-center gap-1.5 text-emerald-800">
                          <Eye className="w-4 h-4 text-emerald-700" /> AI Computer Vision Breakdown
                        </span>
                        <span className="bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full text-[10px]">
                          {(aiAnalysis.confidence * 100).toFixed(0)}% Confidence
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div>
                          <span className="text-emerald-700 block text-[10px]">Detected Category</span>
                          <span className="font-bold">{aiAnalysis.category}</span>
                        </div>
                        <div>
                          <span className="text-emerald-700 block text-[10px]">Estimated Volume</span>
                          <span className="font-bold">{aiAnalysis.volumeM3} m³</span>
                        </div>
                        <div>
                          <span className="text-emerald-700 block text-[10px]">Severity Rating</span>
                          <span className="font-bold text-amber-800">{aiAnalysis.severityScore} / 10.0</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-emerald-800 font-medium">
                        Action: {aiAnalysis.recommendedAction}
                      </div>
                    </div>
                  )}

                  <label className="border-2 border-dashed border-slate-300 hover:border-[var(--color-primary)] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#FAF8F5]">
                    <UploadCloud className="w-8 h-8 text-[var(--color-primary)] mb-2" />
                    <span className="text-xs font-semibold text-slate-700">
                      Click or drag photos to upload
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1">
                      JPEG, PNG, WebP (Max 10MB per file · EXIF stripped server-side)
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Location Picker */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold">2. Incident Location</h3>
                      <p className="text-xs text-slate-500">
                        GPS pin links the report to the nearest municipal collection zone.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={isLocating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)] hover:opacity-90 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{isLocating ? "Acquiring GPS..." : "Use Live GPS"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-700">
                        Landmark / Street Address
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="e.g. Opposite Sector 11 Community Center"
                        className="w-full px-3.5 py-2.5 rounded-lg text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-[#FAF8F5]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-slate-700">
                        Coordinates (Lat, Lng)
                      </label>
                      <div className="px-3.5 py-2.5 rounded-lg text-sm border border-slate-200 bg-slate-50 text-slate-600 font-mono">
                        {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "No GPS acquired"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category & Details */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold mb-3">3. Category & Description</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-4">
                    {[
                      { id: "mixed", label: "Mixed Waste", icon: "🗑️" },
                      { id: "plastic", label: "Plastic / Bottling", icon: "🧴" },
                      { id: "organic", label: "Organic / Food", icon: "🥬" },
                      { id: "construction", label: "Construction Debris", icon: "🧱" },
                      { id: "e_waste", label: "E-Waste", icon: "🔋" },
                      { id: "hazardous", label: "Hazardous / Medical", icon: "⚠️" },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                          category === cat.id
                            ? "border-[var(--color-primary)] bg-[var(--color-primary-tint)] text-[var(--color-primary-strong)] ring-1 ring-[var(--color-primary)]"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <span className="text-base">{cat.icon}</span>
                        <span>{cat.label}</span>
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-slate-700">
                      Additional Context / Remarks
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the accumulation rate, nearby hazards (hospitals, schools), or access blockages..."
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-700 bg-[#FAF8F5]"
                    />
                  </div>
                </div>

                {/* Submit CTA */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 px-6 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.99] shadow-md hover:opacity-95 cursor-pointer"
                  style={{ backgroundColor: "var(--color-primary)" }}
                >
                  {submitting ? (
                    <span>Submitting Incident...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Waste Incident</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Tab 2: My Reports History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {reportsList.map((report, idx) => (
              <div
                key={`${report.id}-${idx}`}
                className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {report.id}
                      </span>
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
                        style={{
                          backgroundColor:
                            report.priority === "P0"
                              ? "var(--color-p0-emergency)"
                              : report.priority === "P1"
                              ? "var(--color-p1-veryhigh)"
                              : "var(--color-p3-normal)",
                        }}
                      >
                        {report.priority}
                      </span>
                    </div>
                    <h3 className="text-base font-bold">{report.category}</h3>
                  </div>

                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {report.createdAt}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mb-3">{report.description}</p>
                <p className="text-xs font-medium text-slate-500 mb-4 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {report.address}
                </p>

                {/* Progress Steps */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Status:</span>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md ${
                        report.status === "VERIFIED"
                          ? "bg-emerald-100 text-emerald-800"
                          : report.status === "COLLECTING"
                          ? "bg-teal-100 text-teal-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {report.status}
                    </span>
                  </div>

                  {(report.status === "COLLECTED" || report.status === "VERIFIED") && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      {resolutionFeedback[report.id] ? (
                        <div className={`p-2.5 rounded-lg text-xs font-bold text-center ${
                          resolutionFeedback[report.id].response === "reopened"
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : resolutionFeedback[report.id].response === "yes"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : resolutionFeedback[report.id].response === "partial"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}>
                          {resolutionFeedback[report.id].response === "reopened"
                            ? "⚠️ Incident REOPENED with bumped priority due to unresolved feedback"
                            : resolutionFeedback[report.id].response === "yes"
                            ? "✅ Thank you! Resolution confirmed. Incident CLOSED."
                            : resolutionFeedback[report.id].response === "partial"
                            ? "Partial resolution noted. Follow-up collection scheduled."
                            : `Feedback recorded (${resolutionFeedback[report.id].count}/2 rejections). Submit again to escalate.`}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 font-medium">Was this waste actually cleared?</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleResolution(report.id, "yes")}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs hover:bg-emerald-100 cursor-pointer"
                            >
                              ✓ Yes
                            </button>
                            <button
                              onClick={() => handleResolution(report.id, "partial")}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs hover:bg-amber-100 cursor-pointer"
                            >
                              Partial
                            </button>
                            <button
                              onClick={() => handleResolution(report.id, "no")}
                              className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 font-bold text-xs hover:bg-red-100 cursor-pointer"
                            >
                              ✗ No
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  function handleResolution(reportId: string, response: "yes" | "no" | "partial") {
    const prev = resolutionFeedback[reportId];
    const noCount = (prev?.response === "no" ? prev.count : 0) + (response === "no" ? 1 : 0);

    if (response === "yes") {
      setResolutionFeedback(f => ({ ...f, [reportId]: { response: "yes", count: 0 } }));
      setReportsList(r => r.map(rep => rep.id === reportId ? { ...rep, status: "VERIFIED" as const } : rep));
    } else if (response === "partial") {
      setResolutionFeedback(f => ({ ...f, [reportId]: { response: "partial", count: 0 } }));
    } else if (noCount >= 2) {
      // Reopen with bumped priority
      setResolutionFeedback(f => ({ ...f, [reportId]: { response: "reopened", count: noCount } }));
      setReportsList(r => r.map(rep => rep.id === reportId ? { ...rep, status: "REOPENED" as const, priority: "P0" as const } : rep));
    } else {
      setResolutionFeedback(f => ({ ...f, [reportId]: { response: "no", count: noCount } }));
    }
  }
}
