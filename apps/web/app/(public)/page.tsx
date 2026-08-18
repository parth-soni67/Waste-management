"use client";

import React, { useState, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import AuthCard from "@/components/landing/AuthCard";
import LandingHero from "@/components/landing/LandingHero";
import SceneFallback2D from "@/components/landing/SceneFallback2D";

// Dynamic load R3F Canvas so AuthCard is interactive immediately without blocking (design_guide.md §5)
const CityScene3D = dynamic(
  () => import("@/components/landing/CityScene3D"),
  {
    ssr: false,
    loading: () => <SceneFallback2D />,
  }
);

export default function MergedLandingAuthPage() {
  const [useFallback, setUseFallback] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check reduced motion preference or WebGL availability
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Check basic WebGL support
    let hasWebGL = false;
    try {
      const canvas = document.createElement("canvas");
      hasWebGL = Boolean(
        window.WebGLRenderingContext &&
          (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
    } catch {
      hasWebGL = false;
    }

    if (prefersReducedMotion || !hasWebGL) {
      setUseFallback(true);
    }
  }, []);

  return (
    <div className="relative w-full min-h-screen flex items-center justify-center p-4 sm:p-6 md:p-12 overflow-x-hidden bg-[var(--color-canvas)]">
      {/* Background 3D Scene / 2D Fallback Layer */}
      {mounted && !useFallback ? (
        <Suspense fallback={<SceneFallback2D />}>
          <CityScene3D />
        </Suspense>
      ) : (
        <SceneFallback2D />
      )}

      {/* Foreground Content: Asymmetric Layout (Headline Left, Auth Card Right) */}
      <div className="relative z-10 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center min-h-[85vh]">
        {/* Left Col: Hero narrative */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <LandingHero />
        </div>

        {/* Right Col: GitHub-style floating Auth Card */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <AuthCard />
        </div>
      </div>
    </div>
  );
}
