"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { getSession, setSession, type Session } from "@/lib/api";
import { allowed, homeFor, NAV, ROLE_LABEL } from "@/lib/nav";
import { Logo } from "@/components/brand";
import { Spinner, cn } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [s, setS] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const cur = getSession();
    if (!cur) return router.replace("/login");
    if (!allowed(cur.user.role, path)) return router.replace(homeFor(cur.user.role));
    setS(cur);
  }, [path, router]);
  useEffect(() => setOpen(false), [path]);
  if (!s) return <Spinner label="Checking session…" />;
  const items = NAV.filter((n) => n.roles.includes(s.user.role));
  let lastModule: string | undefined;
  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-line px-5"><Logo /></div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {items.map((n) => {
          const header = n.module && n.module !== lastModule ? n.module : null;
          lastModule = n.module;
          const active = path.startsWith(n.href);
          return (
            <div key={n.href}>
              {header && <p className="px-2.5 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{header}</p>}
              <Link href={n.href} className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-ink")}>
                <n.icon className={cn("size-4", active ? "text-brand-600" : "text-slate-400")} />
                {n.label}
              </Link>
            </div>
          );
        })}
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-teal-100 text-xs font-semibold text-teal-700">
            {s.user.name?.replace("Dr. ", "").split(" ").map((x) => x[0]).slice(0, 2).join("")}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{s.user.name}</p>
            <p className="text-xs text-muted">{ROLE_LABEL[s.user.role]}</p>
          </div>
          <button title="Sign out" aria-label="Sign out" onClick={() => (setSession(null), router.replace("/login"))} className="rounded p-1.5 text-muted hover:bg-slate-100 hover:text-ink">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </nav>
  );
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded p-1 text-muted" aria-label="Close menu"><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded p-1.5 text-ink" aria-label="Open menu"><Menu className="size-5" /></button>
        <Logo />
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
