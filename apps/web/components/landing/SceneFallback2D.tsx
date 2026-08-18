"use client";

import React from "react";

/**
 * WasteWise AI — 2D Scene Fallback
 * Source of truth: design_guide.md §5
 *
 * Art-directed SVG / Gradient fallback rendering the same isometric city
 * and warm earth-green + amber palette when WebGL is unavailable or
 * prefers-reduced-motion is active.
 */

export default function SceneFallback2D() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none bg-[var(--color-canvas)]">
      {/* Subtle ambient gradient mesh */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 30% 40%, rgba(31, 94, 63, 0.12) 0%, transparent 60%), " +
            "radial-gradient(circle at 70% 60%, rgba(232, 106, 51, 0.08) 0%, transparent 50%)",
        }}
      />

      {/* Stylized isometric SVG city silhouettes */}
      <svg
        className="absolute left-[-5%] top-[10%] w-[65%] h-[80%] opacity-25"
        viewBox="0 0 800 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Isometric grid lines */}
        <path
          d="M100 500 L500 250 L700 375 L300 625 Z"
          stroke="var(--color-primary-tint)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
        <path
          d="M200 450 L450 300"
          stroke="var(--color-primary-tint)"
          strokeWidth="1"
        />
        <path
          d="M300 500 L550 350"
          stroke="var(--color-primary-tint)"
          strokeWidth="1"
        />

        {/* Low-poly isometric building blocks */}
        {/* Building 1 */}
        <path d="M250 380 L320 340 L320 220 L250 260 Z" fill="#1F5E3F" />
        <path d="M320 340 L390 380 L390 260 L320 220 Z" fill="#2E533F" />
        <path d="M250 260 L320 220 L390 260 L320 300 Z" fill="#43735B" />

        {/* Building 2 */}
        <path d="M180 430 L230 400 L230 320 L180 350 Z" fill="#346E52" />
        <path d="M230 400 L280 430 L280 350 L230 320 Z" fill="#1F5E3F" />
        <path d="M180 350 L230 320 L280 350 L230 380 Z" fill="#7AA88E" />

        {/* Building 3 (Tall) */}
        <path d="M340 330 L400 295 L400 120 L340 155 Z" fill="#1F5E3F" />
        <path d="M400 295 L460 330 L460 155 L400 120 Z" fill="#123C29" />
        <path d="M340 155 L400 120 L460 155 L400 190 Z" fill="#346E52" />

        {/* Amber incident point marker */}
        <circle cx="210" cy="460" r="8" fill="#E86A33" />
        <circle cx="210" cy="460" r="16" stroke="#E86A33" strokeWidth="2" opacity="0.5" />

        {/* Vehicle route curve */}
        <path
          d="M150 490 Q210 460 300 440 T440 360"
          stroke="#2B8C86"
          strokeWidth="3"
          strokeDasharray="6 6"
        />
        {/* Vehicle glyph */}
        <rect
          x="285"
          y="430"
          width="24"
          height="14"
          rx="3"
          transform="rotate(-15 285 430)"
          fill="#2B8C86"
        />
      </svg>
    </div>
  );
}
