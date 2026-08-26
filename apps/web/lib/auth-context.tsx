"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: "citizen" | "driver" | "officer" | "admin" | string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, fullName: string, phone?: string) => Promise<void>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "wastewise_auth_session";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session from secure sessionStorage on client mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.token && parsed.user) {
            setToken(parsed.token);
            setUser(parsed.user);
          }
        }
      } catch (e) {
        console.warn("Could not restore session:", e);
      } finally {
        setIsLoading(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    setIsLoading(true);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
    const normalizedEmail = email ? email.trim().toLowerCase() : "";

    let res: Response;
    try {
      res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
    } catch (networkErr) {
      setIsLoading(false);
      console.warn("Network error during login:", networkErr);
      throw new Error("Unable to connect to the authentication server. Please try again.");
    }

    try {
      if (!res.ok) {
        let errorDetail = "";
        try {
          const errData = await res.json();
          if (typeof errData?.detail === "string") {
            errorDetail = errData.detail;
          } else if (Array.isArray(errData?.detail)) {
            errorDetail = errData.detail.map((e: { msg?: string }) => e.msg).filter(Boolean).join("; ");
          }
        } catch {}

        if (res.status === 401) {
          throw new Error(errorDetail || "Invalid email or password");
        } else if (res.status === 403) {
          throw new Error(errorDetail || "Account is inactive or lacks required access permissions.");
        } else if (res.status === 404) {
          throw new Error("Authentication service endpoint unavailable.");
        } else if (res.status === 422) {
          throw new Error(errorDetail || "Invalid input format. Please check your email and password.");
        } else if (res.status >= 500) {
          throw new Error("Internal server error. Please try again later.");
        } else {
          throw new Error(errorDetail || "Authentication failed. Please check your credentials.");
        }
      }

      const data = await res.json();
      const authUser: AuthUser = {
        id: data.user_id,
        email: data.email,
        fullName: data.full_name,
        role: String(data.role).toLowerCase(),
      };

      setUser(authUser);
      setToken(data.access_token);

      // Store in sessionStorage (persists across page reloads in the current tab session)
      try {
        sessionStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({ token: data.access_token, user: authUser })
        );
      } catch {}

      return authUser;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ): Promise<void> => {
    setIsLoading(true);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
    const normalizedEmail = email ? email.trim().toLowerCase() : "";

    let res: Response;
    try {
      res = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          full_name: fullName.trim(),
          phone_number: phone,
        }),
      });
    } catch (networkErr) {
      setIsLoading(false);
      console.warn("Network error during registration:", networkErr);
      throw new Error("Unable to connect to the authentication server. Please try again.");
    }

    try {
      if (!res.ok) {
        let errorDetail = "";
        try {
          const errData = await res.json();
          if (typeof errData?.detail === "string") {
            errorDetail = errData.detail;
          } else if (Array.isArray(errData?.detail)) {
            errorDetail = errData.detail.map((e: { msg?: string }) => e.msg).filter(Boolean).join("; ");
          }
        } catch {}

        if (res.status === 400 || res.status === 409) {
          throw new Error(errorDetail || "Email is already registered. Please sign in instead.");
        } else if (res.status === 422) {
          throw new Error(errorDetail || "Please enter valid account information.");
        } else if (res.status >= 500) {
          throw new Error("Internal server error during registration. Please try again.");
        } else {
          throw new Error(errorDetail || "Failed to create account.");
        }
      }

      // Auto-login after successful registration
      await login(normalizedEmail, password);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
    router.push("/");
  };

  const getAuthHeaders = React.useCallback((): Record<string, string> => {
    if (!token) return {};
    return {
      Authorization: `Bearer ${token}`,
    };
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        getAuthHeaders,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
