/**
 * WasteWise AI — Frontend Library
 *
 * Shared utilities, API client, and constants.
 * Populated in Phase 1 with auth helpers, API client, etc.
 */

/** API base URL from environment */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Fetch wrapper with base URL */
export async function apiFetch(path: string, options?: RequestInit) {
  const url = `${API_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  return response;
}
