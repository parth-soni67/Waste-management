"use client";

import React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

/**
 * WasteWise AI — Kinetic Landing Headline
 * Source of truth: design_guide.md §5
 *
 * Kinetic entrance (word-by-word ease-out <600ms) then static.
 * No looping distraction.
 */

export default function LandingHero() {
  const headlineWords = [
    "Predictive",
    "waste",
    "intelligence",
    "for",
    "cleaner",
    "cities.",
  ];

  return (
    <div className="max-w-xl text-left z-10">
      {/* Category Pill */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
        style={{
          backgroundColor: "var(--color-primary-tint)",
          color: "var(--color-primary-strong)",
        }}
      >
        <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
        <span>Smart India Hackathon 2026 · PS 8</span>
      </motion.div>

      {/* Kinetic Headline */}
      <h1
        className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-5"
        style={{
          color: "var(--color-ink)",
          fontFamily: "var(--font-plus-jakarta, sans-serif)",
        }}
      >
        {headlineWords.map((word, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: i * 0.07,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="inline-block mr-2.5"
          >
            {word === "cleaner" ? (
              <span className="text-[var(--color-primary)] italic">{word}</span>
            ) : word === "intelligence" ? (
              <span className="text-[var(--color-accent)]">{word}</span>
            ) : (
              word
            )}
          </motion.span>
        ))}
      </h1>

      {/* Subtext explaining the differentiator */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45, ease: "easeOut" }}
        className="text-base sm:text-lg leading-relaxed mb-6 font-normal max-w-lg"
        style={{ color: "var(--color-ink-muted)" }}
      >
        We don&apos;t just track garbage trucks. We predict where waste will
        appear, decide what needs attention first, dynamically optimize
        collection, and verify resolution.
      </motion.p>

      {/* Metric Callouts */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.6, ease: "easeOut" }}
        className="flex items-center gap-6 pt-2 text-xs font-semibold"
        style={{ color: "var(--color-ink)" }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[var(--color-p0-emergency)] animate-pulse" />
          <span>Real-time P0-P4 Triage</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[var(--color-aqua)]" />
          <span>Dynamic Live Re-routing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
          <span>Before/After AI CV</span>
        </div>
      </motion.div>
    </div>
  );
}
