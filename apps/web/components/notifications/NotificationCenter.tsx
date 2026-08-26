"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  AlertOctagon,
  MapPin,
  Route,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { formatRelativeTime } from "@/app/lib/timeAgo";

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: string;
  priority?: "P0" | "P1" | "P2" | "P3" | "P4" | string;
  incident_id?: string;
  incident_code?: string;
  vehicle_id?: string;
  recipient_role?: string;
  action_url?: string;
  is_read: boolean;
  read_at?: string;
  metadata_json?: Record<string, any>;
  created_at: string;
}

interface NotificationCenterProps {
  apiUrl?: string;
  getAuthHeaders: () => Record<string, string>;
  onSelectIncident?: (incidentId: string) => void;
  onRefreshData?: () => void;
}

export default function NotificationCenter({
  apiUrl = "http://localhost:8000",
  getAuthHeaders,
  onSelectIncident,
  onRefreshData,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState<boolean>(false);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 1. Fetch unread count & notifications
  const fetchNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const cleanApi = apiUrl.replace(/\/$/, "");
      const res = await fetch(
        `${cleanApi}/api/v1/notifications?limit=30&unread_only=${filterUnreadOnly}`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setNotifications(data.items || []);
        setUnreadCount(data.unread_count || 0);
      } else {
        if (res.status !== 401) {
          setError("Notifications temporarily unavailable.");
        }
      }
    } catch (err) {
      console.warn("Error loading notifications:", err);
      setError("Notifications temporarily unavailable.");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [apiUrl, getAuthHeaders, filterUnreadOnly]);

  // Initial load and polling fallback every 20s
  useEffect(() => {
    void fetchNotifications(true);

    const interval = setInterval(() => {
      void fetchNotifications(false);
    }, 20000);

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // WebSocket Live Listener for Real-Time Updates
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
              msg.type === "NOTIFICATION_CREATED" ||
              msg.type === "INCIDENT_ASSIGNED" ||
              msg.type === "NEW_INCIDENT_ASSIGNED" ||
              msg.type === "ROUTE_UPDATED" ||
              msg.type === "INCIDENT_VERIFIED" ||
              msg.type === "INCIDENT_PROOF_REJECTED" ||
              msg.type === "COLLECTION_STARTED" ||
              msg.type === "INCIDENT_COLLECTED"
            ) {
              void fetchNotifications(false);
            }
          } catch (e) {
            console.warn("Notification WS parse error", e);
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWs, 6000);
        };
      } catch (err) {
        console.warn("Notification WS init error", err);
      }
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [apiUrl, fetchNotifications]);

  // 2. Mark Single Notification as Read
  const handleMarkAsRead = async (notif: NotificationItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!notif.is_read) {
      // Optimistic UI update
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const cleanApi = apiUrl.replace(/\/$/, "");
        await fetch(`${cleanApi}/api/v1/notifications/${notif.id}/read`, {
          method: "PATCH",
          headers: getAuthHeaders(),
        });
      } catch (err) {
        console.warn("Failed to mark notification read in backend", err);
      }
    }

    // Action Navigation
    if (notif.incident_id && onSelectIncident) {
      onSelectIncident(notif.incident_id);
      setIsOpen(false);
    }
  };

  // 3. Mark All as Read
  const handleMarkAllAsRead = async () => {
    setIsMarkingAll(true);
    // Optimistic UI update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      const cleanApi = apiUrl.replace(/\/$/, "");
      await fetch(`${cleanApi}/api/v1/notifications/read-all`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (onRefreshData) onRefreshData();
    } catch (err) {
      console.warn("Failed to mark all notifications read", err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Icon selector based on type & priority
  const getNotificationIcon = (notif: NotificationItem) => {
    const isP0orP1 = notif.priority === "P0" || notif.priority === "P1";
    if (notif.notification_type === "CRITICAL_INCIDENT" || (isP0orP1 && notif.notification_type.includes("INCIDENT"))) {
      return (
        <div className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0 shadow-xs">
          <AlertOctagon className="w-4 h-4" />
        </div>
      );
    }
    if (notif.notification_type === "PROOF_VERIFIED" || notif.notification_type === "COLLECTION_COMPLETED") {
      return (
        <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
          <CheckCircle2 className="w-4 h-4" />
        </div>
      );
    }
    if (notif.notification_type === "PROOF_REJECTED") {
      return (
        <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-xs">
          <XCircle className="w-4 h-4" />
        </div>
      );
    }
    if (notif.notification_type === "ROUTE_UPDATED" || notif.notification_type === "NEW_COLLECTION_STOP") {
      return (
        <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center shrink-0 shadow-xs">
          <Route className="w-4 h-4" />
        </div>
      );
    }
    if (notif.notification_type === "COLLECTION_STARTED") {
      return (
        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center shrink-0 shadow-xs">
          <Clock className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-xs">
        <MapPin className="w-4 h-4" />
      </div>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            void fetchNotifications(false);
          }
        }}
        className={`relative p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
          isOpen
            ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-sm ring-2 ring-emerald-600/20"
            : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700 hover:border-slate-300"
        }`}
        title="Notifications"
        aria-label="Open notifications"
      >
        <Bell className="w-4 h-4" />

        {/* Real Dynamic Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1.5 bg-red-600 text-white text-[11px] font-black rounded-full flex items-center justify-center shadow-md animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[340px] sm:w-[380px] bg-white rounded-2xl border border-slate-200 shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-4 py-3.5 bg-slate-50/90 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xs sm:text-sm text-slate-900 tracking-tight">
                Notifications
              </span>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  All caught up
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  disabled={isMarkingAll}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/70 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}

              <button
                onClick={() => void fetchNotifications(true)}
                disabled={isLoading}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
                title="Refresh notifications"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2 border-b border-slate-100 bg-white flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterUnreadOnly(false)}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  !filterUnreadOnly
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterUnreadOnly(true)}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  filterUnreadOnly
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Unread only
              </button>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">
              {notifications.length} {notifications.length === 1 ? "item" : "items"}
            </span>
          </div>

          {/* Notification List Body */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {isLoading && notifications.length === 0 ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-xl bg-slate-200 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-slate-200 rounded w-3/4" />
                      <div className="h-2.5 bg-slate-200 rounded w-full" />
                      <div className="h-2 bg-slate-200 rounded w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-center">
                <AlertTriangle className="w-7 h-7 text-amber-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">{error}</p>
                <button
                  onClick={() => void fetchNotifications(true)}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : notifications.length === 0 ? (
              /* Empty State */
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 mb-3 shadow-xs">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-xs font-extrabold text-slate-800 mb-1">
                  You&apos;re all caught up
                </h2>
                <p className="text-[11px] text-slate-500 max-w-[200px]">
                  No new notifications right now. New dispatches and updates will appear here in real-time.
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const isP0 = item.priority === "P0";
                const isP1 = item.priority === "P1";

                return (
                  <div
                    key={item.id}
                    onClick={() => handleMarkAsRead(item)}
                    className={`p-3.5 transition-colors cursor-pointer relative group flex gap-3 ${
                      !item.is_read
                        ? isP0 || isP1
                          ? "bg-red-50/60 hover:bg-red-100/50"
                          : "bg-emerald-50/40 hover:bg-emerald-100/40"
                        : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    {/* Unread Accent Dot */}
                    {!item.is_read && (
                      <span
                        className={`absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full ${
                          isP0 || isP1 ? "bg-red-600" : "bg-emerald-600"
                        }`}
                      />
                    )}

                    {/* Icon */}
                    {getNotificationIcon(item)}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5 mb-1">
                        <span
                          className={`text-xs leading-snug tracking-tight ${
                            !item.is_read
                              ? "font-extrabold text-slate-900"
                              : "font-semibold text-slate-700"
                          }`}
                        >
                          {item.title}
                        </span>

                        {item.priority && (
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                              item.priority === "P0"
                                ? "bg-red-600 text-white"
                                : item.priority === "P1"
                                ? "bg-amber-500 text-white"
                                : item.priority === "P2"
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {item.priority}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2 mb-1.5">
                        {item.message}
                      </p>

                      {/* Footer Metadata */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatRelativeTime(item.created_at)}
                        </span>

                        {item.incident_id && (
                          <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {item.incident_code || `WW-${item.incident_id.slice(0, 8).toUpperCase()}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Dropdown Footer */}
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-center">
            <span className="text-[10px] font-medium text-slate-400">
              WasteWise AI Real-Time Dispatch System
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
