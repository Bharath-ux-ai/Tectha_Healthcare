"use client";
import Link from "next/link";
import { BedDouble, CalendarCheck, Clock, FlaskConical, IndianRupee, MessageSquareWarning, Pill, Star, Users } from "lucide-react";
import { fmtDateTime, getSession, inr, useApi } from "@/lib/api";
import { Bars, Donut, Lines } from "@/components/charts";
import { Badge, Card, ErrorBox, PageHeader, Spinner, Stat } from "@/components/ui";

const FLOW = [
  ["Register", "/patients"], ["Book & token", "/appointments"], ["Consult & e-Rx", "/clinical"], ["Lab result", "/diagnostics"],
  ["Dispense", "/pharmacy"], ["Invoice & pay", "/finance"], ["Follow-up", "/engagement"],
];

export default function Dashboard() {
  const { data: d, error, loading, reload } = useApi<any>("/api/dashboard");
  const name = getSession()?.user.name;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading || !d) return <Spinner />;
  const st = d.appt_status_today || {};
  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${name?.split(" ").slice(0, 2).join(" ")}`}
        subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " · TEC THA Main Hospital"} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="OPD appointments today" value={d.appointments_today} sub={`${st.completed || 0} completed · ${d.waiting} waiting`} icon={CalendarCheck} />
        <Stat label="In-patients" value={d.admitted} sub={`${d.beds_occupied}/${d.beds_total} beds · ${d.occupancy_pct}% occupancy`} icon={BedDouble} tone="teal" />
        <Stat label="Collections today" value={inr(d.collections_today)} sub={`Outstanding ${inr(d.outstanding)}`} icon={IndianRupee} />
        <Stat label="Patient satisfaction" value={d.avg_rating ? `${d.avg_rating} / 5` : "—"} sub={`${d.open_complaints} open complaints`} icon={Star} tone="amber" />
      </div>

      <Card className="mt-4" title="Integrated patient journey" action={<span className="text-xs text-muted">Each step updates the same patient record</span>}>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {FLOW.map(([label, href], i) => (
            <li key={label}>
              <Link href={href} className="flex h-full items-center gap-2 rounded-md border border-line px-3 py-2.5 text-sm hover:border-brand-200 hover:bg-brand-50">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">{i + 1}</span>
                <span className="font-medium">{label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Appointments · last 7 days" className="lg:col-span-2"><Bars data={d.appointments_week} x="date" bars={[{ key: "count", label: "Appointments" }]} /></Card>
        <Card title="Bed status"><Donut data={d.bed_status} /></Card>
        <Card title="Collections · last 7 days" className="lg:col-span-2"><Lines data={d.revenue_week} x="date" lines={[{ key: "amount", label: "Collected (₹)" }]} /></Card>
        <Card title="Department load · 7 days"><Donut data={d.department_load} /></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Work queues">
          <ul className="divide-y divide-line text-sm">
            {[
              [Users, "Patients registered", d.patients, "/patients"], [Clock, "Waiting in OPD queue", d.waiting, "/appointments"],
              [FlaskConical, "Pending lab / radiology", d.pending_labs, "/diagnostics"], [Pill, "Prescriptions to dispense", d.pending_rx, "/pharmacy"],
              [MessageSquareWarning, "Open complaints", d.open_complaints, "/engagement"],
            ].map(([Icon, label, v, href]: any) => (
              <li key={label}><Link href={href} className="flex items-center justify-between py-2.5 hover:text-brand-700">
                <span className="flex items-center gap-2 text-muted"><Icon className="size-4" />{label}</span><span className="num font-semibold text-ink">{v}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
        <Card title="Recent activity (audit trail)" className="lg:col-span-2" pad={false}>
          <ul className="divide-y divide-line text-sm">
            {d.recent_activity.map((a: any) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate"><Badge tone="blue">{a.action}</Badge> <span className="ml-1 font-medium">{a.entity}</span> <span className="text-muted">#{a.entity_id ?? "—"} by {a.user}</span></span>
                <span className="shrink-0 text-xs text-muted">{fmtDateTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
