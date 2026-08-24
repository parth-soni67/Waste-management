"use client";

import React, { useState, useEffect, useRef } from "react";
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
  X,
  User,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

interface CitizenReport {
  id: string;
  incidentId?: string;
  category: string;
  description: string;
  address: string;
  status: "REPORTED" | "ASSIGNED" | "COLLECTING" | "COLLECTED" | "VERIFIED" | "REOPENED";
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  severityScore?: number;
  confidence?: number;
  volumeM3?: number;
  createdAt: string;
  imageCount: number;
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

interface CVAnalysis {
  category: string;
  confidence: number;
  volumeM3: number;
  severityScore: number;
  tags: string[];
  recommendedAction: string;
  isFallback: boolean;
  providerUsed?: string;
  imageUrl?: string;
  storagePath?: string;
}

export default function CitizenPage() {
  const { user, logout, getAuthHeaders } = useAuth();
  const [activeTab, setActiveTab] = useState<"report" | "history">("report");
  const [images, setImages] = useState<string[]>([]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
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
  const [analysisStatusText, setAnalysisStatusText] = useState<string>("");
  const [aiAnalysis, setAiAnalysis] = useState<CVAnalysis | null>(null);
  const [submittedReport, setSubmittedReport] = useState<CitizenReport | null>(null);
  const [resolutionFeedback, setResolutionFeedback] = useState<Record<string, { response: string; count: number }>>({});

  // Real citizen reports list (isolated per authenticated user from backend)
  const [reportsList, setReportsList] = useState<CitizenReport[]>([]);

  const formatRelativeTime = (dateString?: string): string => {
    if (!dateString) return "Just now";
    const date = new Date(dateString);
    const now = Date.now();
    const elapsedMs = Math.max(0, now - date.getTime());
    const elapsedSecs = Math.floor(elapsedMs / 1000);
    const elapsedMins = Math.floor(elapsedSecs / 60);
    const elapsedHours = Math.floor(elapsedMins / 60);
    const elapsedDays = Math.floor(elapsedHours / 24);

    if (elapsedSecs < 45) return "Just now";
    if (elapsedMins < 60) return `${elapsedMins}m ago`;
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
    return `${elapsedDays}d ago`;
  };

  // --- Live Camera & File Upload Logic ---
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Could not access the camera. Please ensure camera permissions or use the file upload option.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setIsCameraActive(false);
  };

  const executeClientFallback = (hintCat?: string) => {
    const catMap: Record<string, { label: string; tags: string[]; volume: number; severity: number; action: string }> = {
      plastic: {
        label: "PLASTIC",
        tags: ["pet_bottles", "packaging_wrappers", "polybags"],
        volume: 1.4,
        severity: 4.8,
        action: "Deploy Dry Recyclables Collection Crew",
      },
      organic: {
        label: "ORGANIC",
        tags: ["vegetable_peels", "food_scraps", "spoiled_produce"],
        volume: 2.1,
        severity: 6.2,
        action: "Deploy Organic Waste Collection Crew (Within 4 Hours)",
      },
      construction: {
        label: "CONSTRUCTION",
        tags: ["concrete_rubble", "broken_bricks", "sand_pile"],
        volume: 3.5,
        severity: 6.0,
        action: "Deploy Tipper Truck with Front Loader",
      },
      e_waste: {
        label: "E_WASTE",
        tags: ["discarded_pcbs", "broken_appliances", "insulated_cables"],
        volume: 0.8,
        severity: 5.5,
        action: "Route to E-Waste Segregation & Recovery Facility",
      },
      hazardous: {
        label: "HAZARDOUS",
        tags: ["chemical_containers", "medical_blisters", "aerosol_cans"],
        volume: 0.5,
        severity: 8.8,
        action: "Immediate HazMat Dispatch: Alert Environmental Officer",
      },
      mixed: {
        label: "MIXED",
        tags: ["unsegregated_pile", "household_litter", "packaging_debris"],
        volume: 1.6,
        severity: 5.2,
        action: "Add Stop to Routine Scheduled Collection Route",
      },
    };
    const def = catMap[hintCat?.toLowerCase() || "mixed"] || catMap.mixed;
    setAiAnalysis({
      category: def.label,
      confidence: 0.72,
      volumeM3: def.volume,
      severityScore: def.severity,
      tags: def.tags,
      recommendedAction: def.action,
      isFallback: true,
      providerUsed: "fallback",
    });
  };

  const analyzePhotoBlob = async (blob: Blob, hintCat?: string) => {
    // Reset previous AI analysis to ensure fresh response per image
    setAiAnalysis(null);
    setAnalyzingImage(true);
    setAnalysisStatusText("Uploading image to WasteWise AI...");

    const formData = new FormData();
    formData.append("file", blob, "citizen_waste_evidence.jpg");
    if (hintCat) {
      formData.append("hint_category", hintCat);
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    try {
      setAnalysisStatusText("AI Vision Engine: Analyzing waste volume, hazard index, and classification...");
      const res = await fetch(`${apiUrl}/api/v1/ai/analyze-image-file`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setAiAnalysis({
          category: data.category ? data.category.toUpperCase() : "MIXED",
          confidence: Number(data.confidence ?? 0.85),
          volumeM3: Number(data.estimated_volume_m3 ?? 1.5),
          severityScore: Number(data.severity_score ?? 5.0),
          tags: Array.isArray(data.detected_tags) ? data.detected_tags : [],
          recommendedAction: data.recommended_action || "Deploy municipal collection vehicle",
          isFallback: Boolean(data.is_fallback),
          providerUsed: data.provider_used || (data.is_fallback ? "fallback" : "gemini"),
          imageUrl: data.image_url,
          storagePath: data.storage_path,
        });
        if (data.image_url) {
          setUploadedImageUrls((prev) => [...prev, data.image_url]);
        }
      } else {
        console.warn("Backend AI returned non-200 status, engaging heuristic fallback", res.status);
        executeClientFallback(hintCat);
      }
    } catch (err) {
      console.warn("Network error contacting AI endpoint, engaging client heuristic fallback", err);
      executeClientFallback(hintCat);
    } finally {
      setAnalyzingImage(false);
      setAnalysisStatusText("");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setImages(prev => [...prev, dataUrl].slice(0, 5));
        
        stopCamera();
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              analyzePhotoBlob(blob, category);
            }
          },
          "image/jpeg",
          0.85
        );
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImages(prev => [...prev, reader.result as string].slice(0, 5));
      }
    };
    reader.readAsDataURL(file);

    analyzePhotoBlob(file, category);
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) setAiAnalysis(null);
      return updated;
    });
    setUploadedImageUrls((prev) => prev.filter((_, i) => i !== index));
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

  // Fetch citizen reports from Supabase backend on load
  useEffect(() => {
    const fetchPersistedReports = async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      try {
        const res = await fetch(`${apiUrl}/api/v1/reports`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const data: BackendReportItem[] = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const mapped: CitizenReport[] = data.map((r: BackendReportItem) => ({
              id: `REP-${String(r.id).slice(0, 8).toUpperCase()}`,
              incidentId: r.incident_id ? `WW-${String(r.incident_id).slice(0, 8).toUpperCase()}` : undefined,
              category: r.category ? r.category.toUpperCase() : "MIXED",
              description: r.description || "Citizen reported waste accumulation.",
              address: r.address_text || `GPS: ${r.latitude?.toFixed(4) || "23.0330"}°N, ${r.longitude?.toFixed(4) || "72.5860"}°E`,
              status: (r.status as CitizenReport["status"]) || "REPORTED",
              priority: r.priority || "P3",
              severityScore: r.severity_score,
              confidence: r.confidence,
              volumeM3: r.estimated_volume_m3,
              createdAt: formatRelativeTime(r.created_at),
              imageCount: Array.isArray(r.image_urls) ? r.image_urls.length : 0,
            }));
            setReportsList(mapped);
          }
        }
      } catch (err) {
        console.warn("Backend reports fetch failed, using local fallback", err);
      }
    };
    const timer = setTimeout(() => {
      void fetchPersistedReports();
    }, 0);
    return () => clearTimeout(timer);
  }, [getAuthHeaders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const finalImageUrls: string[] = [];
    if (uploadedImageUrls.length > 0) {
      finalImageUrls.push(...uploadedImageUrls);
    } else if (aiAnalysis?.imageUrl) {
      finalImageUrls.push(aiAnalysis.imageUrl);
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const reportPayload = {
      category: (aiAnalysis?.category || category).toLowerCase().replace(/\s+/g, '_').split('/')[0].trim(),
      confidence: aiAnalysis?.confidence ?? 0.90,
      estimated_volume_m3: aiAnalysis?.volumeM3 ?? 1.5,
      severity_score: aiAnalysis?.severityScore ?? 5.0,
      detected_tags: aiAnalysis?.tags || [],
      recommended_action: aiAnalysis?.recommendedAction || "Deploy municipal collection vehicle",
      description: description || "Citizen reported waste accumulation.",
      image_urls: finalImageUrls,
      latitude: coords?.lat ?? 23.0330,
      longitude: coords?.lng ?? 72.5860,
      address_text: address,
    };

    try {
      const res = await fetch(`${apiUrl}/api/v1/reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(reportPayload),
      });

      if (res.ok) {
        const persistedData = await res.json();
        const generatedReportId = `REP-${String(persistedData.id).slice(0, 8).toUpperCase()}`;
        const generatedIncidentId = persistedData.incident_id
          ? `WW-${String(persistedData.incident_id).slice(0, 8).toUpperCase()}`
          : `WW-${String(persistedData.id).slice(0, 8).toUpperCase()}`;

        const newReport: CitizenReport = {
          id: generatedReportId,
          incidentId: generatedIncidentId,
          category: (persistedData.category || category).toUpperCase(),
          description: description || "No description provided.",
          address: address,
          status: persistedData.status || "REPORTED",
          priority: persistedData.priority || "P3",
          severityScore: persistedData.severity_score,
          confidence: persistedData.confidence,
          volumeM3: persistedData.estimated_volume_m3,
          createdAt: "Just now",
          imageCount: finalImageUrls.length > 0 ? finalImageUrls.length : images.length,
        };

        // Broadcast to LocalStorage for offline fallback support
        try {
          const officerIncident = {
            id: generatedIncidentId,
            title: `${(persistedData.category || category).toUpperCase()} at ${address.split(',')[0]}`,
            category: (persistedData.category || category).toUpperCase(),
            priority: newReport.priority,
            status: newReport.status,
            lat: coords?.lat || 23.0330,
            lng: coords?.lng || 72.5860,
            reportsCount: 1,
            timeAgo: "Just now",
            slaMinutesLeft: newReport.priority === "P0" ? 60 : newReport.priority === "P1" ? 120 : 240,
          };
          const existingIncidents = JSON.parse(localStorage.getItem("sync_incidents") || "[]");
          localStorage.setItem("sync_incidents", JSON.stringify([officerIncident, ...existingIncidents]));
          window.dispatchEvent(new Event("storage"));
        } catch (e) {
          console.warn("Storage sync failed", e);
        }

        setReportsList((prev) => [newReport, ...prev]);
        setSubmittedReport(newReport);
        setImages([]);
        setUploadedImageUrls([]);
        setDescription("");
        setAiAnalysis(null);
      } else {
        throw new Error(`Server returned ${res.status}`);
      }
    } catch (err) {
      console.warn("Backend report submission failed, using local offline fallback", err);
      // Offline fallback
      const fallbackId = `REP-${Math.floor(1000 + Math.random() * 9000)}`;
      const fallbackIncidentId = `WW-${Math.floor(10000000 + Math.random() * 90000000)}`;
      const fallbackReport: CitizenReport = {
        id: fallbackId,
        incidentId: fallbackIncidentId,
        category: category.toUpperCase(),
        description: description || "No description provided.",
        address: address,
        status: "REPORTED",
        priority: aiAnalysis?.severityScore && aiAnalysis.severityScore > 7.0 ? "P1" : "P2",
        severityScore: aiAnalysis?.severityScore || 5.0,
        createdAt: "Just now",
        imageCount: images.length,
      };

      setReportsList((prev) => [fallbackReport, ...prev]);
      setSubmittedReport(fallbackReport);
      setImages([]);
      setDescription("");
      setAiAnalysis(null);
    } finally {
      setSubmitting(false);
    }
  };

  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  useEffect(() => {
    return () => {
      // Cleanup camera on unmount
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

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
            {user && (
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-sm text-xs">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-bold text-slate-700 text-[11px]">{user.fullName.split(' ')[0]}</span>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="text-slate-400 hover:text-red-600 transition-colors p-0.5 ml-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

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
                <h2 className="text-2xl font-bold mb-1 text-slate-900">Report Submitted Successfully</h2>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
                  Persisted directly to the Municipal Incident Engine. The AI Computer Vision model evaluated severity and priority for city dispatch.
                </p>

                {/* Structured Incident Metadata Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6 text-left max-w-md mx-auto space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-500">Incident ID</span>
                    <span className="font-mono text-xs font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {submittedReport.incidentId || submittedReport.id}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-500">Category</span>
                    <span className="text-xs font-bold text-slate-800">{submittedReport.category}</span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-500">Severity</span>
                    <span className="text-xs font-bold text-amber-700">
                      {submittedReport.severityScore ? `${submittedReport.severityScore} / 10.0` : "Assessed by Vision AI"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-500">Priority</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                      style={{
                        backgroundColor:
                          submittedReport.priority === "P0"
                            ? "var(--color-p0-emergency)"
                            : submittedReport.priority === "P1"
                            ? "var(--color-p1-veryhigh)"
                            : submittedReport.priority === "P2"
                            ? "var(--color-p2-high)"
                            : "var(--color-p3-normal)",
                      }}
                    >
                      {submittedReport.priority}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <span className="text-xs font-semibold text-slate-500">Status</span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {submittedReport.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs font-semibold text-slate-500">Location</span>
                    <span className="text-[11px] font-medium text-slate-700 truncate max-w-[220px]" title={submittedReport.address}>
                      📍 {submittedReport.address}
                    </span>
                  </div>
                </div>

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
                    Track in My Reports
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
                      <span>{analysisStatusText || "WasteWise Vision AI: Analyzing waste volume, hazard index, and classification..."}</span>
                    </div>
                  )}

                  {aiAnalysis && (
                    <div className={`mb-4 p-4 rounded-xl text-xs ${aiAnalysis.isFallback ? "bg-amber-50/70 border border-amber-200 text-amber-950" : "bg-emerald-50 border border-emerald-200 text-emerald-950"}`}>
                      <div className="flex items-center justify-between font-bold mb-2 pb-1.5 border-b border-slate-200/60">
                        <span className="flex items-center gap-1.5">
                          <Eye className={`w-4 h-4 ${aiAnalysis.isFallback ? "text-amber-700" : "text-emerald-700"}`} />
                          <span className="font-bold">WasteWise AI Vision Analysis</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${aiAnalysis.providerUsed === "gemini" && !aiAnalysis.isFallback ? "bg-emerald-200/80 text-emerald-900 border border-emerald-300" : "bg-amber-200/80 text-amber-900 border border-amber-300"}`}>
                            {aiAnalysis.providerUsed === "gemini" && !aiAnalysis.isFallback ? "AI Vision Model" : "Fallback Engine"}
                          </span>
                          <span className="bg-white/80 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-medium text-slate-700">
                            {(aiAnalysis.confidence * 100).toFixed(0)}% Confidence
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <div className="bg-white/60 p-2 rounded-lg border border-slate-200/50">
                          <span className="text-slate-500 block text-[10px]">Detected Category</span>
                          <span className="font-bold text-slate-900">{aiAnalysis.category}</span>
                        </div>
                        <div className="bg-white/60 p-2 rounded-lg border border-slate-200/50">
                          <span className="text-slate-500 block text-[10px]">Estimated Volume</span>
                          <span className="font-bold text-slate-900">{aiAnalysis.volumeM3} m³</span>
                        </div>
                        <div className="bg-white/60 p-2 rounded-lg border border-slate-200/50">
                          <span className="text-slate-500 block text-[10px]">Severity Rating</span>
                          <span className={`font-bold ${aiAnalysis.severityScore >= 8.0 ? "text-red-700" : aiAnalysis.severityScore >= 6.0 ? "text-amber-700" : "text-emerald-700"}`}>
                            {aiAnalysis.severityScore} / 10.0
                          </span>
                        </div>
                      </div>

                      {aiAnalysis.tags && aiAnalysis.tags.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] text-slate-500 font-semibold">Identified Tags:</span>
                          {aiAnalysis.tags.map((tag, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-white text-slate-700 rounded-md text-[10px] font-medium border border-slate-200">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2.5 text-[10px] text-slate-500 italic">
                          No specific visual tags detected
                        </div>
                      )}

                      <div className="mt-2 text-[11px] font-medium text-slate-800 bg-white/70 p-2 rounded-lg border border-slate-200/60">
                        <span className="font-semibold text-slate-900">Recommended Action: </span>
                        {aiAnalysis.recommendedAction}
                      </div>
                    </div>
                  )}

                  {isCameraActive ? (
                    <div className="flex flex-col items-center bg-slate-900 rounded-xl overflow-hidden relative w-full aspect-video">
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover"
                      />
                      <canvas ref={canvasRef} className="hidden" />
                      
                      {/* Camera Controls */}
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="bg-white text-slate-900 px-6 py-2.5 rounded-full text-xs font-bold shadow-lg hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          Capture Photo
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="bg-red-600 text-white p-2.5 rounded-full shadow-lg hover:bg-red-700 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <button 
                        type="button"
                        onClick={startCamera}
                        className="w-full border-2 border-dashed border-slate-300 hover:border-[var(--color-primary)] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#FAF8F5]"
                      >
                        <Camera className="w-8 h-8 text-[var(--color-primary)] mb-2" />
                        <span className="text-xs font-semibold text-slate-700">
                          Tap to open camera & capture live photo
                        </span>
                        <span className="text-[11px] text-slate-400 mt-1 text-center leading-relaxed">
                          Live WebRTC camera capture automatically invokes the AI Vision pipeline.
                        </span>
                      </button>

                      <div className="flex items-center justify-center">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-[11px] text-slate-500 hover:text-[var(--color-primary)] font-medium flex items-center gap-1.5 cursor-pointer py-1"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Or select image file for AI inspection</span>
                        </button>
                      </div>
                    </div>
                  )}
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
