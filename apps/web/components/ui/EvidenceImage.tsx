"use client";

import React, { useState, useEffect } from "react";
import {
  ImageIcon,
  RotateCw,
  Eye,
  X,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { resolveImageUrl } from "@/lib/utils/imageUtils";

export interface EvidenceImageProps {
  src?: string | null;
  alt?: string;
  variant?: "evidence" | "thumbnail" | "preview" | "hero";
  aspectRatio?: "16/9" | "4/3" | "3/4" | "1/1" | "auto";
  objectFit?: "contain" | "cover";
  className?: string;
  imgClassName?: string;
  enableLightbox?: boolean;
  badge?: React.ReactNode;
  badgePosition?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  onRetry?: () => void;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

export function EvidenceImage({
  src,
  alt = "Evidence Photo",
  variant = "evidence",
  aspectRatio = "auto",
  objectFit,
  className = "",
  imgClassName = "",
  enableLightbox = true,
  badge,
  badgePosition = "bottom-left",
  onRetry,
  fallbackTitle = "Evidence Unavailable",
  fallbackDescription = "Photo asset not found or offline",
}: EvidenceImageProps) {
  const resolvedUrl = resolveImageUrl(src);
  const isUrlValid = Boolean(resolvedUrl && resolvedUrl.trim().length > 0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Default object-fit: "cover" for clean container fill, "contain" if explicitly requested
  const finalObjectFit = objectFit ?? (variant === "thumbnail" ? "cover" : "cover");

  // Handle ESC key to close lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsLightboxOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLightboxOpen]);

  const handleManualRetry = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isUrlValid) return;
    setHasError(false);
    setIsLoading(true);
    setRetryCount((prev) => prev + 1);
    if (onRetry) onRetry();
  };

  const getAspectRatioClass = () => {
    switch (aspectRatio) {
      case "16/9":
        return "aspect-video";
      case "4/3":
        return "aspect-[4/3]";
      case "3/4":
        return "aspect-[3/4]";
      case "1/1":
        return "aspect-square";
      default:
        return "min-h-[220px] max-h-[360px] aspect-[4/3]";
    }
  };

  const getBadgePositionClass = () => {
    switch (badgePosition) {
      case "top-left":
        return "top-2 left-2";
      case "top-right":
        return "top-2 right-2";
      case "bottom-right":
        return "bottom-2 right-2";
      default:
        return "bottom-2 left-2";
    }
  };

  const showFallback = hasError || !isUrlValid;

  return (
    <>
      <div
        className={`relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 flex items-center justify-center ${getAspectRatioClass()} ${className}`}
      >
        {/* SKELETON LOADING STATE */}
        {isLoading && !showFallback && (
          <div className="absolute inset-0 z-10 bg-slate-100 dark:bg-slate-900 animate-pulse flex flex-col items-center justify-center p-4 text-center text-slate-500 gap-2 border border-slate-200 dark:border-slate-800">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Loading Evidence Photo...
            </span>
          </div>
        )}

        {/* INTENTIONAL FALLBACK CARD */}
        {showFallback ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-slate-50 dark:bg-slate-950/90 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-1.5">
            <div className="p-2.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 mb-0.5">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">{fallbackTitle}</span>
            <span className="text-[10px] text-slate-500 max-w-[200px] leading-tight block">
              {fallbackDescription}
            </span>
            {isUrlValid && (
              <button
                type="button"
                onClick={handleManualRetry}
                className="mt-2 px-3 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
              >
                <RotateCw className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>Retry Loading</span>
              </button>
            )}
          </div>
        ) : (
          /* ACTUAL IMAGE — ONLY RENDERED WHEN isUrlValid IS STRICTLY TRUE */
          isUrlValid && (
            <div className="relative w-full h-full flex items-center justify-center bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${resolvedUrl}-${retryCount}`}
                src={resolvedUrl}
                alt={alt}
                onLoad={() => {
                  setIsLoading(false);
                  setHasError(false);
                }}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
                onClick={() => enableLightbox && setIsLightboxOpen(true)}
                className={`w-full h-full ${
                  finalObjectFit === "contain" ? "object-contain" : "object-cover"
                } ${
                  enableLightbox ? "cursor-pointer hover:scale-[1.02] transition-all duration-200" : ""
                } ${imgClassName}`}
              />

              {/* OVERLAY BADGE */}
              {badge && (
                <div className={`absolute z-10 ${getBadgePositionClass()}`}>
                  {badge}
                </div>
              )}

              {/* HOVER ZOOM / LIGHTBOX TRIGGER BUTTON */}
              {enableLightbox && !isLoading && !hasError && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLightboxOpen(true);
                  }}
                  className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/70 hover:bg-black/90 text-white backdrop-blur-xs text-[10px] font-bold flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer z-10 shadow-md"
                  title="Expand Full Resolution View"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Zoom</span>
                </button>
              )}
            </div>
          )
        )}
      </div>

      {/* FULLSCREEN LIGHTBOX MODAL — ONLY RENDERED WHEN IS URL VALID */}
      {isLightboxOpen && isUrlValid && !hasError && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl w-full bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                    {alt || "Evidence Inspection Photo"}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono">
                    High Resolution Municipal Proof Asset
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Photo Display Area */}
            <div className="p-4 flex-1 flex items-center justify-center bg-black min-h-[300px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedUrl}
                alt={alt}
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-lg"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-400 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified WasteWise AI Evidence Asset
              </span>
              <a
                href={resolvedUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-slate-300 hover:text-white underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Original in New Tab</span>
                <ExternalLink className="w-3 h-3 text-emerald-400" />
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default EvidenceImage;
