"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, CalendarClock, LogIn, Video, XCircle } from "lucide-react";
import { addDays, api, fmtDate, qs, today, useApi, type Row } from "@/lib/api";
import { STATUS_APPT } from "@/lib/forms";
import { DataTable } from "@/components/data";
import { BookingModal } from "@/components/booking";
import { TeleModal } from "@/components/clinical";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, Tabs, cn, useConfirm, useToast } from "@/components/ui";

export default function Appointments() {
  const [tab, setTab] = useState("list");
  const [book, setBook] = useState(false);
  const [resched, setResched] = useState<Row | null>(null);
  const [tele, setTele] = useState<Row | null>(null);
  const [k, setK] = useState(0);
  const [date, setDate] = useState(today());
  const toast = useToast();
  const confirm = useConfirm();
  const reload = () => setK((x) => x + 1);
  const setStatus = async (a: Row, status: string) => {
    if (status === "cancelled" && !(await confirm(`Cancel ${a.patient_name}'s appointment on ${fmtDate(a.date)} at ${a.time}? The patient will be notified.`, { danger: true, label: "Cancel appointment" }))) return;
    try {
      await api(`/api/r/appointments/${a.id}`, { method: "PATCH", body: { status } });
      toast(`Token #${a.token} → ${status}`);
      reload();
    } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <>
      <PageHeader module="Module 1 · Patient Experience" title="Appointments & Queue" subtitle="Booking, rescheduling, doctor availability and live OPD token queue."
        actions={<Button onClick={() => setBook(true)}><CalendarPlus className="size-4" /> Book appointment</Button>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "list", label: "Appointments" }, { id: "queue", label: "Live queue" }, { id: "avail", label: "Doctor availability" }]} />
      {tab === "list" && (
        <>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></Field>
            {[["Today", today()], ["Tomorrow", addDays(1)]].map(([l, d]) => <Button key={l} variant={date === d ? "primary" : "secondary"} onClick={() => setDate(d)}>{l}</Button>)}
            <Button variant={!date ? "primary" : "secondary"} onClick={() => setDate("")}>All dates</Button>
          </div>
          <DataTable res="appointments" params={{ date }} reloadKey={k} defaultSort="time" defaultOrder="asc" searchPlaceholder="Search patient, UHID or reason"
            filters={[{ key: "status", label: "Status", options: STATUS_APPT }, { key: "type", label: "Type", options: ["in-person", "tele"] }]}
            columns={[
              { key: "token", label: "Token", render: (r) => <span className="num inline-flex size-7 items-center justify-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">{r.token}</span> },
              { key: "time", label: "Slot", render: (r) => <span className="num">{fmtDate(r.date)} · {r.time}</span> },
              { key: "patient_name", label: "Patient", render: (r) => <Link className="font-medium hover:text-brand-700" href={`/patients/${r.patient_id}`}>{r.patient_name}<span className="block text-xs font-normal text-muted">{r.patient_uhid}</span></Link> },
              { key: "doctor_name", label: "Doctor", render: (r) => <>{r.doctor_name}<span className="block text-xs text-muted">{r.department_name}</span></> },
              { key: "reason", label: "Reason", sortable: false },
              { key: "type", label: "Type", render: (r) => <Badge>{r.type}</Badge> },
              { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
            ]}
            actions={(r) => (
              <>
                {r.status === "booked" && <Button size="sm" variant="secondary" onClick={() => setStatus(r, "checked-in")}><LogIn className="size-3.5" /> Check in</Button>}
                {r.type === "tele" && ["booked", "checked-in", "in-consultation"].includes(r.status) && <Button size="sm" variant="secondary" onClick={() => setTele(r)}><Video className="size-3.5" /> Join</Button>}
                {["booked", "checked-in"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setResched(r)} title="Reschedule"><CalendarClock className="size-3.5" /></Button>}
                {["booked", "checked-in"].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setStatus(r, "cancelled")} title="Cancel"><XCircle className="size-3.5 text-red-600" /></Button>}
              </>
            )} />
        </>
      )}
      {tab === "queue" && <QueueBoard k={k} onChange={reload} setStatus={setStatus} />}
      {tab === "avail" && <Availability onBook={() => setBook(true)} />}
      <BookingModal open={book} onClose={() => setBook(false)} onDone={(a) => (toast(`Booked ${a.patient_name} · Token #${a.token} · confirmation sent`), reload())} />
      <BookingModal open={!!resched} appointment={resched} onClose={() => setResched(null)} onDone={(a) => (toast(`Rescheduled to ${fmtDate(a.date)} ${a.time} · Token #${a.token}`), reload())} />
      <TeleModal open={!!tele} onClose={() => setTele(null)} appt={tele} />
    </>
  );
}

function QueueBoard({ k, setStatus }: { k: number; onChange: () => void; setStatus: (a: Row, s: string) => void }) {
  const { data, error, loading, reload } = useApi<Row>(`/api/queue?_k=${k}`);
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (loading && !data) return <Spinner />;
  if (!data?.doctors.length) return <Card><Empty title="No patients in today's queue" /></Card>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.doctors.map((d: Row) => {
        const next = d.items.find((i: Row) => i.status === "checked-in");
        const current = d.items.find((i: Row) => i.status === "in-consultation");
        return (
          <Card key={d.doctor_id} title={<span>{d.doctor_name} <span className="font-normal text-muted">· {d.department}</span></span>}
            action={<div className="flex items-center gap-3 text-xs text-muted"><span>Waiting <b className="num text-ink">{d.waiting}</b></span><span>Done <b className="num text-ink">{d.completed}</b></span></div>}>
            <div className="mb-3 flex items-center justify-between rounded-md bg-brand-900 px-4 py-3 text-white">
              <div><p className="text-[10px] uppercase tracking-widest text-blue-100/70">Now serving</p><p className="num text-3xl font-semibold">{d.now_serving ? `#${d.now_serving}` : "—"}</p></div>
              <Button variant="teal" disabled={!next || !!current} onClick={() => setStatus(next, "in-consultation")} title={current ? "Complete current consultation first" : ""}>Call next{next ? ` · #${next.token}` : ""}</Button>
            </div>
            <ul className="divide-y divide-line text-sm">
              {d.items.map((i: Row) => (
                <li key={i.id} className={cn("flex items-center justify-between gap-2 py-2", i.status === "completed" && "opacity-50")}>
                  <span className="flex items-center gap-2.5"><span className="num w-8 font-semibold text-brand-700">#{i.token}</span><span>{i.patient_name}<span className="block text-xs text-muted">{i.time} {i.est_wait_min !== undefined && `· ~${i.est_wait_min} min wait`}</span></span></span>
                  <span className="flex items-center gap-1.5">
                    <Badge>{i.status}</Badge>
                    {i.status === "booked" && <Button size="sm" variant="secondary" onClick={() => setStatus(i, "checked-in")}>Check in</Button>}
                    {i.status === "in-consultation" && <Link href={`/patients/${i.patient_id}?appt=${i.id}`}><Button size="sm">Open EMR</Button></Link>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function Availability({ onBook }: { onBook: () => void }) {
  const [date, setDate] = useState(today());
  const { data: docs } = useApi<Row[]>("/api/doctors");
  return (
    <>
      <div className="mb-3 flex items-end gap-2"><Field label="Date"><Input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></Field></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {docs?.map((d) => <DocSlots key={d.id} doc={d} date={date} onBook={onBook} />)}
      </div>
    </>
  );
}

function DocSlots({ doc, date, onBook }: { doc: Row; date: string; onBook: () => void }) {
  const { data } = useApi<Row>(`/api/doctors/${doc.id}/slots?${qs({ d: date })}`);
  const free = data?.slots.filter((s: Row) => s.available).length ?? 0;
  return (
    <Card title={<span>{doc.name}<span className="block text-xs font-normal text-muted">{doc.specialization} · ₹{doc.consult_fee}</span></span>} action={<Badge tone={free ? "green" : "slate"}>{data?.slots.length ? `${free} free` : "Off"}</Badge>}>
      <p className="mb-2 text-xs text-muted">{doc.available_days?.replaceAll(",", " · ")} | {data?.hours}</p>
      {!data?.slots.length ? <p className="text-sm text-muted">Not consulting on {data?.day}.</p> : (
        <div className="flex flex-wrap gap-1">{data.slots.map((s: Row) => <span key={s.time} className={cn("num rounded px-1.5 py-0.5 text-[11px]", s.available ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-400 line-through")}>{s.time}</span>)}</div>
      )}
      {free > 0 && <Button size="sm" variant="secondary" className="mt-3" onClick={onBook}>Book</Button>}
    </Card>
  );
}
