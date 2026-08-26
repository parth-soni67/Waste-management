"use client";

import React, { useEffect } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  Route,
  MapPin,
} from "lucide-react";

export interface ToastPayload {
  id?: string;
  title: string;
  message: string;
  priority?: "P0" | "P1" | "P2" | "P3" | "P4" | string;
  notification_type?: string;
  incident_id?: string;
  incident_code?: string;
  durationMs?: number;
}

interface NotificationToastProps {
  toast: ToastPayload | null;
  onDismiss: () => void;
  onAction?: (incidentId?: string) => void;
}

export default function NotificationToast({
  toast,
  onDismiss,
  onAction,
}: NotificationToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, toast.durationMs || 6500);

    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isCritical = toast.priority === "P0" || toast.priority === "P1";

  const getToastIcon = () => {
    if (isCritical) {
      return <AlertOctagon className="w-5 h-5 text-red-600 shrink-0" />;
    }
    if (toast.notification_type === "PROOF_VERIFIED") {
      return <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
    }
    if (toast.notification_type === "ROUTE_UPDATED") {
      return <Route className="w-5 h-5 text-teal-600 shrink-0" />;
    }
    return <MapPin className="w-5 h-5 text-emerald-700 shrink-0" />;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full animate-in slide-in-from-bottom-5 duration-200">
      <div
        className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start gap-3 transition-all ${
          isCritical
            ? "bg-red-50/95 border-red-200 text-red-950 ring-2 ring-red-500/20"
            : "bg-white/95 border-slate-200 text-slate-900 ring-2 ring-emerald-500/20"
        }`}
      >
        {/* Icon */}
        <div className="mt-0.5">{getToastIcon()}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="text-xs font-extrabold tracking-tight truncate">
              {toast.title}
            </h4>
            {toast.priority && (
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                  toast.priority === "P0"
                    ? "bg-red-600 text-white"
                    : toast.priority === "P1"
                    ? "bg-amber-500 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {toast.priority}
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2 mb-2">
            {toast.message}
          </p>

          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
            {toast.incident_code && (
              <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                {toast.incident_code}
              </span>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {onAction && (
                <button
                  onClick={() => {
                    onAction(toast.incident_id);
                    onDismiss();
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    isCritical
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : "bg-emerald-800 text-white hover:bg-emerald-900"
                  }`}
                >
                  <span>View</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onDismiss}
          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
          title="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
