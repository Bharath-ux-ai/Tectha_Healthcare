"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarPlus, CheckCircle2, ClipboardPlus, FlaskConical, HeartPulse, Pencil, Pill, Send, Trash2 } from "lucide-react";
import { age, api, fmtDate, fmtDateTime, getSession, inr, qs, useApi, type Row } from "@/lib/api";
import { ALLERGY_FIELDS, ENCOUNTER_FIELDS, PATIENT_FIELDS, VITAL_FIELDS } from "@/lib/forms";
import { FormModal } from "@/components/data";
import { BookingModal } from "@/components/booking";
import { OrderModal, PrintDoc, RxModal, RxView } from "@/components/clinical";
import { Badge, Button, Card, DemoTag, Empty, ErrorBox, Field, Input, KV, Modal, Select, Spinner, Tabs, Textarea, useConfirm, useToast } from "@/components/ui";

const list = (res: string, pid: string, extra: Row = {}, k = 0, skip = false) => (skip ? null : `/api/r/${res}?${qs({ patient_id: pid, limit: 100, ...extra, _k: k })}`);

export default function PatientProfile() {
  const { id } = useParams<{ id: string }>();
  const role = getSession()!.user.role;
  const isClin = ["admin", "doctor", "nurse"].includes(role);
  const isDoc = ["admin", "doctor"].includes(role);
  const isBill = ["admin", "accountant", "receptionist"].includes(role);
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState("overview");
  const [k, setK] = useState(0);
  const reload = () => setK((x) => x + 1);
  const [apptId, setApptId] = useState<number | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("appt")) (setApptId(Number(p.get("appt"))), setTab("emr"));
  }, []);

  const P = useApi<Row>(`/api/r/patients/${id}?_k=${k}`);
  const appts = useApi<{ items: Row[]; total?: number }>(list("appointments", id, { sort: "date" }, k));
  const vitals = useApi<{ items: Row[]; total?: number }>(list("vitals", id, { sort: "created_at" }, k, !isClin));
  const allergies = useApi<{ items: Row[]; total?: number }>(list("allergies", id, {}, k, !isClin));
  const encs = useApi<{ items: Row[]; total?: number }>(list("encounters", id, { sort: "created_at" }, k, !isClin));
  const rxs = useApi<{ items: Row[]; total?: number }>(list("prescriptions", id, {}, k, !isClin));
  const labs = useApi<{ items: Row[]; total?: number }>(list("lab-orders", id, {}, k, !(isClin || role === "receptionist")));
  const adms = useApi<{ items: Row[]; total?: number }>(list("admissions", id, {}, k));
  const invs = useApi<{ items: Row[]; total?: number }>(list("invoices", id, {}, k, !isBill));
  const acct = useApi<Row>(isBill ? `/api/patients/${id}/account?_k=${k}` : null);
  const notes = useApi<{ items: Row[]; total?: number }>(list("notifications", id, { limit: 50 }, k));

  const [modal, setModal] = useState<string | null>(null);
  const [view, setView] = useState<Row | null>(null);
  const [msg, setMsg] = useState({ channel: "WhatsApp", message: "" });
  const currentAppt = appts.data?.items.find((a) => a.id === apptId);
  const currentEnc = encs.data?.items.find((e) => e.appointment_id === apptId);

  if (P.error) return <ErrorBox message={P.error} onRetry={P.reload} />;
  if (!P.data) return <Spinner />;
  const p = P.data;
  const al = allergies.data?.items || [];
  const lastV = vitals.data?.items[0];

  const post = (res: string) => async (v: Row) => {
    await api(`/api/r/${res}`, { body: { ...v, patient_id: p.id, ...(res === "encounters" && apptId ? { appointment_id: apptId } : {}) } });
    toast("Saved to patient record");
    reload();
  };
  const completeConsult = async () => {
    if (!currentEnc && !(await confirm("No clinical note has been recorded for this visit. Complete anyway?"))) return;
    try {
      await api(`/api/r/appointments/${apptId}`, { method: "PATCH", body: { status: "completed" } });
      toast("Consultation completed · charge posted to billing · follow-up message sent");
      setApptId(null);
      reload();
    } catch (e: any) { toast(e.message, "error"); }
  };
  const tabs = [
    { id: "overview", label: "Overview" },
    ...(isClin ? [{ id: "emr", label: "EMR & Vitals" }, { id: "rx", label: "Prescriptions", count: rxs.data?.total }] : []),
    ...(isClin || role === "receptionist" ? [{ id: "labs", label: "Lab & Radiology", count: labs.data?.total }] : []),
    { id: "ipd", label: "Admissions" },
    ...(isBill ? [{ id: "billing", label: "Billing" }] : []),
    { id: "comms", label: "Communication", count: notes.data?.total },
  ];
  return (
    <>
      <Link href="/patients" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Patients</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-line bg-white p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-base font-semibold text-brand-700">{p.name.split(" ").map((x: string) => x[0]).slice(0, 2).join("")}</div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{p.name}</h1>
            <p className="mt-0.5 text-sm text-muted"><span className="num font-mono font-medium text-brand-700">{p.uhid}</span> · {age(p.dob)} · {p.gender} · {p.blood_group || "Blood group n/a"} · {p.phone}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {al.map((a) => <Badge key={a.id} tone="red"><AlertTriangle className="mr-1 size-3" />{a.allergen}</Badge>)}
              {adms.data?.items.some((a) => a.status === "admitted") && <Badge tone="blue">In-patient</Badge>}
              {p.insurance_provider && <Badge tone="teal">{p.insurance_provider}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {role !== "lab" && <Button variant="secondary" onClick={() => setModal("book")}><CalendarPlus className="size-4" /> Book appointment</Button>}
          <Button variant="secondary" onClick={() => setModal("edit")}><Pencil className="size-4" /> Edit details</Button>
        </div>
      </div>

      {currentAppt && currentAppt.status !== "completed" && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm"><b>Consultation in progress</b> · Token #{currentAppt.token} · {currentAppt.time} · {currentAppt.reason || "OPD visit"}
            {currentEnc && <span className="ml-2 text-teal-700">✓ note recorded</span>}</p>
          {isDoc && <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModal("note")}><ClipboardPlus className="size-4" /> Clinical note</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal("rx")}><Pill className="size-4" /> e-Rx</Button>
            <Button size="sm" variant="secondary" onClick={() => setModal("order")}><FlaskConical className="size-4" /> Order test</Button>
            <Button size="sm" variant="teal" onClick={completeConsult}><CheckCircle2 className="size-4" /> Complete visit</Button>
          </div>}
        </div>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Demographics" className="lg:col-span-2">
            <KV items={[["Date of birth", fmtDate(p.dob)], ["Email", p.email], ["Emergency contact", p.emergency_contact], ["Address", p.address], ["Insurance", p.insurance_provider], ["Policy no.", p.policy_no], ["Registered", fmtDate(p.created_at)], ["Branch", p.branch_id === 1 ? "Main Hospital" : `Branch ${p.branch_id}`], ["Status", <Badge key="s">{p.status}</Badge>]]} />
          </Card>
          <Card title="Latest vitals">
            {!isClin ? <p className="text-sm text-muted">Visible to clinical staff.</p> : !lastV ? <Empty title="No vitals recorded" /> :
              <KV items={[["BP", lastV.bp], ["Pulse", lastV.pulse], ["Temp °F", lastV.temperature], ["SpO₂ %", lastV.spo2], ["Weight", lastV.weight && `${lastV.weight} kg`], ["Recorded", fmtDateTime(lastV.created_at)]]} />}
          </Card>
          <Card title="Appointments" className="lg:col-span-3" pad={false}>
            {!appts.data?.items.length ? <Empty /> : (
              <table className="w-full text-sm"><tbody>
                {appts.data.items.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="num px-4 py-2.5">{fmtDate(a.date)} · {a.time}</td><td className="px-4 py-2.5">{a.doctor_name}</td>
                    <td className="px-4 py-2.5 text-muted">{a.department_name}</td><td className="num px-4 py-2.5">Token #{a.token}</td>
                    <td className="px-4 py-2.5"><Badge>{a.type}</Badge></td><td className="px-4 py-2.5"><Badge>{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody></table>
            )}
          </Card>
        </div>
      )}

      {tab === "emr" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card title="Clinical notes & diagnoses" action={isDoc && <Button size="sm" onClick={() => setModal("note")}><ClipboardPlus className="size-4" /> New note</Button>}>
              {!encs.data?.items.length ? <Empty title="No encounters" /> : (
                <ol className="space-y-3">
                  {encs.data.items.map((e) => (
                    <li key={e.id} className="rounded-md border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{fmtDateTime(e.created_at)} · {e.doctor_name}</span>{e.follow_up_date && <Badge tone="teal">Follow-up {fmtDate(e.follow_up_date)}</Badge>}</div>
                      <p className="mt-1.5 font-medium">{e.diagnosis} {e.icd_code && <span className="font-mono text-xs text-muted">({e.icd_code})</span>}</p>
                      {e.complaint && <p className="mt-1 text-sm"><span className="text-muted">Complaint:</span> {e.complaint}</p>}
                      {e.notes && <p className="mt-1 text-sm"><span className="text-muted">Notes:</span> {e.notes}</p>}
                      {e.treatment_plan && <p className="mt-1 text-sm"><span className="text-muted">Plan:</span> {e.treatment_plan}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card title="Vitals history" pad={false} action={<Button size="sm" variant="secondary" onClick={() => setModal("vital")}><HeartPulse className="size-4" /> Record vitals</Button>}>
              {!vitals.data?.items.length ? <Empty /> : (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b border-line bg-slate-50/70 text-left text-xs text-muted">{["Recorded", "BP", "Pulse", "Temp °F", "SpO₂", "Wt kg", "By"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{vitals.data.items.map((v) => (
                    <tr key={v.id} className="num border-b border-line last:border-0">
                      <td className="px-4 py-2">{fmtDateTime(v.created_at)}</td><td className="px-4 py-2">{v.bp}</td><td className="px-4 py-2">{v.pulse}</td>
                      <td className={`px-4 py-2 ${v.temperature >= 100.4 ? "font-semibold text-red-700" : ""}`}>{v.temperature}</td>
                      <td className={`px-4 py-2 ${v.spo2 && v.spo2 < 94 ? "font-semibold text-red-700" : ""}`}>{v.spo2}</td><td className="px-4 py-2">{v.weight}</td><td className="px-4 py-2 text-muted">{v.recorded_by}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </Card>
          </div>
          <Card title="Allergies" action={<Button size="sm" variant="secondary" onClick={() => setModal("allergy")}>Add</Button>}>
            {!al.length ? <p className="text-sm text-muted">No known allergies recorded.</p> : (
              <ul className="space-y-2">{al.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
                  <span><b>{a.allergen}</b> <span className="text-muted">· {a.reaction}</span></span>
                  <span className="flex items-center gap-1"><Badge>{a.severity}</Badge>
                    <Button size="sm" variant="ghost" aria-label="Remove allergy" onClick={async () => { if (await confirm(`Remove allergy "${a.allergen}"?`, { danger: true, label: "Remove" })) { await api(`/api/r/allergies/${a.id}`, { method: "DELETE" }); reload(); } }}><Trash2 className="size-3.5 text-red-600" /></Button>
                  </span>
                </li>))}</ul>
            )}
          </Card>
        </div>
      )}

      {tab === "rx" && (
        <Card title="E-prescriptions" action={isDoc && <Button size="sm" onClick={() => setModal("rx")}><Pill className="size-4" /> New prescription</Button>}>
          {!rxs.data?.items.length ? <Empty /> : <div className="space-y-3">{rxs.data.items.map((r) => <RxView key={r.id} rx={r} />)}</div>}
        </Card>
      )}

      {tab === "labs" && (
        <Card title="Investigations" pad={false} action={isDoc && <Button size="sm" onClick={() => setModal("order")}><FlaskConical className="size-4" /> Order test</Button>}>
          {!labs.data?.items.length ? <Empty /> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
              {labs.data.items.map((l) => (
                <tr key={l.id} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3"><p className="font-medium">{l.test_name}</p><p className="text-xs text-muted">{l.category === "radiology" ? l.modality : "Laboratory"} · {fmtDate(l.created_at)} · {l.doctor_name}</p></td>
                  <td className="px-4 py-3 text-xs text-muted">{l.sample_id}</td>
                  <td className="px-4 py-3">{l.result || l.findings ? <><p>{l.result || l.findings}</p>{l.impression && <p className="mt-1 text-xs"><b>Impression:</b> {l.impression}</p>}{l.reference_range && <p className="text-xs text-muted">Ref: {l.reference_range}</p>}</> : <span className="text-muted">Awaiting result</span>}</td>
                  <td className="px-4 py-3 text-right"><Badge>{l.status}</Badge></td>
                </tr>))}
            </tbody></table></div>
          )}
        </Card>
      )}

      {tab === "ipd" && (
        <Card title="Admissions & discharge summaries" pad={false}>
          {!adms.data?.items.length ? <Empty hint="Admit from Hospital Operations → Admissions." /> : (
            <ul className="divide-y divide-line">{adms.data.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span><b>{a.bed_label}</b> · {a.reason} · {fmtDate(a.admit_date)} → {a.discharge_date ? fmtDate(a.discharge_date) : "present"} · {a.doctor_name}</span>
                <span className="flex items-center gap-2"><Badge>{a.status}</Badge>{a.discharge_summary && <Button size="sm" variant="secondary" onClick={() => setView({ kind: "discharge", ...a })}>Discharge summary</Button>}</span>
              </li>))}</ul>
          )}
        </Card>
      )}

      {tab === "billing" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card><p className="text-xs text-muted">Unbilled charges</p><p className="num mt-1 text-xl font-semibold">{inr(acct.data?.unbilled_total)}</p></Card>
            <Card><p className="text-xs text-muted">Advance balance</p><p className="num mt-1 text-xl font-semibold text-teal-700">{inr(acct.data?.advance_balance)}</p></Card>
            <Card><p className="text-xs text-muted">Outstanding</p><p className="num mt-1 text-xl font-semibold text-red-700">{inr(acct.data?.outstanding)}</p></Card>
          </div>
          <Card title="Invoices" pad={false} action={<Link href={`/finance?patient=${p.id}`}><Button size="sm">Open in billing</Button></Link>}>
            {!invs.data?.items.length ? <Empty /> : (
              <table className="w-full text-sm"><tbody>{invs.data.items.map((i) => (
                <tr key={i.id} className="num border-b border-line last:border-0"><td className="px-4 py-2.5 font-mono text-xs">{i.invoice_no}</td><td className="px-4 py-2.5">{fmtDate(i.created_at)}</td>
                  <td className="px-4 py-2.5">{inr(i.total)}</td><td className="px-4 py-2.5 text-muted">Paid {inr(i.paid)}</td><td className="px-4 py-2.5 text-right"><Badge>{i.status}</Badge></td></tr>))}</tbody></table>
            )}
          </Card>
        </div>
      )}

      {tab === "comms" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Message log" className="lg:col-span-2" pad={false}>
            {!notes.data?.items.length ? <Empty /> : (
              <ul className="divide-y divide-line">{notes.data.items.map((n) => (
                <li key={n.id} className="px-4 py-3 text-sm"><div className="mb-1 flex items-center gap-2 text-xs text-muted"><Badge tone={n.channel === "WhatsApp" ? "teal" : "blue"}>{n.channel}</Badge><Badge>{n.category}</Badge>{fmtDateTime(n.created_at)}</div>{n.message}</li>))}</ul>
            )}
          </Card>
          {(role === "admin" || role === "receptionist") && (
            <Card title={<span className="flex items-center gap-2">Send message <DemoTag /></span>}>
              <div className="space-y-3">
                <Field label="Channel"><Select value={msg.channel} onChange={(e) => setMsg({ ...msg, channel: e.target.value })} options={["WhatsApp", "SMS", "Email"]} /></Field>
                <Field label="Message"><Textarea value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} rows={4} /></Field>
                <Button className="w-full" disabled={!msg.message.trim()} onClick={async () => {
                  await api("/api/notifications/send", { body: { ...msg, patient_id: p.id } });
                  setMsg({ ...msg, message: "" }); toast(`${msg.channel} message logged (simulated delivery)`); reload();
                }}><Send className="size-4" /> Send</Button>
              </div>
            </Card>
          )}
        </div>
      )}

      <FormModal open={modal === "edit"} onClose={() => setModal(null)} title="Edit patient details" wide initial={p}
        fields={[...PATIENT_FIELDS, { name: "status", label: "Status", type: "select", options: ["active", "inactive"] }]}
        onSubmit={async (v) => { await api(`/api/r/patients/${p.id}`, { method: "PATCH", body: v }); toast("Patient updated"); reload(); }} />
      <FormModal open={modal === "vital"} onClose={() => setModal(null)} title="Record vitals" fields={VITAL_FIELDS} initial={{ recorded_by: getSession()?.user.name }} onSubmit={post("vitals")} />
      <FormModal open={modal === "allergy"} onClose={() => setModal(null)} title="Add allergy" fields={ALLERGY_FIELDS} initial={{ severity: "moderate" }} onSubmit={post("allergies")} />
      <FormModal open={modal === "note"} onClose={() => setModal(null)} title="Clinical note" wide fields={ENCOUNTER_FIELDS} initial={{ complaint: currentAppt?.reason || "" }} onSubmit={post("encounters")} />
      <RxModal open={modal === "rx"} onClose={() => setModal(null)} patientId={p.id} encounterId={currentEnc?.id || encs.data?.items[0]?.id} allergies={al} onDone={() => (toast("Prescription sent to pharmacy"), reload())} />
      <OrderModal open={modal === "order"} onClose={() => setModal(null)} patientId={p.id} encounterId={currentEnc?.id} onDone={() => (toast("Order sent to diagnostics · charge posted"), reload())} />
      <BookingModal open={modal === "book"} onClose={() => setModal(null)} patientId={p.id} onDone={(a) => (toast(`Booked · Token #${a.token}`), reload())} />
      <Modal open={!!view} onClose={() => setView(null)} title="Discharge summary" wide>
        {view && <PrintDoc title="Discharge Summary" meta={<>{p.uhid}<br />{fmtDate(view.discharge_date)}</>}>
          <KV items={[["Patient", p.name], ["Age / Sex", `${age(p.dob)} / ${p.gender}`], ["Consultant", view.doctor_name], ["Bed", view.bed_label], ["Admitted", fmtDate(view.admit_date)], ["Discharged", fmtDate(view.discharge_date)], ["Reason", view.reason], ["Condition", view.condition_at_discharge]]} />
          <p className="mt-4 whitespace-pre-wrap rounded-md border border-line p-3 text-sm">{view.discharge_summary}</p>
        </PrintDoc>}
      </Modal>
    </>
  );
}
