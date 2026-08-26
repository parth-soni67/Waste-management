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

  let trimmed = src.trim();
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

  // Handle local storage path prefixes (e.g. local/reports/2026_08/xxx.jpg -> /uploads/2026_08/xxx.jpg)
  if (trimmed.startsWith("local/reports/")) {
    trimmed = trimmed.replace("local/reports/", "/uploads/");
  } else if (trimmed.startsWith("local/")) {
    trimmed = trimmed.replace("local/", "/uploads/");
  }

  // Base API URL from environment variables or default local backend
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/+$/, "");

  // Ensure leading slash
  let path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  
  // If path doesn't start with /uploads or /images or /static, default to /uploads prefix
  if (!path.startsWith("/uploads") && !path.startsWith("/images") && !path.startsWith("/static")) {
    path = `/uploads${path}`;
  }

  return `${apiUrl}${path}`;
}

/**
 * Validates if an image URL string is non-empty and non-null
 */
export function isValidImageSrc(src: string | null | undefined): boolean {
  return Boolean(src && typeof src === "string" && src.trim().length > 0);
}
