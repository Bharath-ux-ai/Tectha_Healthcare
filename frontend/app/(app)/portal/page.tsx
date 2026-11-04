"use client";
import { useState } from "react";
import { CalendarPlus, FileText, FlaskConical, MessageSquare, Pill, Receipt, Star, Video } from "lucide-react";
import { age, api, fmtDate, fmtDateTime, inr, today, useApi, type Row } from "@/lib/api";
import { BookingModal } from "@/components/booking";
import { PrintDoc, RxView, TeleModal } from "@/components/clinical";
import { Badge, Button, Card, DemoTag, Empty, ErrorBox, Field, Input, KV, Modal, PageHeader, Select, Spinner, Stat, Tabs, Textarea, cn, useConfirm, useToast } from "@/components/ui";

export default function Portal() {
  const toast = useToast();
  const confirm = useConfirm();
  const [k, setK] = useState(0);
  const { data: d, error, reload } = useApi<Row>(`/api/portal/me?_k=${k}`);
  const [tab, setTab] = useState("visits");
  const [book, setBook] = useState(false);
  const [resched, setResched] = useState<Row | null>(null);
  const [tele, setTele] = useState<Row | null>(null);
  const [invId, setInvId] = useState<number | null>(null);
  const [report, setReport] = useState<Row | null>(null);
  const [fb, setFb] = useState<Row>({ rating: 5, category: "Overall", comment: "" });
  const [cmp, setCmp] = useState<Row>({ subject: "", description: "", category: "Service" });
  const inv = useApi<Row>(invId ? `/api/invoices/${invId}/detail` : null);
  const refresh = () => setK(k + 1);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return <Spinner />;
  const p = d.patient;
  const upcoming = d.appointments.filter((a: Row) => a.date >= today() && ["booked", "checked-in", "in-consultation"].includes(a.status)).sort((a: Row, b: Row) => (a.date + a.time).localeCompare(b.date + b.time));
  const due = d.invoices.reduce((s: number, i: Row) => s + i.balance, 0);
  const cancel = async (a: Row) => {
    if (!(await confirm(`Cancel your appointment with ${a.doctor_name} on ${fmtDate(a.date)} at ${a.time}?`, { danger: true, label: "Cancel appointment" }))) return;
    try { await api(`/api/portal/appointments/${a.id}`, { method: "PATCH", body: { status: "cancelled" } }); toast("Appointment cancelled"); refresh(); } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <>
      <PageHeader module="Patient portal" title={`Hello, ${p.name.split(" ")[0]}`} subtitle={`UHID ${p.uhid} · ${age(p.dob)} · ${p.gender} · ${p.blood_group || ""}`}
        actions={<Button onClick={() => setBook(true)}><CalendarPlus className="size-4" /> Book appointment</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Upcoming appointments" value={upcoming.length} icon={CalendarPlus} />
        <Stat label="Prescriptions" value={d.prescriptions.length} icon={Pill} tone="teal" />
        <Stat label="Reports ready" value={d.labs.filter((l: Row) => ["completed", "reported"].includes(l.status)).length} icon={FlaskConical} />
        <Stat label="Amount due" value={inr(due)} icon={Receipt} tone={due > 0 ? "red" : "teal"} />
      </div>

      <Card className="mt-4" title="Upcoming appointments" pad={false}>
        {!upcoming.length ? <Empty title="No upcoming appointments" action={<Button size="sm" onClick={() => setBook(true)}>Book now</Button>} /> : (
          <ul className="divide-y divide-line">{upcoming.map((a: Row) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3"><span className="num flex size-10 flex-col items-center justify-center rounded-md bg-brand-50 text-brand-700"><span className="text-[9px] uppercase">Token</span><b className="text-sm leading-none">{a.token}</b></span>
                <div><p className="font-medium">{a.doctor_name} <span className="font-normal text-muted">· {a.department_name}</span></p><p className="num text-sm text-muted">{fmtDate(a.date)} at {a.time} · {a.reason || "Consultation"}</p></div></div>
              <div className="flex items-center gap-2"><Badge>{a.type}</Badge><Badge>{a.status}</Badge>
                {a.type === "tele" && <Button size="sm" variant="teal" onClick={() => setTele(a)}><Video className="size-3.5" /> Join</Button>}
                {a.status === "booked" && <><Button size="sm" variant="secondary" onClick={() => setResched(a)}>Reschedule</Button><Button size="sm" variant="ghost" onClick={() => cancel(a)}>Cancel</Button></>}</div>
            </li>))}</ul>
        )}
      </Card>

      <div className="mt-5"><Tabs value={tab} onChange={setTab} tabs={[{ id: "visits", label: "Medical history" }, { id: "rx", label: "Prescriptions" }, { id: "labs", label: "Reports" }, { id: "bills", label: "Bills" }, { id: "msgs", label: "Messages" }, { id: "fb", label: "Feedback & support" }]} /></div>

      {tab === "visits" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Visit summaries" className="lg:col-span-2">
            {!d.encounters.length ? <Empty /> : <ol className="space-y-3">{d.encounters.map((e: Row) => (
              <li key={e.id} className="rounded-md border border-line p-3"><p className="text-xs text-muted">{fmtDate(e.created_at)} · {e.doctor_name}</p><p className="mt-1 font-medium">{e.diagnosis}</p>
                {e.treatment_plan && <p className="mt-1 text-sm"><span className="text-muted">Advice:</span> {e.treatment_plan}</p>}{e.follow_up_date && <p className="mt-1 text-sm text-teal-700">Follow-up: {fmtDate(e.follow_up_date)}</p>}</li>))}</ol>}
          </Card>
          <div className="space-y-4">
            <Card title="Allergies">{!d.allergies.length ? <p className="text-sm text-muted">None recorded.</p> : <div className="flex flex-wrap gap-1.5">{d.allergies.map((a: Row) => <Badge key={a.id} tone="red">{a.allergen} · {a.severity}</Badge>)}</div>}</Card>
            <Card title="Latest vitals">{!d.vitals[0] ? <p className="text-sm text-muted">No vitals yet.</p> : <KV items={[["BP", d.vitals[0].bp], ["Pulse", d.vitals[0].pulse], ["Temp °F", d.vitals[0].temperature], ["SpO₂", d.vitals[0].spo2], ["Weight", d.vitals[0].weight], ["On", fmtDate(d.vitals[0].created_at)]]} />}</Card>
            {d.admissions.length > 0 && <Card title="Hospital stays">{d.admissions.map((a: Row) => <p key={a.id} className="text-sm">{fmtDate(a.admit_date)} → {a.discharge_date ? fmtDate(a.discharge_date) : "present"} · <Badge>{a.status}</Badge>{a.discharge_summary && <span className="mt-1 block whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{a.discharge_summary}</span>}</p>)}</Card>}
          </div>
        </div>
      )}
      {tab === "rx" && <Card title="My prescriptions">{!d.prescriptions.length ? <Empty /> : <div className="space-y-3">{d.prescriptions.map((r: Row) => <RxView key={r.id} rx={r} />)}</div>}</Card>}
      {tab === "labs" && (
        <Card title="Lab & imaging reports" pad={false}>
          {!d.labs.length ? <Empty /> : <ul className="divide-y divide-line">{d.labs.map((l: Row) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span><b>{l.test_name}</b><span className="block text-xs text-muted">{fmtDate(l.created_at)} · {l.doctor_name}</span></span>
              <span className="flex items-center gap-2"><Badge>{l.status}</Badge>{["completed", "reported"].includes(l.status) && <Button size="sm" variant="secondary" onClick={() => setReport(l)}><FileText className="size-3.5" /> View</Button>}</span></li>))}</ul>}
        </Card>
      )}
      {tab === "bills" && (
        <Card title="Bills & payments" pad={false}>
          {!d.invoices.length ? <Empty /> : <ul className="divide-y divide-line">{d.invoices.map((i: Row) => (
            <li key={i.id} className="num flex items-center justify-between gap-3 px-4 py-3 text-sm"><span><span className="font-mono text-xs">{i.invoice_no}</span><span className="block text-xs text-muted">{fmtDate(i.created_at)}</span></span>
              <span className="flex items-center gap-3">{inr(i.total)}<span className={cn("text-xs", i.balance > 0 ? "text-red-700" : "text-muted")}>due {inr(i.balance)}</span><Badge>{i.status}</Badge><Button size="sm" variant="secondary" onClick={() => setInvId(i.id)}>View</Button></span></li>))}</ul>}
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">Online payment gateway (UPI/cards) is a production integration — pay at the billing counter in this demo.</p>
        </Card>
      )}
      {tab === "msgs" && (
        <Card title={<span className="flex items-center gap-2">WhatsApp / SMS messages <DemoTag /></span>} pad={false}>
          {!d.notifications.length ? <Empty /> : <ul className="divide-y divide-line">{d.notifications.map((n: Row) => (
            <li key={n.id} className="px-4 py-3 text-sm"><p className="mb-1 flex items-center gap-2 text-xs text-muted"><Badge tone={n.channel === "WhatsApp" ? "teal" : "blue"}>{n.channel}</Badge>{fmtDateTime(n.created_at)}</p>{n.message}</li>))}</ul>}
        </Card>
      )}
      {tab === "fb" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Rate your experience">
            <div className="space-y-3">
              <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setFb({ ...fb, rating: n })} aria-label={`${n} stars`}><Star className={cn("size-7", n <= fb.rating ? "fill-amber-400 text-amber-400" : "text-slate-300")} /></button>)}</div>
              <Field label="About"><Select value={fb.category} onChange={(e) => setFb({ ...fb, category: e.target.value })} options={["Overall", "Doctor", "Nursing", "Billing", "Facilities", "Pharmacy"]} /></Field>
              <Field label="Comments"><Textarea value={fb.comment} onChange={(e) => setFb({ ...fb, comment: e.target.value })} /></Field>
              <Button onClick={async () => { try { await api("/api/portal/feedback", { body: fb }); toast("Thank you for your feedback"); setFb({ rating: 5, category: "Overall", comment: "" }); refresh(); } catch (e: any) { toast(e.message, "error"); } }}>Submit feedback</Button>
            </div>
          </Card>
          <Card title="Raise a concern">
            <div className="space-y-3">
              <Field label="Subject" required><Input value={cmp.subject} onChange={(e) => setCmp({ ...cmp, subject: e.target.value })} /></Field>
              <Field label="Category"><Select value={cmp.category} onChange={(e) => setCmp({ ...cmp, category: e.target.value })} options={["Service", "Billing", "Clinical", "Facilities", "Staff behaviour"]} /></Field>
              <Field label="Details"><Textarea value={cmp.description} onChange={(e) => setCmp({ ...cmp, description: e.target.value })} /></Field>
              <Button variant="secondary" disabled={!cmp.subject.trim()} onClick={async () => { try { await api("/api/portal/complaints", { body: cmp }); toast("Complaint registered · ticket sent by SMS"); setCmp({ subject: "", description: "", category: "Service" }); refresh(); } catch (e: any) { toast(e.message, "error"); } }}><MessageSquare className="size-4" /> Submit</Button>
            </div>
          </Card>
        </div>
      )}

      <BookingModal open={book} onClose={() => setBook(false)} submit={(b) => api("/api/portal/appointments", { body: b })} onDone={(a) => (toast(`Booked · Token #${a.token} · confirmation sent on WhatsApp`), refresh())} />
      <BookingModal open={!!resched} appointment={resched} onClose={() => setResched(null)} submit={(b) => api(`/api/portal/appointments/${resched!.id}`, { method: "PATCH", body: b })} onDone={() => (toast("Appointment rescheduled"), refresh())} />
      <TeleModal open={!!tele} onClose={() => setTele(null)} appt={tele} />
      <Modal open={!!report} onClose={() => setReport(null)} title="Report" wide>
        {report && <PrintDoc title={report.category === "radiology" ? "Radiology Report" : "Laboratory Report"} meta={fmtDateTime(report.reported_at)}>
          <KV items={[["Patient", p.name], ["UHID", p.uhid], ["Test", report.test_name], ["Referred by", report.doctor_name]]} />
          <div className="mt-3 rounded-md border border-line p-3 text-sm"><p className="whitespace-pre-wrap">{report.result || report.findings}</p>{report.reference_range && <p className="mt-2 text-xs text-muted">Reference: {report.reference_range}</p>}{report.impression && <p className="mt-2"><b>Impression:</b> {report.impression}</p>}</div>
          <p className="mt-3 text-xs text-muted">Please discuss results with your doctor.</p>
        </PrintDoc>}
      </Modal>
      <Modal open={!!invId} onClose={() => setInvId(null)} title="Invoice" wide>
        {!inv.data || inv.data.id !== invId ? <Spinner /> : <PrintDoc title="Invoice" meta={inv.data.invoice_no}>
          <table className="num w-full text-sm"><tbody>{inv.data.items.map((i: Row, n: number) => <tr key={n} className="border-b border-line"><td className="py-2">{i.description}</td><td className="py-2 text-right">{inr(i.amount)}</td></tr>)}
            <tr><td className="pt-2 text-right font-semibold">Total</td><td className="pt-2 text-right font-semibold">{inr(inv.data.total)}</td></tr>
            <tr><td className="text-right text-muted">Paid</td><td className="text-right">{inr(inv.data.paid)}</td></tr>
            <tr><td className="text-right font-semibold">Balance</td><td className="text-right font-semibold">{inr(inv.data.balance)}</td></tr></tbody></table>
        </PrintDoc>}
      </Modal>
    </>
  );
}
