"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, CheckCircle2, Clock, FlaskConical, Stethoscope, Video } from "lucide-react";
import { api, fmtDate, getSession, qs, today, useApi, type Row } from "@/lib/api";
import { TeleModal } from "@/components/clinical";
import { Badge, Button, Card, Empty, PageHeader, Select, Spinner, Stat, useToast } from "@/components/ui";

export default function DoctorDesk() {
  const s = getSession()!.user;
  const router = useRouter();
  const toast = useToast();
  const { data: docs } = useApi<Row[]>("/api/doctors");
  const [docId, setDocId] = useState<string>(s.role === "doctor" ? String(s.staff_id) : "");
  const [k, setK] = useState(0);
  const [tele, setTele] = useState<Row | null>(null);
  const did = docId || (docs?.[0] ? String(docs[0].id) : "");
  const appts = useApi<{ items: Row[]; total?: number }>(did ? `/api/r/appointments?${qs({ doctor_id: did, date: today(), sort: "token", order: "asc", limit: 100, _k: k })}` : null);
  const labs = useApi<{ items: Row[]; total?: number }>(did ? `/api/r/lab-orders?${qs({ doctor_id: did, sort: "id", limit: 8, _k: k })}` : null);
  const ipd = useApi<{ items: Row[]; total?: number }>(did ? `/api/r/admissions?${qs({ doctor_id: did, status: "admitted", _k: k })}` : null);
  const items = (appts.data?.items || []).filter((a) => a.status !== "cancelled");
  const count = (st: string) => items.filter((a) => a.status === st).length;
  const start = async (a: Row) => {
    try {
      if (a.status !== "in-consultation") await api(`/api/r/appointments/${a.id}`, { method: "PATCH", body: { status: "in-consultation" } });
      if (a.type === "tele") setTele(a);
      else router.push(`/patients/${a.patient_id}?appt=${a.id}`);
      setK(k + 1);
    } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <>
      <PageHeader module="Module 2 · Clinical Care" title="Doctor desk" subtitle="Today's OPD list, in-patients on rounds and recent investigation results."
        actions={s.role !== "doctor" && <Select value={did} onChange={(e) => setDocId(e.target.value)} options={(docs || []).map((d) => ({ value: d.id, label: d.name }))} className="w-64" />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Waiting (checked-in)" value={count("checked-in")} icon={Clock} tone="amber" />
        <Stat label="In consultation" value={count("in-consultation")} icon={Stethoscope} />
        <Stat label="Completed today" value={count("completed")} icon={CheckCircle2} tone="teal" />
        <Stat label="In-patients on rounds" value={ipd.data?.total ?? "—"} icon={BedDouble} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Today's OPD list" className="lg:col-span-2" pad={false}>
          {appts.loading && !appts.data ? <Spinner /> : !items.length ? <Empty title="No appointments today" /> : (
            <ul className="divide-y divide-line">
              {items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="num flex size-9 items-center justify-center rounded-md bg-brand-50 text-sm font-semibold text-brand-700">#{a.token}</span>
                    <div><Link href={`/patients/${a.patient_id}`} className="font-medium hover:text-brand-700">{a.patient_name}</Link>
                      <p className="text-xs text-muted">{a.patient_uhid} · {a.time} · {a.reason || "OPD"}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{a.type}</Badge><Badge>{a.status}</Badge>
                    {["checked-in", "in-consultation", "booked"].includes(a.status) && (s.role === "doctor" || s.role === "admin") &&
                      <Button size="sm" variant={a.status === "in-consultation" ? "primary" : "secondary"} onClick={() => start(a)}>
                        {a.type === "tele" ? <><Video className="size-3.5" /> Start teleconsult</> : a.status === "in-consultation" ? "Continue" : "Start consult"}
                      </Button>}
                    {a.status === "completed" && <Link href={`/patients/${a.patient_id}`}><Button size="sm" variant="ghost">View EMR</Button></Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-4">
          <Card title="In-patients" pad={false}>
            {!ipd.data?.items.length ? <Empty title="No admitted patients" /> : <ul className="divide-y divide-line text-sm">{ipd.data.items.map((a) => (
              <li key={a.id}><Link href={`/patients/${a.patient_id}`} className="block px-4 py-2.5 hover:bg-slate-50"><b>{a.patient_name}</b><span className="block text-xs text-muted">{a.bed_label} · since {fmtDate(a.admit_date)} · {a.reason}</span></Link></li>))}</ul>}
          </Card>
          <Card title="Recent investigations" pad={false}>
            {!labs.data?.items.length ? <Empty /> : <ul className="divide-y divide-line text-sm">{labs.data.items.map((l) => (
              <li key={l.id}><Link href={`/patients/${l.patient_id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50">
                <span><FlaskConical className="mr-1 inline size-3.5 text-muted" />{l.test_name}<span className="block text-xs text-muted">{l.patient_name}</span></span><Badge>{l.status}</Badge></Link></li>))}</ul>}
          </Card>
        </div>
      </div>
      {tele && <TeleModal open onClose={() => { setTele(null); router.push(`/patients/${tele.patient_id}?appt=${tele.id}`); }} appt={tele} />}
    </>
  );
}
