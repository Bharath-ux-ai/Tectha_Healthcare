"use client";
import { useEffect, useState } from "react";
import { FileText, IndianRupee, Receipt, RotateCcw, ShieldCheck, Wallet } from "lucide-react";
import { age, api, fmtDate, fmtDateTime, getSession, inr, today, useApi, type Row } from "@/lib/api";
import { CrudSection, DataTable, PatientSelect } from "@/components/data";
import { PrintDoc } from "@/components/clinical";
import { Bars, Donut } from "@/components/charts";
import { Badge, Button, Card, DemoTag, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Stat, Tabs, useToast } from "@/components/ui";

export default function Finance() {
  const role = getSession()!.user.role;
  const acct = role === "admin" || role === "accountant";
  const [tab, setTab] = useState("bill");
  const [inv, setInv] = useState<number | null>(null);
  const [k, setK] = useState(0);
  const tabs = [{ id: "bill", label: "Patient billing" }, { id: "inv", label: "Invoices" }, { id: "pay", label: "Payments" },
    ...(acct ? [{ id: "tpa", label: "Insurance / TPA" }, { id: "exp", label: "Expenses" }, { id: "rep", label: "Reports" }] : [])];
  return (
    <>
      <PageHeader module="Module 4 · Financial Management" title="Billing & finance" subtitle="Charges flow in automatically from consultations, diagnostics, pharmacy and bed stays." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === "bill" && <Billing openInvoice={setInv} k={k} />}
      {tab === "inv" && (
        <DataTable res="invoices" reloadKey={k} onRowClick={(r) => setInv(r.id)} searchPlaceholder="Search invoice no., patient, UHID"
          filters={[{ key: "status", label: "Status", options: ["unpaid", "partial", "paid", "refunded"] }]}
          columns={[
            { key: "invoice_no", label: "Invoice", render: (r) => <span className="font-mono text-xs font-medium text-brand-700">{r.invoice_no}</span> },
            { key: "created_at", label: "Date", render: (r) => fmtDate(r.created_at) },
            { key: "patient_name", label: "Patient", render: (r) => <>{r.patient_name}<span className="block text-xs text-muted">{r.patient_uhid}</span></> },
            { key: "total", label: "Total", render: (r) => <span className="num">{inr(r.total)}</span> }, { key: "paid", label: "Paid", render: (r) => <span className="num">{inr(r.paid)}</span> },
            { key: "balance", label: "Balance", render: (r) => <span className={`num ${r.balance > 0 ? "font-medium text-red-700" : ""}`}>{inr(r.balance)}</span> },
            { key: "claim_status", label: "Claim", render: (r) => r.claim_status !== "none" ? <Badge>{r.claim_status}</Badge> : "—" },
            { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
          ]} />
      )}
      {tab === "pay" && (
        <DataTable res="payments" reloadKey={k} filters={[{ key: "kind", label: "Type", options: ["payment", "advance", "advance_applied", "refund", "insurance"] }, { key: "mode", label: "Mode", options: ["cash", "card", "upi", "insurance", "adjustment"] }]}
          columns={[{ key: "id", label: "Receipt", render: (r) => <span className="num">#{r.id}</span> }, { key: "created_at", label: "When", render: (r) => fmtDateTime(r.created_at) },
            { key: "patient_name", label: "Patient", render: (r) => r.patient_name }, { key: "kind", label: "Type", render: (r) => <Badge tone={r.kind === "refund" ? "red" : r.kind === "advance" ? "teal" : "blue"}>{r.kind.replace("_", " ")}</Badge> },
            { key: "mode", label: "Mode" }, { key: "amount", label: "Amount", render: (r) => <span className={`num font-medium ${r.kind === "refund" ? "text-red-700" : ""}`}>{r.kind === "refund" ? "−" : ""}{inr(r.amount)}</span> },
            { key: "note", label: "Note" }]} />
      )}
      {tab === "tpa" && (
        <>
          <p className="mb-3 flex items-center gap-2 text-sm text-muted"><DemoTag>Demo workflow</DemoTag> Claim lifecycle is simulated: submitted → approved / rejected → settled. No insurer or TPA API is called.</p>
          <DataTable res="invoices" params={{ claim_status: "submitted,approved,rejected,settled" }} reloadKey={k} onRowClick={(r) => setInv(r.id)}
            filters={[{ key: "claim_status", label: "Claim status", options: ["submitted", "approved", "rejected", "settled"] }]}
            columns={[{ key: "invoice_no", label: "Invoice", render: (r) => <span className="font-mono text-xs">{r.invoice_no}</span> }, { key: "patient_name", label: "Patient", render: (r) => r.patient_name },
              { key: "tpa_name", label: "TPA / insurer" }, { key: "policy_no", label: "Policy" }, { key: "claim_amount", label: "Claimed", render: (r) => inr(r.claim_amount) },
              { key: "approved_amount", label: "Approved", render: (r) => inr(r.approved_amount) }, { key: "claim_status", label: "Status", render: (r) => <Badge>{r.claim_status}</Badge> }]} />
        </>
      )}
      {tab === "exp" && (
        <CrudSection res="expenses" title="Expense" defaults={{ date: today() }}
          filters={[{ key: "category", label: "Category", options: ["Salaries", "Utilities", "Consumables", "Maintenance", "Housekeeping", "Marketing", "Pharmacy purchase", "Other"] }]}
          columns={[{ key: "date", label: "Date", render: (r) => fmtDate(r.date) }, { key: "category", label: "Category", render: (r) => <Badge tone="slate">{r.category}</Badge> },
            { key: "description", label: "Description" }, { key: "vendor", label: "Vendor" }, { key: "amount", label: "Amount", render: (r) => <span className="num font-medium">{inr(r.amount)}</span> }]}
          fields={[{ name: "date", label: "Date", type: "date", required: true }, { name: "category", label: "Category", type: "select", required: true, options: ["Salaries", "Utilities", "Consumables", "Maintenance", "Housekeeping", "Marketing", "Other"] },
            { name: "amount", label: "Amount (₹)", type: "number", min: 1, required: true }, { name: "vendor", label: "Vendor" }, { name: "description", label: "Description", span: 2 }]} />
      )}
      {tab === "rep" && <Reports />}
      <InvoiceModal id={inv} onClose={() => setInv(null)} onChange={() => setK(k + 1)} />
    </>
  );
}

function Billing({ openInvoice, k }: { openInvoice: (id: number) => void; k: number }) {
  const toast = useToast();
  const [pid, setPid] = useState<number | "">("");
  const [pt, setPt] = useState<Row | null>(null);
  const [r, setR] = useState(0);
  const [f, setF] = useState<Row>({ discount: 0, tax_pct: 0 });
  const [adv, setAdv] = useState<Row>({ amount: "", mode: "cash" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("patient");
    if (q) setPid(Number(q));
  }, []);
  useEffect(() => { if (pt) setF({ discount: 0, tax_pct: 0, tpa_name: pt.insurance_provider || "", policy_no: pt.policy_no || "" }); }, [pt]);
  const a = useApi<Row>(pid ? `/api/patients/${pid}/account?_k=${r}-${k}` : null);
  const sub = a.data?.unbilled_total || 0;
  const total = Math.max(0, sub - Number(f.discount || 0)) * (1 + Number(f.tax_pct || 0) / 100);
  const generate = async (withClaim: boolean) => {
    if (Number(f.discount) > sub) return toast("Discount cannot exceed subtotal", "error");
    setBusy(true);
    try {
      const inv = await api<Row>("/api/invoices/generate", { body: { patient_id: pid, discount: f.discount, tax_pct: f.tax_pct, ...(withClaim ? { tpa_name: f.tpa_name, policy_no: f.policy_no, claim_amount: total } : {}) } });
      toast(`${inv.invoice_no} generated · ${inr(inv.total)}${inv.paid ? ` · advance ${inr(inv.paid)} adjusted` : ""}`);
      setR(r + 1);
      openInvoice(inv.id);
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card title="Select patient"><PatientSelect value={pid} onChange={(id, p) => (setPid(id), setPt(p || null))} /></Card>
        {!pid ? <Card><Empty title="Choose a patient to view unbilled charges" hint="Consultations, lab and radiology orders, dispensed prescriptions and bed stays post charges automatically." /></Card>
          : a.error ? <ErrorBox message={a.error} /> : !a.data ? <Spinner /> : (
            <Card title="Unbilled charges" pad={false} action={<span className="num text-sm font-semibold">{inr(sub)}</span>}>
              {!a.data.unbilled.length ? <Empty title="Nothing to bill" hint="All charges for this patient are invoiced." /> : (
                <table className="w-full text-sm"><tbody>{a.data.unbilled.map((c: Row) => (
                  <tr key={c.id} className="border-b border-line last:border-0"><td className="px-4 py-2.5"><Badge tone="blue">{c.source}</Badge></td><td className="px-4 py-2.5">{c.description}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{fmtDate(c.created_at)}</td><td className="num px-4 py-2.5 text-right font-medium">{inr(c.amount)}</td></tr>))}</tbody></table>
              )}
            </Card>
          )}
      </div>
      <div className="space-y-4">
        <Card title="Generate invoice">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Discount (₹)"><Input type="number" min={0} value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
              <Field label="Tax (%)"><Input type="number" min={0} max={28} value={f.tax_pct} onChange={(e) => setF({ ...f, tax_pct: e.target.value })} /></Field>
            </div>
            <dl className="num space-y-1 rounded-md bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{inr(sub)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Advance available</dt><dd className="text-teal-700">{inr(a.data?.advance_balance)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Invoice total</dt><dd>{inr(total)}</dd></div>
            </dl>
            <Button className="w-full" disabled={!a.data?.unbilled.length} loading={busy} onClick={() => generate(false)}><Receipt className="size-4" /> Generate invoice</Button>
            <div className="rounded-md border border-dashed border-line p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">Cashless / insurance <DemoTag /></p>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="TPA / insurer" value={f.tpa_name || ""} onChange={(e) => setF({ ...f, tpa_name: e.target.value })} />
                <Input placeholder="Policy no." value={f.policy_no || ""} onChange={(e) => setF({ ...f, policy_no: e.target.value })} />
              </div>
              <Button variant="secondary" className="mt-2 w-full" disabled={!a.data?.unbilled.length || !f.tpa_name} loading={busy} onClick={() => generate(true)}><ShieldCheck className="size-4" /> Invoice & submit claim</Button>
            </div>
          </div>
        </Card>
        <Card title="Advance deposit">
          <div className="flex gap-2">
            <Input type="number" min={1} placeholder="Amount" value={adv.amount} onChange={(e) => setAdv({ ...adv, amount: e.target.value })} />
            <Select value={adv.mode} onChange={(e) => setAdv({ ...adv, mode: e.target.value })} options={["cash", "card", "upi"]} className="w-24" />
          </div>
          <Button variant="teal" className="mt-2 w-full" disabled={!pid || !(Number(adv.amount) > 0)} onClick={async () => {
            try { await api("/api/payments/advance", { body: { patient_id: pid, ...adv } }); toast(`Advance ${inr(adv.amount)} received`); setAdv({ amount: "", mode: "cash" }); setR(r + 1); } catch (e: any) { toast(e.message, "error"); }
          }}><Wallet className="size-4" /> Collect advance</Button>
        </Card>
      </div>
    </div>
  );
}

function InvoiceModal({ id, onClose, onChange }: { id: number | null; onClose: () => void; onChange: () => void }) {
  const toast = useToast();
  const role = getSession()!.user.role;
  const acct = role === "admin" || role === "accountant";
  const [k, setK] = useState(0);
  const { data: inv, error } = useApi<Row>(id ? `/api/invoices/${id}/detail?_k=${k}` : null);
  const [pay, setPay] = useState<Row>({ amount: "", mode: "cash" });
  const [ref, setRef] = useState<Row>({ amount: "", reason: "" });
  const [appr, setAppr] = useState("");
  useEffect(() => { if (inv) (setPay({ amount: inv.balance || "", mode: "cash" }), setAppr(String(inv.claim_amount || inv.balance))); }, [inv]);
  const act = async (path: string, body: Row, msg: string) => {
    try { await api(`/api/invoices/${id}/${path}`, { body }); toast(msg); setK(k + 1); onChange(); } catch (e: any) { toast(e.message, "error"); }
  };
  return (
    <Modal open={!!id} onClose={onClose} title="Invoice" wide>
      {error ? <ErrorBox message={error} /> : !inv || inv.id !== id ? <Spinner /> : (
        <div className="space-y-4">
          <PrintDoc title="Tax Invoice" meta={<>{inv.invoice_no}<br />{fmtDate(inv.created_at)}</>}>
            <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm">
              <div><p className="font-semibold">{inv.patient.name}</p><p className="text-xs text-muted">{inv.patient.uhid} · {age(inv.patient.dob)} · {inv.patient.phone}</p></div>
              <div className="text-right"><Badge>{inv.status}</Badge>{inv.claim_status !== "none" && <p className="mt-1 text-xs text-muted">Claim: {inv.tpa_name} · {inv.claim_status}</p>}</div>
            </div>
            <table className="num w-full text-sm">
              <thead><tr className="border-y border-line text-left text-xs text-muted"><th className="py-2">Item</th><th className="py-2">Type</th><th className="py-2 text-right">Amount</th></tr></thead>
              <tbody>{inv.items.map((i: Row, n: number) => <tr key={n} className="border-b border-line"><td className="py-2">{i.description}</td><td className="py-2 capitalize text-muted">{i.source}</td><td className="py-2 text-right">{inr(i.amount)}</td></tr>)}</tbody>
              <tfoot className="text-sm">
                {[["Subtotal", inv.subtotal], ["Discount", -inv.discount], ["Tax", inv.tax]].map(([l, v]: any) => <tr key={l}><td colSpan={2} className="pt-1.5 text-right text-muted">{l}</td><td className="pt-1.5 text-right">{inr(v)}</td></tr>)}
                <tr className="font-semibold"><td colSpan={2} className="pt-1.5 text-right">Total</td><td className="pt-1.5 text-right">{inr(inv.total)}</td></tr>
                <tr><td colSpan={2} className="text-right text-muted">Paid</td><td className="text-right text-teal-700">{inr(inv.paid)}</td></tr>
                <tr className="font-semibold"><td colSpan={2} className="text-right">Balance due</td><td className={`text-right ${inv.balance > 0 ? "text-red-700" : ""}`}>{inr(inv.balance)}</td></tr>
              </tfoot>
            </table>
            {inv.payments.length > 0 && (
              <div className="mt-3"><p className="mb-1 text-xs font-medium text-muted">Payment history</p>
                <ul className="space-y-0.5 text-xs">{inv.payments.map((p: Row) => <li key={p.id} className="num flex justify-between"><span>#{p.id} · {fmtDateTime(p.created_at)} · {p.kind.replace("_", " ")} ({p.mode}) {p.note && `· ${p.note}`}</span><span className={p.kind === "refund" ? "text-red-700" : ""}>{p.kind === "refund" ? "−" : ""}{inr(p.amount)}</span></li>)}</ul></div>
            )}
          </PrintDoc>
          <div className="grid gap-3 sm:grid-cols-2 no-print">
            {inv.balance > 0 && (
              <Card title="Collect payment">
                <div className="flex gap-2"><Input type="number" min={1} max={inv.balance} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                  <Select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })} options={["cash", "card", "upi"]} className="w-24" /></div>
                <p className="mt-1 text-xs text-muted">Enter less than the balance for a partial payment.</p>
                <Button className="mt-2 w-full" disabled={!(Number(pay.amount) > 0)} onClick={() => act("pay", pay, `Payment ${inr(pay.amount)} recorded`)}><IndianRupee className="size-4" /> Record payment</Button>
              </Card>
            )}
            {acct && inv.paid > 0 && (
              <Card title="Refund">
                <div className="grid grid-cols-2 gap-2"><Input type="number" placeholder={`Max ${inr(inv.paid)}`} value={ref.amount} onChange={(e) => setRef({ ...ref, amount: e.target.value })} />
                  <Input placeholder="Reason (required)" value={ref.reason} onChange={(e) => setRef({ ...ref, reason: e.target.value })} /></div>
                <Button variant="danger" className="mt-2 w-full" disabled={!(Number(ref.amount) > 0) || !ref.reason.trim()} onClick={() => act("refund", ref, "Refund processed")}><RotateCcw className="size-4" /> Process refund</Button>
              </Card>
            )}
            {acct && (
              <Card title={<span className="flex items-center gap-2">Insurance claim <DemoTag /></span>}>
                <p className="mb-2 text-sm">Status: <Badge>{inv.claim_status}</Badge> {inv.approved_amount > 0 && <span className="num text-xs text-muted">approved {inr(inv.approved_amount)}</span>}</p>
                {inv.claim_status === "none" && inv.balance > 0 && <Button size="sm" variant="secondary" disabled={!inv.patient.insurance_provider} onClick={() => act("claim", { status: "submitted", tpa_name: inv.patient.insurance_provider, policy_no: inv.patient.policy_no }, "Claim submitted")}>{inv.patient.insurance_provider ? `Submit to ${inv.patient.insurance_provider}` : "No insurance on file"}</Button>}
                {inv.claim_status === "submitted" && <div className="flex gap-2"><Input type="number" value={appr} onChange={(e) => setAppr(e.target.value)} />
                  <Button size="sm" variant="teal" onClick={() => act("claim", { status: "approved", approved_amount: appr }, "Claim approved")}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => act("claim", { status: "rejected" }, "Claim rejected")}>Reject</Button></div>}
                {inv.claim_status === "approved" && <Button size="sm" variant="teal" onClick={() => act("claim", { status: "settled" }, "Settlement posted")}>Mark settled · post {inr(Math.min(inv.approved_amount, inv.balance))}</Button>}
                {inv.claim_status === "rejected" && <Button size="sm" variant="secondary" onClick={() => act("claim", { status: "submitted" }, "Claim re-submitted")}>Re-submit</Button>}
              </Card>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Reports() {
  const { data: d, error, reload } = useApi<Row>("/api/finance/summary");
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!d) return <Spinner />;
  const csv = () => {
    const rows = [["Date", "Collections", "Expenses"], ...d.daily.map((x: Row) => [x.date, x.collections, x.expenses])];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" }));
    a.download = `tecthha-finance-${today()}.csv`;
    a.click();
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Billed" value={inr(d.billed)} icon={FileText} /><Stat label="Collected (net)" value={inr(d.collected)} tone="teal" />
        <Stat label="Outstanding" value={inr(d.outstanding)} tone="red" /><Stat label="Expenses" value={inr(d.expenses)} tone="amber" />
        <Stat label="Net (collected − expenses)" value={inr(d.net)} sub={`Refunds ${inr(d.refunds)}`} />
      </div>
      <Card title="Collections vs expenses · 14 days" action={<Button size="sm" variant="secondary" onClick={csv}>Export CSV</Button>}>
        <Bars data={d.daily} x="date" money bars={[{ key: "collections", label: "Collections" }, { key: "expenses", label: "Expenses", color: "#d99a1e" }]} height={260} />
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Revenue by service"><Donut data={d.by_source} money /></Card>
        <Card title="Collections by mode"><Donut data={d.by_mode} money /></Card>
        <Card title="Expenses by category"><Donut data={d.expense_by_category} money /></Card>
      </div>
    </div>
  );
}
