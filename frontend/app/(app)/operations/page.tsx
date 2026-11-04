"use client";
import { useState } from "react";
import Link from "next/link";
import { BedDouble, LogOut, Plus } from "lucide-react";
import { api, fmtDate, fmtDateTime, getSession, today, useApi, type Row } from "@/lib/api";
import { CrudSection, DataTable, FormModal } from "@/components/data";
import { DischargeForm } from "@/components/clinical";
import { Donut } from "@/components/charts";
import { Badge, Button, Card, ErrorBox, Modal, PageHeader, Spinner, Stat, Tabs, cn, useToast } from "@/components/ui";

const ROLES = ["doctor", "nurse", "receptionist", "lab", "pharmacist", "accountant", "admin"];

export default function Operations() {
  const role = getSession()!.user.role;
  const admin = role === "admin";
  const [tab, setTab] = useState("overview");
  const tabs = [
    { id: "overview", label: "Overview" }, { id: "adm", label: "Admissions (IPD)" }, { id: "beds", label: "Beds & rooms" },
    { id: "staff", label: "Staff" }, { id: "duty", label: "Duty roster" }, { id: "dept", label: "Departments" }, { id: "branch", label: "Branches" },
    ...(admin ? [{ id: "rbac", label: "Access control" }, { id: "audit", label: "Audit log" }] : []),
  ];
  return (
    <>
      <PageHeader module="Module 3 · Hospital Operations" title="Hospital operations" subtitle="OPD/IPD flow, admissions, beds, staff, duties, departments and access control." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "overview" && <Overview />}
      {tab === "adm" && <Admissions />}
      {tab === "beds" && <Beds />}
      {tab === "staff" && (
        <CrudSection res="staff" title="Staff member" canWrite={admin} canDelete={false} searchPlaceholder="Search name, role, specialization"
          filters={[{ key: "role", label: "Role", options: ROLES }, { key: "status", label: "Status", options: ["active", "on-leave", "inactive"] }]}
          columns={[
            { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> }, { key: "role", label: "Role", render: (r) => <Badge tone="blue">{r.role}</Badge> },
            { key: "department_name", label: "Department", render: (r) => r.department_name }, { key: "specialization", label: "Specialization" },
            { key: "available_days", label: "Availability", render: (r) => r.role === "doctor" ? <span className="text-xs">{r.available_days} · {r.slot_start}–{r.slot_end}</span> : "—" },
            { key: "phone", label: "Phone", sortable: false }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
          ]}
          defaults={{ status: "active", available_days: "Mon,Tue,Wed,Thu,Fri,Sat", slot_start: "09:00", slot_end: "13:00", slot_minutes: 15 }}
          fields={[
            { name: "name", label: "Full name", required: true }, { name: "role", label: "Role", type: "select", options: ROLES, required: true },
            { name: "department_id", label: "Department", optionsFrom: { res: "departments" } }, { name: "specialization", label: "Specialization" },
            { name: "qualification", label: "Qualification" }, { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" },
            { name: "consult_fee", label: "Consultation fee (₹)", type: "number", min: 0 }, { name: "available_days", label: "Available days", hint: "Comma separated: Mon,Tue,…" },
            { name: "slot_start", label: "OPD start", type: "time" }, { name: "slot_end", label: "OPD end", type: "time" }, { name: "slot_minutes", label: "Slot (min)", type: "number", min: 5, max: 60 },
            { name: "status", label: "Status", type: "select", options: ["active", "on-leave", "inactive"] },
          ]} />
      )}
      {tab === "duty" && (
        <CrudSection res="duties" title="Duty" canWrite={admin || role === "nurse"} params={{}} defaults={{ date: today(), shift: "Morning", status: "scheduled" }}
          filters={[{ key: "shift", label: "Shift", options: ["Morning", "Evening", "Night"] }, { key: "date", label: "Date", options: [today()] }]}
          columns={[{ key: "date", label: "Date", render: (r) => fmtDate(r.date) }, { key: "staff_name", label: "Staff", render: (r) => <>{r.staff_name} <span className="text-xs text-muted">· {r.staff_role}</span></> },
            { key: "shift", label: "Shift", render: (r) => <Badge tone={r.shift === "Night" ? "violet" : r.shift === "Evening" ? "amber" : "blue"}>{r.shift}</Badge> }, { key: "area", label: "Area" }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }]}
          fields={[{ name: "staff_id", label: "Staff", required: true, optionsFrom: { res: "staff", label: (r) => `${r.name} (${r.role})` } }, { name: "date", label: "Date", type: "date", required: true },
            { name: "shift", label: "Shift", type: "select", options: ["Morning", "Evening", "Night"], required: true }, { name: "area", label: "Area / ward" },
            { name: "status", label: "Status", type: "select", options: ["scheduled", "on-duty", "completed", "swapped"] }]} />
      )}
      {tab === "dept" && (
        <CrudSection res="departments" title="Department" canWrite={admin} canDelete={admin}
          columns={[{ key: "code", label: "Code" }, { key: "name", label: "Department", render: (r) => <span className="font-medium">{r.name}</span> }, { key: "description", label: "Description" }]}
          fields={[{ name: "name", label: "Name", required: true }, { name: "code", label: "Code" }, { name: "description", label: "Description", span: 2 }]} />
      )}
      {tab === "branch" && (
        <>
          <p className="mb-3 text-sm text-muted">Patients, staff, beds, appointments, invoices and expenses carry a <code className="rounded bg-slate-100 px-1">branch_id</code>. Branch-scoped views and inter-branch transfers are a production extension.</p>
          <CrudSection res="branches" title="Branch" canWrite={admin} canDelete={false}
            columns={[{ key: "name", label: "Branch", render: (r) => <span className="font-medium">{r.name}</span> }, { key: "city", label: "City" }, { key: "address", label: "Address" }, { key: "phone", label: "Phone" }]}
            fields={[{ name: "name", label: "Name", required: true }, { name: "city", label: "City" }, { name: "address", label: "Address", span: 2 }, { name: "phone", label: "Phone" }]} />
        </>
      )}
      {tab === "rbac" && <Access />}
      {tab === "audit" && (
        <DataTable res="audit-logs" pageSize={20} filters={[{ key: "action", label: "Action", options: ["create", "update", "delete", "dispense", "payment", "refund", "discharge", "generate"] }]}
          columns={[{ key: "created_at", label: "When", render: (r) => fmtDateTime(r.created_at) }, { key: "user", label: "User" }, { key: "role", label: "Role" },
            { key: "action", label: "Action", render: (r) => <Badge tone="blue">{r.action}</Badge> }, { key: "entity", label: "Entity" }, { key: "entity_id", label: "ID" }, { key: "detail", label: "Detail" }]} />
      )}
    </>
  );
}

function Overview() {
  const { data: d, error, reload } = useApi<Row>("/api/dashboard");
  const flow = useApi<{ items: Row[] }>(`/api/r/appointments?date=${today()}&limit=200`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return <Spinner />;
  const stages = ["booked", "checked-in", "in-consultation", "completed"];
  const counts = Object.fromEntries(stages.map((s) => [s, (flow.data?.items || []).filter((a) => a.status === s).length]));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="OPD today" value={d.appointments_today} /><Stat label="IPD admitted" value={d.admitted} tone="teal" />
        <Stat label="Bed occupancy" value={`${d.occupancy_pct}%`} sub={`${d.beds_occupied} of ${d.beds_total}`} icon={BedDouble} />
        <Stat label="Pending diagnostics" value={d.pending_labs} tone="amber" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="OPD workflow status · today" className="lg:col-span-2">
          <div className="grid grid-cols-4 gap-2">
            {stages.map((s, i) => (
              <div key={s} className="relative rounded-md border border-line p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{i + 1}. {s}</p>
                <p className="num mt-1 text-2xl font-semibold">{counts[s]}</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(100 * counts[s]) / Math.max(1, flow.data?.items.length || 1)}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Bed status"><Donut data={d.bed_status} height={180} /></Card>
      </div>
    </div>
  );
}

function Admissions() {
  const toast = useToast();
  const [k, setK] = useState(0);
  const [admit, setAdmit] = useState(false);
  const [dis, setDis] = useState<Row | null>(null);
  const [dv, setDv] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const role = getSession()!.user.role;
  return (
    <>
      <DataTable res="admissions" reloadKey={k} filters={[{ key: "status", label: "Status", options: ["admitted", "discharged"] }]} searchPlaceholder="Search patient or reason"
        toolbar={<Button onClick={() => setAdmit(true)}><Plus className="size-4" /> Admit patient</Button>}
        columns={[
          { key: "patient_name", label: "Patient", render: (r) => <Link href={`/patients/${r.patient_id}`} className="font-medium hover:text-brand-700">{r.patient_name}<span className="block text-xs font-normal text-muted">{r.patient_uhid}</span></Link> },
          { key: "bed_label", label: "Bed", render: (r) => r.bed_label }, { key: "doctor_name", label: "Consultant", render: (r) => r.doctor_name }, { key: "reason", label: "Reason" },
          { key: "admit_date", label: "Admitted", render: (r) => fmtDate(r.admit_date) }, { key: "discharge_date", label: "Discharged", render: (r) => fmtDate(r.discharge_date) },
          { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
        ]}
        actions={(r) => r.status === "admitted" && ["admin", "doctor", "nurse"].includes(role) && <Button size="sm" variant="secondary" onClick={() => (setDis(r), setDv({ condition_at_discharge: "Stable" }))}><LogOut className="size-3.5" /> Discharge</Button>} />
      <FormModal open={admit} onClose={() => setAdmit(false)} title="Admit patient" submitLabel="Admit & allocate bed"
        fields={[{ name: "patient_id", label: "Patient", type: "patient", required: true, span: 2 },
          { name: "bed_id", label: "Available bed", required: true, optionsFrom: { res: "beds", params: { status: "available" }, label: (b) => `${b.ward} · ${b.bed_no} (${b.bed_type}, ₹${b.daily_rate}/day)` } },
          { name: "doctor_id", label: "Consultant", required: true, optionsFrom: { res: "staff", params: { role: "doctor" } } },
          { name: "admit_date", label: "Admission date", type: "date", required: true }, { name: "reason", label: "Reason for admission", required: true }]}
        initial={{ admit_date: today() }}
        onSubmit={async (v) => { await api("/api/r/admissions", { body: v }); toast("Patient admitted · bed marked occupied"); setK(k + 1); }} />
      <Modal open={!!dis} onClose={() => setDis(null)} title={`Discharge · ${dis?.patient_name}`} wide
        footer={<><Button variant="secondary" onClick={() => setDis(null)}>Cancel</Button><Button loading={busy} onClick={async () => {
          setBusy(true);
          try { await api(`/api/admissions/${dis!.id}/discharge`, { body: dv }); toast("Discharged · bed charges posted · bed sent for cleaning"); setDis(null); setK(k + 1); }
          catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
        }}>Discharge patient</Button></>}>
        <DischargeForm value={dv} setValue={setDv} />
      </Modal>
    </>
  );
}

function Beds() {
  const toast = useToast();
  const role = getSession()!.user.role;
  const canWrite = ["admin", "nurse", "receptionist"].includes(role);
  const { data, reload } = useApi<{ items: Row[] }>("/api/r/beds?limit=500&sort=id&order=asc");
  const [k, setK] = useState(0);
  const wards = Object.entries((data?.items || []).reduce((acc: Record<string, Row[]>, b) => ((acc[b.ward] ||= []).push(b), acc), {}));
  const tone: Record<string, string> = { available: "border-emerald-200 bg-emerald-50 text-emerald-800", occupied: "border-brand-200 bg-brand-50 text-brand-700", cleaning: "border-amber-200 bg-amber-50 text-amber-800", maintenance: "border-slate-200 bg-slate-100 text-slate-500" };
  const setStatus = async (b: Row, status: string) => {
    try { await api(`/api/r/beds/${b.id}`, { method: "PATCH", body: { status } }); toast(`${b.bed_no} → ${status}`); reload(); setK(k + 1); } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <div className="space-y-4">
      <Card title="Bed board" action={<div className="flex gap-2 text-xs">{Object.keys(tone).map((t) => <Badge key={t}>{t}</Badge>)}</div>}>
        <div className="space-y-4">
          {wards.map(([w, beds]) => (
            <div key={w}>
              <p className="mb-2 text-xs font-semibold text-muted">{w}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {beds.map((b) => (
                  <div key={b.id} className={cn("rounded-md border p-2 text-xs", tone[b.status])}>
                    <p className="num font-semibold">{b.bed_no}</p><p className="capitalize opacity-80">{b.status}</p>
                    {canWrite && b.status === "cleaning" && <button onClick={() => setStatus(b, "available")} className="mt-1 underline">Mark ready</button>}
                    {canWrite && b.status === "available" && <button onClick={() => setStatus(b, "maintenance")} className="mt-1 underline opacity-70">Maintenance</button>}
                    {canWrite && b.status === "maintenance" && <button onClick={() => setStatus(b, "available")} className="mt-1 underline">Restore</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <CrudSection key={k} res="beds" title="Bed" canWrite={role === "admin"} canDelete={false} defaults={{ status: "available", bed_type: "General", daily_rate: 1200 }}
        filters={[{ key: "status", label: "Status", options: ["available", "occupied", "cleaning", "maintenance"] }, { key: "bed_type", label: "Type", options: ["General", "Semi-private", "Private", "ICU"] }]}
        columns={[{ key: "ward", label: "Ward" }, { key: "room", label: "Room" }, { key: "bed_no", label: "Bed" }, { key: "bed_type", label: "Type" }, { key: "daily_rate", label: "Rate/day", render: (r) => `₹${r.daily_rate}` }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }]}
        fields={[{ name: "ward", label: "Ward", required: true }, { name: "room", label: "Room" }, { name: "bed_no", label: "Bed number", required: true },
          { name: "bed_type", label: "Type", type: "select", options: ["General", "Semi-private", "Private", "ICU"] }, { name: "daily_rate", label: "Daily rate (₹)", type: "number", min: 0, required: true },
          { name: "status", label: "Status", type: "select", options: ["available", "cleaning", "maintenance"], editable: false }]} />
    </div>
  );
}

function Access() {
  const { data } = useApi<Row[]>("/api/rbac");
  const roles = ["admin", "doctor", "nurse", "receptionist", "lab", "pharmacist", "accountant"];
  return (
    <div className="space-y-4">
      <Card title="User accounts" pad={false}>
        <div className="p-3">
          <CrudSection res="users" title="User" canDelete={false}
            filters={[{ key: "role", label: "Role", options: [...roles, "patient"] }]}
            columns={[{ key: "username", label: "Username", render: (r) => <span className="font-mono text-xs">{r.username}</span> }, { key: "name", label: "Name" }, { key: "role", label: "Role", render: (r) => <Badge tone="blue">{r.role}</Badge> },
              { key: "active", label: "Active", render: (r) => <Badge tone={r.active ? "green" : "slate"}>{r.active ? "active" : "disabled"}</Badge> }]}
            transform={(v) => { const { active, ...rest } = v; return { ...rest, active: active === true || active === "true" }; }}
            defaults={{ active: "true" }}
            fields={[{ name: "username", label: "Username", required: true, editable: false }, { name: "name", label: "Display name", required: true },
              { name: "role", label: "Role", type: "select", options: [...roles, "patient"], required: true }, { name: "password", label: "Password (min 6; leave blank to keep)", type: "password" },
              { name: "staff_id", label: "Linked staff", optionsFrom: { res: "staff", label: (r) => `${r.name} (${r.role})` } },
              { name: "active", label: "Status", type: "select", options: [{ value: "true", label: "Active" }, { value: "false", label: "Disabled" }] }]} />
        </div>
      </Card>
      <Card title="Role permission matrix (enforced by the API)" pad={false}>
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead><tr className="border-b border-line bg-slate-50/70 text-left text-muted"><th className="px-3 py-2 font-medium">Resource</th>{roles.map((r) => <th key={r} className="px-3 py-2 text-center font-medium capitalize">{r}</th>)}</tr></thead>
          <tbody>{data?.map((x) => (
            <tr key={x.resource} className="border-b border-line last:border-0"><td className="px-3 py-1.5 font-medium">{x.resource}</td>
              {roles.map((r) => <td key={r} className="px-3 py-1.5 text-center">{x.write.includes(r) ? <Badge tone="green">write</Badge> : x.read.includes(r) ? <Badge tone="blue">read</Badge> : <span className="text-slate-300">—</span>}</td>)}</tr>))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
