"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, setSession, type Session } from "@/lib/api";
import { homeFor, ROLE_LABEL } from "@/lib/nav";
import { Button, ErrorBox, Field, Input } from "@/components/ui";
import { Logo } from "@/components/brand";

const DEMO = [
  ["admin", "admin123"], ["doctor", "doctor123"], ["nurse", "nurse123"], ["reception", "reception123"],
  ["lab", "lab123"], ["pharmacy", "pharmacy123"], ["accounts", "accounts123"], ["patient", "patient123"],
];
const ROLE_OF: Record<string, keyof typeof ROLE_LABEL> = { admin: "admin", doctor: "doctor", nurse: "nurse", reception: "receptionist", lab: "lab", pharmacy: "pharmacist", accounts: "accountant", patient: "patient" };

export default function Login() {
  const router = useRouter();
  const [u, setU] = useState("reception");
  const [p, setP] = useState("reception123");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.trim() || !p) return setErr("Enter username and password");
    setBusy(true);
    setErr(null);
    try {
      const s = await api<Session>("/api/auth/login", { body: { username: u, password: p } });
      setSession(s);
      router.replace(homeFor(s.user.role));
    } catch (x: any) {
      setErr(x.status === 500 || x.message.includes("fetch") ? "Cannot reach the API server. Is the backend running on port 8000?" : x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div className="rounded-lg bg-white/95 px-3 py-2 self-start"><Logo /></div>
        <div className="max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-100/80">Hospital management platform</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">Six Modules.<br />One Platform.<br /><span className="text-[#5fd3c1]">Zero Silos.</span></h1>
          <p className="mt-5 text-sm leading-relaxed text-blue-100/80">Registration, EMR, operations, billing, diagnostics, pharmacy and patient engagement — sharing one patient record from front desk to final invoice.</p>
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-blue-100/70">
          {["Patient Experience", "Clinical Care", "Hospital Operations", "Financial Management", "Diagnostics & Pharmacy", "Patient Engagement"].map((m, i) => (
            <li key={m} className="flex items-center gap-2"><span className="num text-[#5fd3c1]">0{i + 1}</span>{m}</li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 lg:hidden" />
          <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-muted">Staff and patients sign in with their assigned credentials.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {err && <ErrorBox message={err} />}
            <Field label="Username or UHID" required><Input value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" /></Field>
            <Field label="Password" required><Input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" /></Field>
            <Button type="submit" className="w-full" loading={busy}>Sign in</Button>
          </form>
          <div className="mt-8 rounded-lg border border-line bg-white p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Demo accounts · synthetic data</p>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO.map(([a, b]) => (
                <button key={a} type="button" onClick={() => (setU(a), setP(b))}
                  className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${u === a ? "border-brand-500 bg-brand-50" : "border-line hover:bg-slate-50"}`}>
                  <span className="block font-medium text-ink">{ROLE_LABEL[ROLE_OF[a]]}</span>
                  <span className="text-muted">{a}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
