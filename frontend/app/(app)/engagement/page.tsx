"use client";
import { useState } from "react";
import { BellRing, Cake, CalendarClock, HeartPulse, Megaphone, MessageCircle, Repeat, Send, Star } from "lucide-react";
import { api, fmtDate, fmtDateTime, today, useApi, type Row } from "@/lib/api";
import { CrudSection, DataTable, PatientSelect } from "@/components/data";
import { Bars, Donut } from "@/components/charts";
import { Badge, Button, Card, DemoTag, ErrorBox, Field, PageHeader, Select, Spinner, Stat, Tabs, Textarea, useConfirm, useToast } from "@/components/ui";

export default function Engagement() {
  const [tab, setTab] = useState("overview");
  const [k, setK] = useState(0);
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <>
      <PageHeader module="Module 6 · Patient Engagement" title="Patient engagement" subtitle="Reminders, messaging, feedback, complaints, campaigns and retention."
        actions={<span className="flex items-center gap-2 text-xs text-muted"><DemoTag /> WhatsApp / SMS delivery is simulated and logged only</span>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "overview", label: "Satisfaction & retention" }, { id: "msg", label: "Messages" }, { id: "rem", label: "Reminders" },
        { id: "fb", label: "Feedback" }, { id: "cmp", label: "Complaints" }, { id: "camp", label: "Campaigns" }]} />
      {tab === "overview" && <Overview k={k} />}
      {tab === "msg" && <Messages k={k} onSent={() => setK(k + 1)} />}
      {tab === "rem" && <Reminders onRun={() => setK(k + 1)} />}
      {tab === "fb" && (
        <CrudSection res="feedback" title="Feedback" canDelete={false} defaults={{ rating: 5, category: "Overall" }}
          filters={[{ key: "rating", label: "Rating", options: ["5", "4", "3", "2", "1"] }, { key: "category", label: "Category", options: ["Overall", "Doctor", "Nursing", "Billing", "Facilities", "Pharmacy"] }]}
          columns={[{ key: "created_at", label: "Date", render: (r) => fmtDate(r.created_at) }, { key: "patient_name", label: "Patient", render: (r) => r.patient_name },
            { key: "rating", label: "Rating", render: (r) => <span className="text-amber-500">{"★".repeat(r.rating)}<span className="text-slate-200">{"★".repeat(5 - r.rating)}</span></span> },
            { key: "category", label: "Category", render: (r) => <Badge tone="slate">{r.category}</Badge> }, { key: "comment", label: "Comment" }]}
          fields={[{ name: "patient_id", label: "Patient", type: "patient", required: true, span: 2 }, { name: "rating", label: "Rating (1–5)", type: "number", min: 1, max: 5, required: true },
            { name: "category", label: "Category", type: "select", options: ["Overall", "Doctor", "Nursing", "Billing", "Facilities", "Pharmacy"] }, { name: "comment", label: "Comment", type: "textarea" }]} />
      )}
      {tab === "cmp" && (
        <CrudSection res="complaints" title="Complaint" canDelete={false} defaults={{ priority: "medium", status: "open", category: "Service" }} createLabel="Log complaint"
          filters={[{ key: "status", label: "Status", options: ["open", "in-progress", "resolved", "closed"] }, { key: "priority", label: "Priority", options: ["high", "medium", "low"] }]}
          columns={[{ key: "ticket_no", label: "Ticket", render: (r) => <span className="font-mono text-xs">{r.ticket_no}</span> }, { key: "created_at", label: "Raised", render: (r) => fmtDate(r.created_at) },
            { key: "patient_name", label: "Patient", render: (r) => r.patient_name || "—" }, { key: "subject", label: "Subject", render: (r) => <span className="font-medium">{r.subject}</span> },
            { key: "priority", label: "Priority", render: (r) => <Badge>{r.priority}</Badge> }, { key: "assigned_to", label: "Assigned" }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }]}
          fields={[{ name: "patient_id", label: "Patient", type: "patient", span: 2 }, { name: "subject", label: "Subject", required: true, span: 2 }, { name: "description", label: "Description", type: "textarea" },
            { name: "category", label: "Category", type: "select", options: ["Service", "Billing", "Clinical", "Facilities", "Staff behaviour"] }, { name: "priority", label: "Priority", type: "select", options: ["high", "medium", "low"] },
            { name: "status", label: "Status", type: "select", options: ["open", "in-progress", "resolved", "closed"] }, { name: "assigned_to", label: "Assigned to" }, { name: "resolution", label: "Resolution (sent to patient on resolve)", type: "textarea" }]} />
      )}
      {tab === "camp" && (
        <CrudSection res="campaigns" title="Campaign" defaults={{ channel: "WhatsApp", audience: "all", status: "draft", scheduled_date: today() }}
          filters={[{ key: "status", label: "Status", options: ["draft", "sent"] }]}
          columns={[{ key: "name", label: "Campaign", render: (r) => <span className="font-medium">{r.name}</span> }, { key: "channel", label: "Channel", render: (r) => <Badge tone={r.channel === "WhatsApp" ? "teal" : "blue"}>{r.channel}</Badge> },
            { key: "audience", label: "Audience", render: (r) => <Badge tone="slate">{r.audience}</Badge> }, { key: "scheduled_date", label: "Date", render: (r) => fmtDate(r.scheduled_date) },
            { key: "sent_count", label: "Reached", render: (r) => <span className="num">{r.sent_count || 0}</span> }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }]}
          fields={[{ name: "name", label: "Campaign name", required: true, span: 2 }, { name: "channel", label: "Channel", type: "select", options: ["WhatsApp", "SMS", "Email"] },
            { name: "audience", label: "Audience", type: "select", options: [{ value: "all", label: "All active patients" }, { value: "female", label: "Female patients" }, { value: "male", label: "Male patients" }, { value: "seniors", label: "Seniors (60+)" }] },
            { name: "scheduled_date", label: "Date", type: "date" }, { name: "message", label: "Message — use {name} for the patient's name", type: "textarea", required: true }]}
          extraActions={(r, reload) => r.status === "draft" && <Button size="sm" variant="teal" onClick={async () => {
            if (!(await confirm(`Send "${r.name}" to the ${r.audience} audience via ${r.channel}? (simulated)`))) return;
            try { const c = await api<Row>(`/api/campaigns/${r.id}/send`, { body: {} }); toast(`Campaign sent to ${c.sent_count} patients (simulated)`); reload(); } catch (e: any) { toast(e.message, "error"); }
          }}><Megaphone className="size-3.5" /> Send</Button>} />
      )}
    </>
  );
}

function Overview({ k }: { k: number }) {
  const { data: d, error, reload } = useApi<Row>(`/api/engagement/summary?_k=${k}`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Average rating" value={d.avg_rating ? `${d.avg_rating} / 5` : "—"} sub={`${d.responses} responses`} icon={Star} tone="amber" />
        <Stat label="Promoters (4–5★)" value={`${d.promoters_pct}%`} icon={HeartPulse} tone="teal" />
        <Stat label="Returning patients" value={`${d.retention_pct}%`} sub={`${d.returning} of ${d.patients_visited} visited`} icon={Repeat} />
        <Stat label="Open complaints" value={(d.complaints.open || 0) + (d.complaints["in-progress"] || 0)} sub={`${d.complaints.resolved || 0} resolved`} icon={MessageCircle} tone="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Rating distribution"><Bars data={d.distribution} x="name" bars={[{ key: "value", label: "Responses", color: "#d99a1e" }]} /></Card>
        <Card title="Average rating by area"><Bars data={d.by_category} x="name" bars={[{ key: "value", label: "Avg rating", color: "#13a08d" }]} /></Card>
        <Card title="Messages by channel"><Donut data={d.notifications_by_channel} /></Card>
      </div>
      <Card title="Messages by purpose"><Bars data={d.notifications_by_category} x="name" bars={[{ key: "value", label: "Messages" }]} height={200} /></Card>
    </div>
  );
}

function Messages({ k, onSent }: { k: number; onSent: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Row>({ channel: "WhatsApp", category: "manual", message: "" });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <DataTable res="notifications" reloadKey={k} pageSize={12} searchPlaceholder="Search message, patient, UHID"
          filters={[{ key: "channel", label: "Channel", options: ["WhatsApp", "SMS", "Email"] }, { key: "category", label: "Purpose", options: ["appointment", "reminder", "follow-up", "lab", "billing", "prescription", "birthday", "wellness", "campaign", "complaint", "registration", "manual"] }]}
          columns={[{ key: "created_at", label: "Sent", render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</span> },
            { key: "patient_name", label: "To", render: (r) => <span className="whitespace-nowrap">{r.patient_name}<span className="block text-xs text-muted">{r.phone}</span></span> },
            { key: "channel", label: "Channel", render: (r) => <Badge tone={r.channel === "WhatsApp" ? "teal" : "blue"}>{r.channel}</Badge> },
            { key: "message", label: "Message", render: (r) => <span className="line-clamp-2 text-xs">{r.message}</span> }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }]} />
      </div>
      <Card title={<span className="flex items-center gap-2">Compose <DemoTag /></span>}>
        <div className="space-y-3">
          <Field label="Patient" required><PatientSelect value={v.patient_id} onChange={(id) => setV({ ...v, patient_id: id })} /></Field>
          <Field label="Channel"><Select value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value })} options={["WhatsApp", "SMS", "Email"]} /></Field>
          <Field label="Purpose"><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} options={["manual", "follow-up", "reminder", "billing", "wellness"]} /></Field>
          <Field label="Message" required><Textarea rows={4} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} /></Field>
          <Button className="w-full" disabled={!v.patient_id || !v.message.trim()} onClick={async () => {
            try { await api("/api/notifications/send", { body: v }); toast("Message logged (simulated delivery)"); setV({ ...v, message: "" }); onSent(); } catch (e: any) { toast(e.message, "error"); }
          }}><Send className="size-4" /> Send</Button>
        </div>
      </Card>
    </div>
  );
}

function Reminders({ onRun }: { onRun: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (kind: string) => {
    setBusy(kind);
    try { const r = await api<Row>("/api/reminders/run", { body: { kind } }); toast(`${r.sent} ${kind} reminder(s) sent (simulated)`); onRun(); } catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  };
  const items = [
    ["appointment", "Appointment reminders", "WhatsApp to every patient booked for tomorrow, with time and token.", CalendarClock],
    ["followup", "Follow-up reminders", "SMS to patients whose doctor-set follow-up date falls in the next 7 days.", BellRing],
    ["birthday", "Birthday greetings", "WhatsApp wishes to patients whose birthday is today.", Cake],
    ["wellness", "Senior wellness reminders", "Annual health-check invitation to patients aged 60+.", HeartPulse],
  ] as const;
  return (
    <>
      <p className="mb-3 text-sm text-muted">In production these run on a scheduler (e.g. daily 8 AM job) through a WhatsApp Business / SMS gateway. Here each run is triggered manually and every message is written to the log.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([k, t, d, Icon]) => (
          <Card key={k}>
            <div className="flex items-start gap-3">
              <span className="rounded-md bg-teal-50 p-2 text-teal-700"><Icon className="size-5" /></span>
              <div className="flex-1"><p className="font-medium">{t}</p><p className="mt-0.5 text-sm text-muted">{d}</p></div>
              <Button size="sm" variant="secondary" loading={busy === k} onClick={() => run(k)}>Run now</Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
