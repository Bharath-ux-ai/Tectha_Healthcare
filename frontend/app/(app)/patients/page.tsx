"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { age, api, fmtDate, getSession, type Row } from "@/lib/api";
import { PATIENT_FIELDS } from "@/lib/forms";
import { DataTable, FormModal } from "@/components/data";
import { Badge, Button, PageHeader, useToast } from "@/components/ui";

export default function Patients() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [k, setK] = useState(0);
  const role = getSession()?.user.role;
  const canWrite = role !== "admin" ? ["receptionist", "doctor", "nurse"].includes(role!) : true;
  const register = async (v: Row) => {
    const p = await api<Row>("/api/r/patients", { body: v });
    toast(`Registered ${p.name} · UHID ${p.uhid}. Portal login: ${p.uhid} / Welcome@123`);
    setK(k + 1);
    router.push(`/patients/${p.id}`);
  };
  return (
    <>
      <PageHeader module="Module 1 · Patient Experience" title="Patients" subtitle="Registration, unique health ID (UHID) and the 360° patient record."
        actions={canWrite && <Button onClick={() => setOpen(true)}><UserPlus className="size-4" /> Register patient</Button>} />
      <DataTable res="patients" reloadKey={k} searchPlaceholder="Search name, UHID, phone or email" onRowClick={(r) => router.push(`/patients/${r.id}`)}
        filters={[{ key: "gender", label: "Gender", options: ["Male", "Female", "Other"] }, { key: "status", label: "Status", options: ["active", "inactive"] }]}
        columns={[
          { key: "uhid", label: "UHID", render: (r) => <span className="num font-mono text-xs font-medium text-brand-700">{r.uhid}</span> },
          { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
          { key: "dob", label: "Age / Sex", render: (r) => `${age(r.dob)} · ${r.gender?.[0]}` },
          { key: "phone", label: "Mobile", sortable: false },
          { key: "blood_group", label: "Blood" },
          { key: "insurance_provider", label: "Insurance", render: (r) => r.insurance_provider || <span className="text-muted">Self-pay</span> },
          { key: "created_at", label: "Registered", render: (r) => fmtDate(r.created_at) },
          { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
        ]} />
      <FormModal open={open} onClose={() => setOpen(false)} title="Register new patient" fields={PATIENT_FIELDS} initial={{ gender: "", status: "active" }} onSubmit={register} submitLabel="Register & generate UHID" wide />
    </>
  );
}
