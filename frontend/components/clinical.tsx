"use client";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Mic, MicOff, PhoneOff, Plus, Printer, Trash2, Video } from "lucide-react";
import { api, fmtDate, useApi, type Row } from "@/lib/api";
import { Logo } from "./brand";
import { Badge, Button, DemoTag, ErrorBox, Field, Input, Modal, Select, Textarea } from "./ui";

const blank = { medicine: "", dosage: "1 tab", frequency: "1-0-1", days: 5, qty: 10, instructions: "After food" };

/** Doctor-authored e-prescription. No automated suggestions: the doctor selects every medicine. */
export function RxModal({ open, onClose, patientId, encounterId, allergies = [], onDone }: { open: boolean; onClose: () => void; patientId: number; encounterId?: number; allergies?: Row[]; onDone: () => void }) {
  const { data: catalog } = useApi<Row[]>(open ? "/api/pharmacy/catalog" : null);
  const [items, setItems] = useState<Row[]>([{ ...blank }]);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) (setItems([{ ...blank }]), setNotes(""), setErr(null)); }, [open]);
  const set = (i: number, k: string, v: any) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const warn = items.flatMap((it) => allergies.filter((a) => it.medicine && it.medicine.toLowerCase().includes(String(a.allergen).toLowerCase().split(" ")[0])).map((a) => `${it.medicine} ↔ allergy: ${a.allergen}`));
  const save = async () => {
    if (items.some((i) => !i.medicine || !(Number(i.qty) > 0))) return setErr("Every line needs a medicine and quantity");
    setBusy(true);
    try {
      await api("/api/r/prescriptions", { body: { patient_id: patientId, encounter_id: encounterId, notes, items: items.map((i) => ({ ...i, qty: Number(i.qty), days: Number(i.days) })) } });
      onDone();
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New e-prescription" wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Sign & send to pharmacy</Button></>}>
      <div className="space-y-3">
        {err && <ErrorBox message={err} />}
        {warn.length > 0 && <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="size-4 shrink-0" /><div><b>Allergy alert — review before signing.</b><br />{warn.join("; ")}</div></div>}
        <datalist id="med-catalog">{catalog?.map((c) => <option key={c.name} value={c.name}>{`${c.form} · in stock ${c.stock}`}</option>)}</datalist>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-line p-3 sm:grid-cols-12">
            <Field label="Medicine" className="col-span-2 sm:col-span-4"><Input list="med-catalog" value={it.medicine} onChange={(e) => set(i, "medicine", e.target.value)} placeholder="Type to search stock" /></Field>
            <Field label="Dose" className="sm:col-span-2"><Input value={it.dosage} onChange={(e) => set(i, "dosage", e.target.value)} /></Field>
            <Field label="Frequency" className="sm:col-span-2"><Select value={it.frequency} onChange={(e) => set(i, "frequency", e.target.value)} options={["1-0-0", "0-0-1", "1-0-1", "1-1-1", "SOS"]} /></Field>
            <Field label="Days" className="sm:col-span-1"><Input type="number" min={1} value={it.days} onChange={(e) => set(i, "days", e.target.value)} /></Field>
            <Field label="Qty" className="sm:col-span-1"><Input type="number" min={1} value={it.qty} onChange={(e) => set(i, "qty", e.target.value)} /></Field>
            <div className="col-span-2 flex items-end gap-2 sm:col-span-2">
              <Input value={it.instructions} onChange={(e) => set(i, "instructions", e.target.value)} placeholder="Instructions" />
              <Button variant="ghost" size="sm" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove line"><Trash2 className="size-4 text-red-600" /></Button>
            </div>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setItems([...items, { ...blank }])}><Plus className="size-4" /> Add medicine</Button>
        <Field label="Notes to pharmacist"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export function OrderModal({ open, onClose, patientId, encounterId, onDone }: { open: boolean; onClose: () => void; patientId: number; encounterId?: number; onDone: () => void }) {
  const { data: cat } = useApi<Row>(open ? "/api/catalog/tests" : null);
  const [v, setV] = useState<Row>({ category: "lab", priority: "routine" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) (setV({ category: "lab", priority: "routine" }), setErr(null)); }, [open]);
  const list: Row[] = cat?.[v.category] || [];
  const save = async () => {
    if (!v.test_name) return setErr("Select a test");
    setBusy(true);
    try {
      await api("/api/r/lab-orders", { body: { ...v, patient_id: patientId, encounter_id: encounterId } });
      onDone();
      onClose();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Order investigation"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Place order</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {err && <div className="sm:col-span-2"><ErrorBox message={err} /></div>}
        <Field label="Type"><Select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value, test_name: "" })} options={[{ value: "lab", label: "Laboratory" }, { value: "radiology", label: "Radiology (X-ray / CT / MRI / USG)" }]} /></Field>
        <Field label="Priority"><Select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} options={["routine", "urgent", "stat"]} /></Field>
        <Field label="Test" required className="sm:col-span-2">
          <Select value={v.test_name || ""} onChange={(e) => setV({ ...v, test_name: e.target.value })} placeholder="Select test"
            options={list.map((t) => ({ value: t.name, label: `${t.name}${t.modality ? ` · ${t.modality}` : ""} — ₹${t.price}` }))} />
        </Field>
      </div>
    </Modal>
  );
}

export function TeleModal({ open, onClose, appt }: { open: boolean; onClose: () => void; appt?: Row | null }) {
  const [mic, setMic] = useState(true);
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!open) return setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2">Teleconsultation <DemoTag /></span>} wide>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-brand-900 text-white">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Video className="size-10 text-teal-100/60" />
          <p className="text-lg font-medium">{appt?.doctor_name} ↔ {appt?.patient_name}</p>
          <p className="num text-sm text-blue-100/70">Connected · {String(Math.floor(secs / 60)).padStart(2, "0")}:{String(secs % 60).padStart(2, "0")}</p>
          <p className="max-w-sm text-center text-xs text-blue-100/60">Simulated session. Production needs a HIPAA/DPDP-compliant video provider (e.g. WebRTC SFU) with consent capture.</p>
        </div>
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          <button onClick={() => setMic(!mic)} className="rounded-full bg-white/15 p-3 hover:bg-white/25" aria-label="Toggle microphone">{mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}</button>
          <button onClick={onClose} className="rounded-full bg-red-600 p-3 hover:bg-red-700" aria-label="End call"><PhoneOff className="size-4" /></button>
        </div>
      </div>
      <p className="mt-3 break-all text-xs text-muted">Room: {appt?.meeting_link}</p>
    </Modal>
  );
}

/** Printable document frame (invoice, discharge summary, prescription). */
export function PrintDoc({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <div className="print-area">
      <div className="mb-4 flex items-start justify-between border-b border-line pb-3">
        <div><Logo /><p className="mt-1 text-[11px] text-muted">TEC THA Main Hospital · Coimbatore (demo address)</p></div>
        <div className="text-right"><p className="text-sm font-semibold uppercase tracking-wide">{title}</p><div className="text-xs text-muted">{meta}</div></div>
      </div>
      {children}
      <div className="mt-4 flex justify-end no-print"><Button variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> Print</Button></div>
    </div>
  );
}

export function RxView({ rx }: { rx: Row }) {
  const items: Row[] = Array.isArray(rx.items)
    ? rx.items
    : typeof rx.items === "string"
    ? (() => { try { return JSON.parse(rx.items); } catch { return []; } })()
    : [];
  return (
    <div className="rounded-md border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-50/60 px-3 py-2 text-xs">
        <span><b>Rx #{rx.id}</b> · {rx.doctor_name} · {fmtDate(rx.created_at)}</span><Badge>{rx.status}</Badge>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {items.map((i: Row, k: number) => (
            <tr key={k} className="border-b border-line last:border-0">
              <td className="px-3 py-2 font-medium">{i.medicine}</td><td className="px-3 py-2 text-muted">{i.dosage} · {i.frequency} · {i.days}d</td>
              <td className="num px-3 py-2">×{i.qty}</td><td className="px-3 py-2 text-xs text-muted">{i.instructions}{i.dispensed?.length ? ` · batch ${i.dispensed.map((d: Row) => d.batch_no).join(", ")}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DischargeForm({ value, setValue }: { value: Row; setValue: (v: Row) => void }) {
  return (
    <div className="space-y-3">
      <Field label="Discharge summary (course in hospital, investigations, medications on discharge, advice)" required>
        <Textarea rows={7} value={value.discharge_summary || ""} onChange={(e) => setValue({ ...value, discharge_summary: e.target.value })} />
      </Field>
      <Field label="Condition at discharge"><Select value={value.condition_at_discharge || "Stable"} onChange={(e) => setValue({ ...value, condition_at_discharge: e.target.value })} options={["Stable", "Improved", "Referred", "LAMA"]} /></Field>
    </div>
  );
}
