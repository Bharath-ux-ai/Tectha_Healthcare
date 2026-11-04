"use client";
import { useCallback, useEffect, useState } from "react";
import { handleMockApi, resetDemoDB } from "./mock-api";

export { resetDemoDB };

export type Row = Record<string, any>;
export type Session = { token: string; user: { id: number; username: string; name: string; role: Role; staff_id?: number; patient_id?: number } };
export type Role = "admin" | "doctor" | "nurse" | "receptionist" | "lab" | "pharmacist" | "accountant" | "patient";

const KEY = "tecthha.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
export function setSession(s: Session | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  // If deployed on Vercel or non-localhost, or explicitly in demo mode: use built-in mock API
  const isDemo =
    typeof window !== "undefined" &&
    (window.location.hostname.includes("vercel.app") ||
      !window.location.hostname.includes("localhost") ||
      process.env.NEXT_PUBLIC_DEMO_MODE === "true");

  if (isDemo) {
    try {
      return await handleMockApi<T>(path, opts as any);
    } catch (e: any) {
      throw new ApiError(400, e.message || "Operation failed");
    }
  }

  const s = getSession();
  try {
    const res = await fetch(path, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && s) {
      setSession(null);
      window.location.href = "/login";
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // If backend is offline (500 proxy error), seamlessly fallback to mock API
      if (res.status >= 500) {
        return await handleMockApi<T>(path, opts as any);
      }
      const d = (data as any).detail;
      throw new ApiError(res.status, typeof d === "string" ? d : Array.isArray(d) ? d.map((x: any) => x.msg).join(", ") : `Request failed (${res.status})`);
    }
    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    // Network error: fallback to mock API
    return await handleMockApi<T>(path, opts as any);
  }
}

export const qs = (p: Row) =>
  Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

/** Fetch hook with loading / error / reload. Pass null to skip. */
export function useApi<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api<T>(path)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

export const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const inr = (n: number | null | undefined) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s + (s.endsWith("Z") || s.includes("+") ? "" : "Z"));
  return isNaN(+d) ? s : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
export const fmtDateTime = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s + (s.endsWith("Z") ? "" : "Z"));
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};
export const age = (dob?: string) => {
  if (!dob) return "—";
  const b = new Date(dob), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return `${a}y`;
};
