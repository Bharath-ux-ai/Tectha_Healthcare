"use client";
import { useEffect, useState } from "react";
import { api, qs, today, useApi, type Row } from "@/lib/api";
import { PatientSelect } from "./data";
import { Button, ErrorBox, Field, Input, Modal, Select, cn } from "./ui";

/** Book or reschedule an appointment against live doctor availability. */
export function BookingModal({ open, onClose, onDone, patientId, appointment, submit }: {
  open: boolean; onClose: () => void; onDone?: (a: Row) => void; patientId?: number; appointment?: Row | null;
  submit?: (body: Row) => Promise<Row>;
}) {
  const resched = !!appointment;
  const [v, setV] = useState<Row>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: docs } = useApi<Row[]>(open ? "/api/doctors" : null);
  const { data: slots, loading } = useApi<Row>(open && v.doctor_id && v.date ? `/api/doctors/${v.doctor_id}/slots?${qs({ d: v.date })}` : null);
  useEffect(() => {
    if (open) {
      setErr(null);
      setV(appointment ? { doctor_id: appointment.doctor_id, date: appointment.date, time: "", type: appointment.type, reason: appointment.reason }
        : { patient_id: patientId, date: today(), type: "in-person" });
    }
  }, [open, appointment, patientId]);
  const doc = docs?.find((d) => d.id === Number(v.doctor_id));
  const go = async () => {
    if (!v.patient_id && !resched && !submit) return setErr("Select a patient");
    if (!v.doctor_id || !v.date || !v.time) return setErr("Select doctor, date and an available slot");
    setBusy(true);
    setErr(null);
    try {
      const body = resched ? { date: v.date, time: v.time, doctor_id: Number(v.doctor_id) } : { ...v, doctor_id: Number(v.doctor_id) };
      const a = submit ? await submit(body) : resched
        ? await api(`/api/r/appointments/${appointment!.id}`, { method: "PATCH", body })
        : await api("/api/r/appointments", { body });
      onDone?.(a);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={resched ? `Reschedule · Token #${appointment?.token}` : "Book appointment"} wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={go} loading={busy}>{resched ? "Reschedule" : "Confirm booking"}</Button></>}>
      <div className="space-y-4">
        {err && <ErrorBox message={err} />}
        <div className="grid gap-3 sm:grid-cols-2">
          {!patientId && !resched && !submit && <Field label="Patient" required className="sm:col-span-2"><PatientSelect value={v.patient_id} onChange={(id) => setV({ ...v, patient_id: id })} /></Field>}
          <Field label="Doctor" required>
            <Select value={v.doctor_id || ""} onChange={(e) => setV({ ...v, doctor_id: e.target.value, time: "" })} placeholder="Select doctor"
              options={(docs || []).filter((d) => d.status === "active").map((d) => ({ value: d.id, label: `${d.name} — ${d.department_name} (₹${d.consult_fee})` }))} />
          </Field>
          <Field label="Date" required><Input type="date" min={today()} value={v.date || ""} onChange={(e) => setV({ ...v, date: e.target.value, time: "" })} /></Field>
          {!resched && (
            <>
              <Field label="Visit type"><Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} options={[{ value: "in-person", label: "In-person OPD" }, { value: "tele", label: "Teleconsultation (demo)" }]} /></Field>
              <Field label="Reason for visit"><Input value={v.reason || ""} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="e.g. Fever for 3 days" /></Field>
            </>
          )}
        </div>
        {doc && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted">
              Availability — {doc.available_days?.replaceAll(",", ", ")} · {doc.slot_start}–{doc.slot_end} · {doc.slot_minutes} min slots
            </p>
            {loading ? <p className="text-sm text-muted">Loading slots…</p> : !slots?.slots?.length ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{doc.name} does not consult on {slots?.day}. Choose another date.</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                {slots.slots.map((s: Row) => (
                  <button key={s.time} type="button" disabled={!s.available} onClick={() => setV({ ...v, time: s.time })}
                    className={cn("num rounded-md border py-1.5 text-xs font-medium transition-colors",
                      !s.available ? "cursor-not-allowed border-line bg-slate-100 text-slate-400 line-through" :
                        v.time === s.time ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-white hover:border-brand-500")}>
                    {s.time}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
