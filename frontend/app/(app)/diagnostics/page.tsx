"use client";
import { useState } from "react";
import { ClipboardCheck, FlaskConical, ScanLine, TestTube } from "lucide-react";
import { api, fmtDateTime, getSession, useApi, type Row } from "@/lib/api";
import { DataTable } from "@/components/data";
import { PrintDoc } from "@/components/clinical";
import { Badge, Button, ErrorBox, Field, Input, KV, Modal, PageHeader, Stat, Tabs, Textarea, useToast } from "@/components/ui";

const LAB_NEXT: Record<string, [string, string]> = { ordered: ["sample-collected", "Collect sample"], "sample-collected": ["processing", "Start processing"] };
const RAD_NEXT: Record<string, [string, string]> = { requested: ["scheduled", "Schedule"], scheduled: ["scanned", "Mark scanned"] };

export default function Diagnostics() {
  const toast = useToast();
  const role = getSession()!.user.role;
  const canWork = role === "admin" || role === "lab";
  const [tab, setTab] = useState("lab");
  const [k, setK] = useState(0);
  const [entry, setEntry] = useState<Row | null>(null);
  const [view, setView] = useState<Row | null>(null);
  const [v, setV] = useState<Row>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stats = useApi<{ items: Row[] }>(`/api/r/lab-orders?limit=500&_k=${k}`);
  const all = stats.data?.items || [];
  const rad = tab === "rad";
  const move = async (r: Row, status: string) => {
    try { await api(`/api/r/lab-orders/${r.id}`, { method: "PATCH", body: { status } }); toast(`${r.test_name} → ${status}`); setK(k + 1); } catch (e: any) { toast(e.message, "error"); }
  };
  const save = async () => {
    if (!(rad ? v.findings : v.result)?.trim()) return setErr(rad ? "Findings are required" : "Result is required");
    setBusy(true);
    try {
      await api(`/api/r/lab-orders/${entry!.id}`, { method: "PATCH", body: { ...v, status: rad ? "reported" : "completed" } });
      toast("Report finalised · patient notified by SMS (simulated)");
      setEntry(null);
      setK(k + 1);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const next = rad ? RAD_NEXT : LAB_NEXT;
  return (
    <>
      <PageHeader module="Module 5 · Diagnostics" title="Laboratory & radiology" subtitle="Doctor-ordered investigations: sample tracking, result entry and imaging reports." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Lab · awaiting sample" value={all.filter((x) => x.status === "ordered").length} icon={TestTube} tone="amber" />
        <Stat label="Lab · in process" value={all.filter((x) => ["sample-collected", "processing"].includes(x.status)).length} icon={FlaskConical} />
        <Stat label="Imaging · pending" value={all.filter((x) => ["requested", "scheduled", "scanned"].includes(x.status)).length} icon={ScanLine} />
        <Stat label="Reports finalised" value={all.filter((x) => ["completed", "reported"].includes(x.status)).length} icon={ClipboardCheck} tone="teal" />
      </div>
      <Tabs tabs={[{ id: "lab", label: "Laboratory worklist" }, { id: "rad", label: "Radiology (X-ray / CT / MRI / USG)" }]} value={tab} onChange={setTab} />
      <DataTable key={tab} res="lab-orders" params={{ category: rad ? "radiology" : "lab" }} reloadKey={k} searchPlaceholder="Search test, sample ID, patient"
        filters={[{ key: "status", label: "Status", options: rad ? ["requested", "scheduled", "scanned", "reported", "cancelled"] : ["ordered", "sample-collected", "processing", "completed", "cancelled"] },
          { key: "priority", label: "Priority", options: ["routine", "urgent", "stat"] }, ...(rad ? [{ key: "modality", label: "Modality", options: ["X-ray", "CT", "MRI", "USG"] }] : [])]}
        columns={[
          { key: "id", label: "Order", render: (r) => <span className="num text-xs">#{r.id}</span> },
          { key: "test_name", label: rad ? "Study" : "Test", render: (r) => <span className="font-medium">{r.test_name}{rad && <span className="ml-1.5"><Badge tone="violet">{r.modality}</Badge></span>}</span> },
          { key: "patient_name", label: "Patient", render: (r) => <>{r.patient_name}<span className="block text-xs text-muted">{r.patient_uhid}</span></> },
          { key: "doctor_name", label: "Ordered by", render: (r) => r.doctor_name },
          ...(rad ? [] : [{ key: "sample_id", label: "Sample ID", render: (r: Row) => <span className="font-mono text-xs">{r.sample_id || "—"}</span> }]),
          { key: "priority", label: "Priority", render: (r) => <Badge>{r.priority}</Badge> },
          { key: "created_at", label: "Ordered", render: (r) => fmtDateTime(r.created_at) },
          { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
        ]}
        actions={(r) => (
          <>
            {canWork && next[r.status] && <Button size="sm" variant="secondary" onClick={() => move(r, next[r.status][0])}>{next[r.status][1]}</Button>}
            {canWork && (r.status === "processing" || r.status === "scanned") && <Button size="sm" onClick={() => (setEntry(r), setV({ result: r.result || "", reference_range: r.reference_range || "", findings: r.findings || "", impression: r.impression || "" }), setErr(null))}>Enter {rad ? "report" : "result"}</Button>}
            {["completed", "reported"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setView(r)}>View report</Button>}
          </>
        )} />
      <Modal open={!!entry} onClose={() => setEntry(null)} title={`${rad ? "Imaging report" : "Result entry"} · ${entry?.test_name}`} wide
        footer={<><Button variant="secondary" onClick={() => setEntry(null)}>Cancel</Button><Button onClick={save} loading={busy}>Finalise & release</Button></>}>
        <div className="space-y-3">
          {err && <ErrorBox message={err} />}
          <p className="text-sm text-muted">{entry?.patient_name} · {entry?.patient_uhid} {entry?.sample_id && `· Sample ${entry.sample_id}`}</p>
          {rad ? (
            <>
              <Field label="Findings" required><Textarea rows={6} value={v.findings} onChange={(e) => setV({ ...v, findings: e.target.value })} /></Field>
              <Field label="Impression (radiologist)"><Input value={v.impression} onChange={(e) => setV({ ...v, impression: e.target.value })} /></Field>
              <p className="text-xs text-muted">Image storage (PACS/DICOM viewer) is a production integration; this MVP stores the text report.</p>
            </>
          ) : (
            <>
              <Field label="Result" required><Textarea rows={4} value={v.result} onChange={(e) => setV({ ...v, result: e.target.value })} placeholder="e.g. Hb 13.2 g/dL; WBC 7,400 /µL; Platelets 2.6 L/µL" /></Field>
              <Field label="Reference range"><Input value={v.reference_range} onChange={(e) => setV({ ...v, reference_range: e.target.value })} /></Field>
            </>
          )}
        </div>
      </Modal>
      <Modal open={!!view} onClose={() => setView(null)} title="Report" wide>
        {view && <PrintDoc title={view.category === "radiology" ? "Radiology Report" : "Laboratory Report"} meta={<>Order #{view.id}<br />{fmtDateTime(view.reported_at)}</>}>
          <KV items={[["Patient", view.patient_name], ["UHID", view.patient_uhid], ["Referred by", view.doctor_name], ["Test", view.test_name], ["Sample", view.sample_id], ["Reported by", view.reported_by]]} />
          <div className="mt-4 rounded-md border border-line p-3 text-sm">
            <p className="whitespace-pre-wrap">{view.result || view.findings}</p>
            {view.reference_range && <p className="mt-2 text-xs text-muted">Reference: {view.reference_range}</p>}
            {view.impression && <p className="mt-2"><b>Impression:</b> {view.impression}</p>}
          </div>
        </PrintDoc>}
      </Modal>
    </>
  );
}
