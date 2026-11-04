"use client";
import { useState } from "react";
import { AlertTriangle, CalendarX, PackageCheck, PackagePlus, Pill, Plus, Trash2 } from "lucide-react";
import { addDays, api, fmtDate, inr, today, useApi, type Row } from "@/lib/api";
import { CrudSection, DataTable } from "@/components/data";
import { RxView } from "@/components/clinical";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Stat, Tabs, useConfirm, useToast } from "@/components/ui";

export default function Pharmacy() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState("queue");
  const [k, setK] = useState(0);
  const [rx, setRx] = useState<Row | null>(null);
  const [po, setPo] = useState(false);
  const s = useApi<Row>(`/api/pharmacy/summary?_k=${k}`);
  const reload = () => setK(k + 1);
  const dispense = async () => {
    try {
      const r = await api<Row>(`/api/prescriptions/${rx!.id}/dispense`, { body: {} });
      toast(`Dispensed Rx #${r.id} (FEFO batches) · pharmacy charge posted to billing`);
      setRx(null);
      reload();
    } catch (e: any) { toast(e.message, "error"); }
  };
  const t = today();
  return (
    <>
      <PageHeader module="Module 5 · Pharmacy" title="Pharmacy" subtitle="Prescription-linked dispensing with batch, expiry and stock control." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Prescriptions to dispense" value={s.data?.pending_rx ?? "—"} icon={Pill} />
        <Stat label="Low-stock items" value={s.data?.low_stock.length ?? "—"} icon={AlertTriangle} tone="red" />
        <Stat label="Expiring ≤ 90 days" value={s.data?.expiring_soon.length ?? "—"} icon={CalendarX} tone="amber" sub={`${s.data?.expired.length ?? 0} expired batches with stock`} />
        <Stat label="Saleable stock value" value={inr(s.data?.stock_value)} icon={PackageCheck} tone="teal" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "queue", label: "Dispensing queue", count: s.data?.pending_rx }, { id: "inv", label: "Inventory & batches" }, { id: "alerts", label: "Stock alerts" }, { id: "po", label: "Purchase orders" }, { id: "sup", label: "Suppliers" }]} />
      {tab === "queue" && (
        <DataTable res="prescriptions" reloadKey={k} params={{}} filters={[{ key: "status", label: "Status", options: ["pending", "dispensed", "cancelled"] }]} searchPlaceholder="Search patient / UHID"
          columns={[{ key: "id", label: "Rx", render: (r) => <span className="num">#{r.id}</span> }, { key: "created_at", label: "Prescribed", render: (r) => fmtDate(r.created_at) },
            { key: "patient_name", label: "Patient", render: (r) => <>{r.patient_name}<span className="block text-xs text-muted">{r.patient_uhid}</span></> },
            { key: "doctor_name", label: "Doctor", render: (r) => r.doctor_name },
            { key: "items", label: "Medicines", render: (r) => <span className="text-xs">{r.items.map((i: Row) => `${i.medicine} ×${i.qty}`).join(", ")}</span> },
            { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }]}
          actions={(r) => <Button size="sm" variant={r.status === "pending" ? "primary" : "ghost"} onClick={() => setRx(r)}>{r.status === "pending" ? "Dispense" : "View"}</Button>} />
      )}
      {tab === "inv" && (
        <CrudSection key={k} res="medicines" title="Medicine batch" defaults={{ form: "Tablet", reorder_level: 50 }} searchPlaceholder="Search medicine, generic or batch"
          filters={[{ key: "form", label: "Form", options: ["Tablet", "Capsule", "Syrup", "Injection", "Inhaler", "Sachet"] }]}
          columns={[{ key: "name", label: "Medicine", render: (r) => <span className="font-medium">{r.name}<span className="block text-xs font-normal text-muted">{r.generic_name} · {r.form}</span></span> },
            { key: "batch_no", label: "Batch", render: (r) => <span className="font-mono text-xs">{r.batch_no}</span> },
            { key: "expiry_date", label: "Expiry", render: (r) => <span className="num">{fmtDate(r.expiry_date)} {r.expiry_date < t ? <Badge tone="red">expired</Badge> : r.expiry_date <= addDays(90) ? <Badge tone="amber">≤90d</Badge> : null}</span> },
            { key: "stock", label: "Stock", render: (r) => <span className={`num font-medium ${r.stock <= r.reorder_level ? "text-red-700" : ""}`}>{r.stock}</span> },
            { key: "reorder_level", label: "Reorder at" }, { key: "unit_price", label: "MRP/unit", render: (r) => inr(r.unit_price) }, { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name }]}
          fields={[{ name: "name", label: "Medicine name (with strength)", required: true, span: 2 }, { name: "generic_name", label: "Generic name" },
            { name: "form", label: "Form", type: "select", options: ["Tablet", "Capsule", "Syrup", "Injection", "Inhaler", "Sachet"] },
            { name: "batch_no", label: "Batch no.", required: true }, { name: "expiry_date", label: "Expiry date", type: "date", required: true },
            { name: "stock", label: "Stock (units)", type: "number", min: 0, required: true }, { name: "reorder_level", label: "Reorder level", type: "number", min: 0 },
            { name: "unit_price", label: "Unit price (₹)", type: "number", min: 0, required: true }, { name: "supplier_id", label: "Supplier", optionsFrom: { res: "suppliers" } }, { name: "manufacturer", label: "Manufacturer" }]} />
      )}
      {tab === "alerts" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Low stock (≤ reorder level)" pad={false}>
            {!s.data?.low_stock.length ? <Empty title="All items above reorder level" /> : <ul className="divide-y divide-line text-sm">{s.data.low_stock.map((x: Row) => (
              <li key={x.name} className="flex items-center justify-between px-4 py-2.5"><span>{x.name}</span><span className="num text-xs"><b className="text-red-700">{x.stock}</b> / {x.reorder_level}</span></li>))}</ul>}
            {!!s.data?.low_stock.length && <div className="border-t border-line p-3"><Button size="sm" className="w-full" onClick={() => setPo(true)}><PackagePlus className="size-4" /> Raise purchase order</Button></div>}
          </Card>
          <Card title="Expiring within 90 days" pad={false}>
            {!s.data?.expiring_soon.length ? <Empty /> : <ul className="divide-y divide-line text-sm">{s.data.expiring_soon.map((x: Row) => (
              <li key={x.id} className="flex items-center justify-between px-4 py-2.5"><span>{x.name}<span className="block font-mono text-xs text-muted">{x.batch_no} · {x.stock} units</span></span><Badge tone="amber">{fmtDate(x.expiry_date)}</Badge></li>))}</ul>}
          </Card>
          <Card title="Expired batches (blocked from dispensing)" pad={false}>
            {!s.data?.expired.length ? <Empty /> : <ul className="divide-y divide-line text-sm">{s.data.expired.map((x: Row) => (
              <li key={x.id} className="flex items-center justify-between gap-2 px-4 py-2.5"><span>{x.name}<span className="block font-mono text-xs text-muted">{x.batch_no} · {x.stock} units</span></span>
                <Button size="sm" variant="danger" onClick={async () => { if (await confirm(`Write off ${x.stock} expired units of ${x.name} (${x.batch_no})?`, { danger: true, label: "Write off" })) { await api(`/api/r/medicines/${x.id}`, { method: "PATCH", body: { stock: 0 } }); toast("Batch written off"); reload(); } }}>Write off</Button></li>))}</ul>}
          </Card>
        </div>
      )}
      {tab === "po" && (
        <DataTable res="purchase-orders" reloadKey={k} filters={[{ key: "status", label: "Status", options: ["ordered", "received", "cancelled"] }]}
          toolbar={<Button onClick={() => setPo(true)}><Plus className="size-4" /> New purchase order</Button>}
          columns={[{ key: "po_number", label: "PO", render: (r) => <span className="font-mono text-xs">{r.po_number}</span> }, { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name },
            { key: "items", label: "Items", render: (r) => <span className="text-xs">{r.items.map((i: Row) => `${i.name} ×${i.qty}`).join(", ")}</span> },
            { key: "total", label: "Total", render: (r) => inr(r.total) }, { key: "expected_date", label: "Expected", render: (r) => fmtDate(r.expected_date) }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }]}
          actions={(r) => r.status === "ordered" && <>
            <Button size="sm" variant="secondary" onClick={async () => { if (await confirm(`Receive ${r.po_number} into stock? New batches will be created.`)) { try { await api(`/api/purchase-orders/${r.id}/receive`, { body: {} }); toast("Goods received · stock updated · expense recorded"); reload(); } catch (e: any) { toast(e.message, "error"); } } }}><PackageCheck className="size-3.5" /> Receive</Button>
            <Button size="sm" variant="ghost" onClick={async () => { if (await confirm(`Cancel ${r.po_number}?`, { danger: true })) { await api(`/api/r/purchase-orders/${r.id}`, { method: "PATCH", body: { status: "cancelled" } }); reload(); } }}>Cancel</Button>
          </>} />
      )}
      {tab === "sup" && (
        <CrudSection res="suppliers" title="Supplier"
          columns={[{ key: "name", label: "Supplier", render: (r) => <span className="font-medium">{r.name}</span> }, { key: "contact_person", label: "Contact" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "gstin", label: "GSTIN" }]}
          fields={[{ name: "name", label: "Name", required: true }, { name: "contact_person", label: "Contact person" }, { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" }, { name: "gstin", label: "GSTIN" }, { name: "address", label: "Address", span: 2 }]} />
      )}
      <Modal open={!!rx} onClose={() => setRx(null)} title={`Prescription #${rx?.id} · ${rx?.patient_name}`} wide
        footer={rx?.status === "pending" && <><Button variant="secondary" onClick={() => setRx(null)}>Close</Button><Button onClick={dispense}>Dispense all (FEFO)</Button></>}>
        {rx && <div className="space-y-3"><RxView rx={rx} />{rx.notes && <p className="text-sm"><b>Doctor's note:</b> {rx.notes}</p>}
          <p className="text-xs text-muted">Stock is allocated from the earliest-expiring non-expired batch first. Expired batches are never dispensed.</p></div>}
      </Modal>
      <POModal open={po} onClose={() => setPo(false)} prefill={s.data?.low_stock} onDone={() => (toast("Purchase order raised"), reload(), setTab("po"))} />
    </>
  );
}

function POModal({ open, onClose, prefill, onDone }: { open: boolean; onClose: () => void; prefill?: Row[]; onDone: () => void }) {
  const { data: sups } = useApi<{ items: Row[] }>(open ? "/api/r/suppliers?limit=100" : null);
  const { data: cat } = useApi<Row[]>(open ? "/api/pharmacy/catalog" : null);
  const [sup, setSup] = useState("");
  const [exp, setExp] = useState(addDays(5));
  const [items, setItems] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [init, setInit] = useState(false);
  if (open && !init) {
    setInit(true);
    setErr(null);
    setItems(prefill?.length ? prefill.map((p) => ({ name: p.name, qty: Math.max(p.reorder_level * 2 - p.stock, 10), unit_price: "" })) : [{ name: "", qty: 50, unit_price: "" }]);
  }
  if (!open && init) setInit(false);
  const set = (i: number, k: string, v: any) => setItems(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const total = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_price || 0), 0);
  const save = async () => {
    if (!sup) return setErr("Select a supplier");
    if (items.some((i) => !i.name || !(Number(i.qty) > 0) || !(Number(i.unit_price) > 0))) return setErr("Each line needs medicine, quantity and purchase price");
    try { await api("/api/r/purchase-orders", { body: { supplier_id: Number(sup), expected_date: exp, items: items.map((i) => ({ ...i, qty: Number(i.qty), unit_price: Number(i.unit_price) })) } }); onDone(); onClose(); }
    catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New purchase order" wide footer={<><span className="num mr-auto self-center text-sm font-semibold">Total {inr(total)}</span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Place order</Button></>}>
      <div className="space-y-3">
        {err && <ErrorBox message={err} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier" required><Select value={sup} onChange={(e) => setSup(e.target.value)} placeholder="Select supplier" options={(sups?.items || []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="Expected delivery"><Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></Field>
        </div>
        <datalist id="po-cat">{cat?.map((c) => <option key={c.name} value={c.name} />)}</datalist>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <Input className="col-span-6" list="po-cat" placeholder="Medicine" value={it.name} onChange={(e) => set(i, "name", e.target.value)} />
            <Input className="col-span-2" type="number" min={1} placeholder="Qty" value={it.qty} onChange={(e) => set(i, "qty", e.target.value)} />
            <Input className="col-span-3" type="number" min={0} placeholder="Price ₹" value={it.unit_price} onChange={(e) => set(i, "unit_price", e.target.value)} />
            <Button className="col-span-1" variant="ghost" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="size-4 text-red-600" /></Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" onClick={() => setItems([...items, { name: "", qty: 50, unit_price: "" }])}><Plus className="size-4" /> Add line</Button>
      </div>
    </Modal>
  );
}
