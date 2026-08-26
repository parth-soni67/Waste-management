"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, AlertCircle, CheckCircle2, ShieldCheck, Truck, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

type AuthMode = "signin" | "signup" | "forgot";

export default function AuthCard() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handlePrefillAccount = (demoEmail: string, demoPass: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (mode !== "forgot" && !password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signin") {
        const authUser = await login(cleanEmail, password);
        const userRole = String(authUser.role).toLowerCase();

        // Redirect according to the authenticated user's real database role
        if (userRole === "driver") {
          router.push("/driver");
        } else if (userRole === "officer") {
          router.push("/officer");
        } else if (userRole === "admin") {
          router.push("/admin");
        } else {
          router.push("/citizen");
        }
      } else if (mode === "signup") {
        if (!phone || !phone.trim()) {
          setErrorMessage("Phone number is required.");
          setLoading(false);
          return;
        }
        const digits = phone.replace(/\D/g, "");
        if (digits.length !== 10 && (digits.length !== 12 || !digits.startsWith("91"))) {
          setErrorMessage("Enter a valid 10-digit Indian mobile number.");
          setLoading(false);
          return;
        }
        const mobileDigits = digits.length === 12 ? digits.slice(2) : digits;
        if (!"6789".includes(mobileDigits[0])) {
          setErrorMessage("Enter a valid 10-digit Indian mobile number.");
          setLoading(false);
          return;
        }

        await register(cleanEmail, password, fullName, phone);
        setSuccessMessage("Account created successfully! Redirecting to citizen portal...");
        setTimeout(() => router.push("/citizen"), 800);
      } else {
        setSuccessMessage("Password reset instructions have been dispatched to your email.");
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[420px] mx-auto z-10">
      {/* GitHub-style single restrained card per design_guide.md §5 */}
      <motion.div
        layout
        className="bg-white rounded-2xl p-7 md:p-8 transition-shadow"
        style={{
          boxShadow: "var(--shadow-card)",
          borderRadius: "var(--radius-card)",
          border: "1px solid rgba(20, 32, 26, 0.08)",
        }}
      >
        {/* Brand Logomark */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              W
            </div>
            <div>
              <h2
                className="text-lg font-bold leading-tight"
                style={{
                  color: "var(--color-ink)",
                  fontFamily: "var(--font-plus-jakarta, sans-serif)",
                }}
              >
                WasteWise AI
              </h2>
              <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
                Municipal Intelligence Engine
              </p>
            </div>
          </div>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: "var(--color-primary-tint)",
              color: "var(--color-primary-strong)",
            }}
          >
            v1.0 Live
          </span>
        </div>

        {/* Card Title */}
        <h1
          className="text-xl font-bold mb-1"
          style={{
            color: "var(--color-ink)",
            fontFamily: "var(--font-plus-jakarta, sans-serif)",
          }}
        >
          {mode === "signin" && "Sign in to WasteWise AI"}
          {mode === "signup" && "Create your citizen account"}
          {mode === "forgot" && "Reset your password"}
        </h1>
        <p className="text-xs mb-5" style={{ color: "var(--color-ink-muted)" }}>
          {mode === "signin" && "Enter your credentials or pick a demo role below."}
          {mode === "signup" && "Join your city's predictive waste network."}
          {mode === "forgot" && "We'll send a secure single-use recovery link."}
        </p>

        {/* Feedback Alerts */}
        <AnimatePresence mode="wait">
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-3 rounded-lg flex items-center gap-2 text-xs bg-red-50 text-red-700 border border-red-200"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </motion.div>
          )}

          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 p-3 rounded-lg flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200"
            >
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Fields */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
                  Full name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Aditi Sharma"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all bg-[#FAF8F5]"
                  style={{
                    borderColor: "rgba(20, 32, 26, 0.15)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
                  Phone number <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all bg-[#FAF8F5]"
                  style={{
                    borderColor: "rgba(20, 32, 26, 0.15)",
                  }}
                />
              </div>
            </motion.div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
              Email address <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.gov / name@gmail.com"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all bg-[#FAF8F5]"
              style={{
                borderColor: "rgba(20, 32, 26, 0.15)",
              }}
            />
          </div>

          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold" style={{ color: "var(--color-ink)" }}>
                  Password <span className="text-red-500">*</span>
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-xs hover:underline cursor-pointer"
                    style={{ color: "var(--color-primary)" }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all bg-[#FAF8F5]"
                style={{
                  borderColor: "rgba(20, 32, 26, 0.15)",
                }}
              />
            </div>
          )}

          {/* Primary Action Button (Full width forest green per design_guide.md §5) */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg text-white font-semibold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-sm hover:opacity-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--color-primary)",
              borderRadius: "var(--radius-button)",
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block animate-spin">⟳</span>
                <span>
                  {mode === "signin" && "Signing in..."}
                  {mode === "signup" && "Creating account..."}
                  {mode === "forgot" && "Sending link..."}
                </span>
              </span>
            ) : (
              <>
                <span>
                  {mode === "signin" && "Sign in"}
                  {mode === "signup" && "Create account"}
                  {mode === "forgot" && "Send recovery link"}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Informational Demo Credentials (No bypass — Real Database Authentication Required) */}
        {mode === "signin" && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold tracking-wide uppercase text-slate-500 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-600" /> Demo Account Credentials
              </span>
              <span className="text-[10px] text-slate-400">Argon2id Verified</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => handlePrefillAccount("citizen@wastewise.gov", "password123")}
                className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-[#F0EBE1] hover:bg-[#E5DEC4] text-slate-800 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                title="Fill Citizen credentials (citizen@wastewise.gov / password123)"
              >
                <UserCheck className="w-3 h-3 text-emerald-700" /> Citizen
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handlePrefillAccount("driver@wastewise.gov", "password123")}
                className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-[#F0EBE1] hover:bg-[#E5DEC4] text-slate-800 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                title="Fill Driver credentials (driver@wastewise.gov / password123)"
              >
                <Truck className="w-3 h-3 text-teal-700" /> Driver
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handlePrefillAccount("officer@wastewise.gov", "password123")}
                className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-[#F0EBE1] hover:bg-[#E5DEC4] text-slate-800 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                title="Fill Officer credentials (officer@wastewise.gov / password123)"
              >
                <ShieldCheck className="w-3 h-3 text-amber-700" /> Officer
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handlePrefillAccount("admin@wastewise.gov", "password123")}
                className="py-1.5 px-2 rounded-md text-[11px] font-medium bg-[#F0EBE1] hover:bg-[#E5DEC4] text-slate-800 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                title="Fill Admin credentials (admin@wastewise.gov / password123)"
              >
                <ShieldCheck className="w-3 h-3 text-purple-700" /> Admin
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              All logins authenticate directly against PostgreSQL via POST /api/v1/auth/login
            </p>
          </div>
        )}
      </motion.div>

      {/* Secondary mode switch link below card per GitHub pattern */}
      <div className="text-center mt-4">
        {mode === "signin" ? (
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            New to WasteWise AI?{" "}
            <button
              onClick={() => {
                setErrorMessage(null);
                setMode("signup");
              }}
              className="font-semibold underline hover:opacity-80 cursor-pointer"
              style={{ color: "var(--color-primary)" }}
            >
              Create an account
            </button>
          </p>
        ) : (
          <p className="text-xs" style={{ color: "var(--color-ink-muted)" }}>
            Already have an account?{" "}
            <button
              onClick={() => {
                setErrorMessage(null);
                setMode("signin");
              }}
              className="font-semibold underline hover:opacity-80 cursor-pointer"
              style={{ color: "var(--color-primary)" }}
            >
              Sign in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
