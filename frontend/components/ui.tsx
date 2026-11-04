"use client";
/* Shared UI primitives (shadcn/ui-style API, implemented locally to avoid extra runtime dependencies). */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X } from "lucide-react";

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "teal";
  size?: "sm" | "md";
  loading?: boolean;
};
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
    teal: "bg-teal-600 text-white hover:bg-teal-700 shadow-sm",
    secondary: "bg-white text-ink border border-line hover:bg-slate-50",
    ghost: "text-muted hover:bg-slate-100 hover:text-ink",
    danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  }[variant];
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        v,
        className
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

const W = (c?: string) => (/(^|\s)w-/.test(c || "") ? "" : "w-full");
const fieldCls =
  "rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50";
export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(fieldCls, W(className), "h-9", className)} />;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cn(fieldCls, W(className), "py-2", className)} />;
export function Select({ className, options, placeholder, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string | number; label: string })[]; placeholder?: string }) {
  return (
    <select {...p} className={cn(fieldCls, W(className), "h-9 pr-8", className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}
export function Field({ label, error, required, children, className, hint }: { label: string; error?: string; required?: boolean; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-muted">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {children}
      {error ? <span className="block text-xs text-red-600">{error}</span> : hint ? <span className="block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export const Card = ({ className, children, title, action, pad = true }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; pad?: boolean }) => (
  <section className={cn("min-w-0 rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(15,27,45,0.04)]", className)}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {action}
      </div>
    )}
    <div className={pad ? "p-4" : ""}>{children}</div>
  </section>
);

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-100",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
const STATUS_TONE: Record<string, string> = {
  booked: "blue", "checked-in": "amber", "in-consultation": "violet", completed: "green", cancelled: "slate", "no-show": "red",
  available: "green", occupied: "blue", cleaning: "amber", maintenance: "slate", admitted: "blue", discharged: "green",
  ordered: "blue", requested: "blue", "sample-collected": "amber", scheduled: "amber", processing: "violet", scanned: "violet", reported: "green",
  pending: "amber", dispensed: "green", received: "green", paid: "green", partial: "amber", unpaid: "red", refunded: "slate",
  none: "slate", submitted: "blue", approved: "teal", rejected: "red", settled: "green", open: "red", "in-progress": "amber", resolved: "green", closed: "slate",
  draft: "slate", sent: "green", active: "green", "on-leave": "amber", inactive: "slate", "simulated-sent": "teal", severe: "red", moderate: "amber", mild: "slate",
  high: "red", medium: "amber", low: "slate", urgent: "red", stat: "red", routine: "slate", tele: "violet", "in-person": "slate",
};
export function Badge({ children, tone, className }: { children: ReactNode; tone?: string; className?: string }) {
  const t = tone || STATUS_TONE[String(children).toLowerCase()] || "slate";
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset capitalize whitespace-nowrap", TONES[t], className)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => (e.preventDefault(), onClose())}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-white p-0 text-ink shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5 no-print">
            <h2 className="text-base font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded p-1 text-muted hover:bg-slate-100" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-3 no-print">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Promise-based confirmation dialog: const ok = await confirm("Delete?") */
const ConfirmCtx = createContext<(msg: string, opts?: { danger?: boolean; label?: string }) => Promise<boolean>>(async () => false);
const ToastCtx = createContext<(msg: string, kind?: "ok" | "error") => void>(() => {});
export const useConfirm = () => useContext(ConfirmCtx);
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [c, setC] = useState<{ msg: string; danger?: boolean; label?: string; resolve: (v: boolean) => void } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: "ok" | "error" }[]>([]);
  const confirm = (msg: string, opts: { danger?: boolean; label?: string } = {}) => new Promise<boolean>((resolve) => setC({ msg, ...opts, resolve }));
  const toast = (msg: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  const close = (v: boolean) => (c?.resolve(v), setC(null));
  return (
    <ConfirmCtx.Provider value={confirm}>
      <ToastCtx.Provider value={toast}>
        {children}
        <Modal open={!!c} onClose={() => close(false)} title="Please confirm"
          footer={<><Button variant="secondary" onClick={() => close(false)}>Cancel</Button><Button variant={c?.danger ? "danger" : "primary"} onClick={() => close(true)}>{c?.label || "Confirm"}</Button></>}>
          <p className="text-sm text-muted">{c?.msg}</p>
        </Modal>
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={cn("pointer-events-auto flex items-start gap-2 rounded-lg border bg-white px-3.5 py-3 text-sm shadow-lg", t.kind === "ok" ? "border-teal-100" : "border-red-200")}>
              {t.kind === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />}
              <span>{t.msg}</span>
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Spinner = ({ label = "Loading…" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
    <Loader2 className="size-4 animate-spin text-brand-600" /> {label}
  </div>
);
export const Empty = ({ title = "No records yet", hint, action }: { title?: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <Inbox className="size-8 text-slate-300" />
    <p className="text-sm font-medium text-ink">{title}</p>
    {hint && <p className="max-w-sm text-xs text-muted">{hint}</p>}
    {action}
  </div>
);
export const ErrorBox = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
    <span className="flex items-center gap-2"><AlertTriangle className="size-4" /> {message}</span>
    {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}
  </div>
);
export const PageHeader = ({ title, subtitle, actions, module }: { title: string; subtitle?: string; actions?: ReactNode; module?: string }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      {module && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">{module}</p>}
      <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);
export const Stat = ({ label, value, sub, icon: Icon, tone = "brand" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: any; tone?: "brand" | "teal" | "amber" | "red" }) => {
  const t = { brand: "text-brand-600 bg-brand-50", teal: "text-teal-600 bg-teal-50", amber: "text-amber-700 bg-amber-50", red: "text-red-600 bg-red-50" }[tone];
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted">{label}</p>
        {Icon && <span className={cn("rounded-md p-1.5", t)}><Icon className="size-4" /></span>}
      </div>
      <p className="num mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
};
export const DemoTag = ({ children = "Simulated" }: { children?: ReactNode }) => (
  <span className="inline-flex items-center rounded border border-dashed border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">{children}</span>
);
export const KV = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
    {items.map(([k, v]) => (
      <div key={k}>
        <dt className="text-xs text-muted">{k}</dt>
        <dd className="mt-0.5 font-medium text-ink">{v || "—"}</dd>
      </div>
    ))}
  </dl>
);
