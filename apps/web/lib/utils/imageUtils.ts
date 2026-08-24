/**
 * WasteWise AI — Centralized Image URL Resolver
 * 
 * Normalizes and resolves all image sources across the application:
 * - Absolute URLs (https://, http://)
 * - Data URLs (data:image/...)
 * - Blob URLs (blob:...)
 * - Backend relative upload paths (/uploads/..., uploads/...)
 * - Local static frontend assets (/images/..., /avatars/...)
 */

export function resolveImageUrl(src: string | null | undefined): string {
  if (!src || typeof src !== "string") {
    return "";
  }

  const trimmed = src.trim();
  if (!trimmed) {
    return "";
  }

  // Absolute, Data, or Blob URLs return directly
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }

  // Base API URL from environment variables or default local backend
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

  // If path starts with /uploads, uploads/, /static, static/, etc.
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  
  return `${apiUrl}${path}`;
}

/**
 * Validates if an image URL string is non-empty and non-null
 */
export function isValidImageSrc(src: string | null | undefined): boolean {
  return Boolean(src && typeof src === "string" && src.trim().length > 0);
}
