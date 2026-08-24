/**
 * WasteWise AI — Authoritative Central Date & Time Utility
 * Source of truth: Real database UTC timestamps
 */

/**
 * Robustly parses any backend timestamp (ISO 8601 UTC with 'Z', '+00:00', or naive UTC string)
 * into a valid JavaScript Date object in local time.
 */
export function parseUtcDate(
  timestamp: string | number | Date | null | undefined
): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === "number") return new Date(timestamp);

  let str = String(timestamp).trim();
  if (!str) return new Date();

  // If no timezone indicator (no 'Z', no '+HH:MM', no '-HH:MM' offset), treat as UTC and append 'Z'
  if (!str.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += "Z";
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Computes elapsed milliseconds from the authoritative database timestamp to now.
 */
export function getElapsedMs(
  timestamp: string | number | Date | null | undefined
): number {
  if (!timestamp) return 0;
  const date = parseUtcDate(timestamp);
  const now = Date.now();
  const diff = now - date.getTime();
  // Allow up to 30 seconds of client-server clock skew
  return Math.max(0, diff);
}

/**
 * Returns elapsed minutes for SLA calculations and sorting.
 */
export function getElapsedMinutes(
  timestamp: string | number | Date | null | undefined
): number {
  return Math.floor(getElapsedMs(timestamp) / 60000);
}

/**
 * Formats a timestamp into human-readable relative time string:
 * - 0–59 seconds: "Just now"
 * - 1 minute: "1 min ago"
 * - 2–59 minutes: "X min ago"
 * - 1 hour: "1 hour ago"
 * - 2–23 hours: "X hours ago"
 * - 1 day: "1 day ago"
 * - 2+ days: "X days ago"
 */
export function formatRelativeTime(
  timestamp: string | number | Date | null | undefined
): string {
  if (!timestamp) return "Just now";

  const diffMs = getElapsedMs(timestamp);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return "Just now";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}
