"use client";
/* Reusable, config-driven data table, form modal and CRUD section used across all six modules. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api, qs, useApi, type Row } from "@/lib/api";
import { Button, Card, Empty, ErrorBox, Field, Input, Modal, Select, Spinner, Textarea, cn, useConfirm, useToast } from "./ui";

export type Col = { key: string; label: string; render?: (r: Row) => ReactNode; sortable?: boolean; className?: string };
export type Filter = { key: string; label: string; options: (string | { value: string; label: string })[] };

export function DataTable({ res, columns, filters = [], params = {}, actions, toolbar, reloadKey = 0, pageSize = 10, defaultSort = "id", defaultOrder = "desc", searchPlaceholder = "Search…", emptyHint, onRowClick, endpoint }: {
  res: string; columns: Col[]; filters?: Filter[]; params?: Row; actions?: (r: Row, reload: () => void) => ReactNode; toolbar?: ReactNode; reloadKey?: number;
  pageSize?: number; defaultSort?: string; defaultOrder?: "asc" | "desc"; searchPlaceholder?: string; emptyHint?: string; onRowClick?: (r: Row) => void; endpoint?: string;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [fv, setFv] = useState<Row>({});
  const [sort, setSort] = useState({ key: defaultSort, order: defaultOrder });
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => (setDebounced(q), setPage(0)), 300);
    return () => clearTimeout(t);
  }, [q]);
  const path = `${endpoint || `/api/r/${res}`}?${qs({ ...params, ...fv, q: debounced, sort: sort.key, order: sort.order, limit: pageSize, offset: page * pageSize, _k: reloadKey })}`;
  const { data, error, loading, reload } = useApi<{ items: Row[]; total: number }>(path);
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const toggleSort = (k: string) => setSort((s) => ({ key: k, order: s.key === k && s.order === "desc" ? "asc" : "desc" }));
  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="pl-8" />
        </div>
        {filters.map((f) => (
          <div key={f.key} className="w-[calc(50%-4px)] sm:w-40">
            <Select value={fv[f.key] || ""} onChange={(e) => (setFv({ ...fv, [f.key]: e.target.value }), setPage(0))} options={f.options} placeholder={`All ${f.label.toLowerCase()}`} aria-label={f.label} />
          </div>
        ))}
        {toolbar}
      </div>
      {error ? <div className="p-4"><ErrorBox message={error} onRetry={reload} /></div> : loading && !data ? <Spinner /> : !data?.items.length ? <Empty hint={emptyHint || (debounced || Object.values(fv).some(Boolean) ? "Try clearing the search or filters." : undefined)} /> : (
        <div className={cn("overflow-x-auto transition-opacity", loading && "opacity-60")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-slate-50/70 text-left text-xs font-medium text-muted">
                {columns.map((c) => (
                  <th key={c.key} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", c.className)}>
                    {c.sortable !== false && !c.render ? (
                      <button className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort(c.key)}>
                        {c.label}
                        {sort.key === c.key && (sort.order === "desc" ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                      </button>
                    ) : c.label}
                  </th>
                ))}
                {actions && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("border-b border-line last:border-0 hover:bg-slate-50/60", onRowClick && "cursor-pointer")}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-2.5 align-middle", c.className)}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>
                  ))}
                  {actions && <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">{actions(r, reload)}</div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
        <span className="num">{total} record{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
          <span className="num">Page {page + 1} / {pages}</span>
          <Button size="sm" variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
        </div>
      </div>
    </Card>
  );
}

export type FieldDef = {
  name: string; label: string; type?: "text" | "number" | "date" | "time" | "select" | "textarea" | "email" | "tel" | "patient" | "password";
  options?: (string | { value: string | number; label: string })[]; optionsFrom?: { res: string; params?: Row; label?: (r: Row) => string };
  required?: boolean; min?: number; max?: number; span?: 2; placeholder?: string; hint?: string; editable?: boolean;
};

function ResourceOptions({ src, ...p }: { src: NonNullable<FieldDef["optionsFrom"]> } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { data } = useApi<{ items: Row[] }>(`/api/r/${src.res}?${qs({ ...src.params, limit: 500, sort: "id", order: "asc" })}`);
  return <Select {...p} placeholder="Select…" options={(data?.items || []).map((r) => ({ value: r.id, label: src.label ? src.label(r) : r.name }))} />;
}

export function validate(fields: FieldDef[], v: Row) {
  const e: Row = {};
  for (const f of fields) {
    const val = v[f.name];
    if (f.required && (val === undefined || val === null || String(val).trim() === "")) e[f.name] = "Required";
    else if (f.type === "number" && val !== "" && val !== undefined && val !== null) {
      if (isNaN(Number(val))) e[f.name] = "Must be a number";
      else if (f.min !== undefined && Number(val) < f.min) e[f.name] = `Minimum ${f.min}`;
      else if (f.max !== undefined && Number(val) > f.max) e[f.name] = `Maximum ${f.max}`;
    } else if (f.type === "email" && val && !/^\S+@\S+\.\S+$/.test(val)) e[f.name] = "Invalid email";
    else if (f.type === "tel" && val && String(val).replace(/\D/g, "").length < 10) e[f.name] = "Enter at least 10 digits";
  }
  return e;
}

export function FormFields({ fields, values, setValues, errors }: { fields: FieldDef[]; values: Row; setValues: (v: Row) => void; errors: Row }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const common = { value: values[f.name] ?? "", onChange: (e: any) => setValues({ ...values, [f.name]: e.target.value }), placeholder: f.placeholder, disabled: f.editable === false && values.id };
        return (
          <Field key={f.name} label={f.label} required={f.required} error={errors[f.name]} hint={f.hint} className={f.span === 2 || f.type === "textarea" ? "sm:col-span-2" : ""}>
            {f.type === "select" ? <Select {...common} options={f.options || []} placeholder="Select…" />
              : f.optionsFrom ? <ResourceOptions {...common} src={f.optionsFrom} />
              : f.type === "patient" ? <PatientSelect value={values[f.name]} onChange={(id) => setValues({ ...values, [f.name]: id })} />
              : f.type === "textarea" ? <Textarea {...common} />
              : <Input {...common} type={f.type || "text"} min={f.min} max={f.max} step={f.type === "number" ? "any" : undefined} />}
          </Field>
        );
      })}
    </div>
  );
}

export function FormModal({ open, onClose, title, fields, initial = {}, onSubmit, submitLabel = "Save", wide, children }: {
  open: boolean; onClose: () => void; title: string; fields: FieldDef[]; initial?: Row; onSubmit: (v: Row) => Promise<unknown>; submitLabel?: string; wide?: boolean; children?: ReactNode;
}) {
  const [v, setV] = useState<Row>(initial);
  const [errors, setErrors] = useState<Row>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = JSON.stringify(initial);
  useEffect(() => {
    if (open) (setV(JSON.parse(key)), setErrors({}), setErr(null));
  }, [open, key]);
  const submit = async () => {
    const e = validate(fields, v);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(v);
      onClose();
    } catch (x: any) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} wide={wide}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>{submitLabel}</Button></>}>
      <form onSubmit={(e) => (e.preventDefault(), submit())} className="space-y-4">
        {err && <ErrorBox message={err} />}
        <FormFields fields={fields} values={v} setValues={setV} errors={errors} />
        {children}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Full create / edit / delete section for a resource. */
export function CrudSection({ res, title, columns, fields, filters, params, canWrite = true, canDelete = true, extraActions, defaults = {}, createLabel, transform, searchPlaceholder }: {
  res: string; title: string; columns: Col[]; fields: FieldDef[]; filters?: Filter[]; params?: Row; canWrite?: boolean; canDelete?: boolean;
  extraActions?: (r: Row, reload: () => void) => ReactNode; defaults?: Row; createLabel?: string; transform?: (v: Row) => Row; searchPlaceholder?: string;
}) {
  const [edit, setEdit] = useState<Row | null>(null);
  const [k, setK] = useState(0);
  const toast = useToast();
  const confirm = useConfirm();
  const reload = () => setK((x) => x + 1);
  const save = async (v: Row) => {
    const body = transform ? transform(v) : v;
    if (v.id) await api(`/api/r/${res}/${v.id}`, { method: "PATCH", body });
    else await api(`/api/r/${res}`, { method: "POST", body: { ...params, ...body } });
    toast(`${title} ${v.id ? "updated" : "created"}`);
    reload();
  };
  const del = async (r: Row) => {
    if (!(await confirm(`Delete this ${title.toLowerCase()} record? This cannot be undone.`, { danger: true, label: "Delete" }))) return;
    try {
      await api(`/api/r/${res}/${r.id}`, { method: "DELETE" });
      toast(`${title} deleted`);
      reload();
    } catch (e: any) {
      toast(e.message, "error");
    }
  };
  const editable = useMemo(() => fields, [fields]);
  return (
    <>
      <DataTable res={res} columns={columns} filters={filters} params={params} reloadKey={k} searchPlaceholder={searchPlaceholder}
        toolbar={canWrite && <Button onClick={() => setEdit({ ...defaults })}><Plus className="size-4" /> {createLabel || `Add ${title.toLowerCase()}`}</Button>}
        actions={(r, rl) => (
          <>
            {extraActions?.(r, rl)}
            {canWrite && <Button size="sm" variant="ghost" onClick={() => setEdit(r)} aria-label="Edit"><Pencil className="size-3.5" /></Button>}
            {canWrite && canDelete && <Button size="sm" variant="ghost" onClick={() => del(r)} aria-label="Delete"><Trash2 className="size-3.5 text-red-600" /></Button>}
          </>
        )} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={`${edit?.id ? "Edit" : "New"} ${title.toLowerCase()}`} fields={editable} initial={edit || {}} onSubmit={save} />
    </>
  );
}

/** Async patient search-select (by name / UHID / phone). */
export function PatientSelect({ value, onChange }: { value?: number | string; onChange: (id: number | "", p?: Row) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Row | null>(null);
  const { data } = useApi<{ items: Row[] }>(open ? `/api/r/patients?${qs({ q, limit: 8 })}` : null);
  useEffect(() => {
    if (value && (!sel || sel.id !== Number(value))) api(`/api/r/patients/${value}`).then(setSel).catch(() => {});
    if (!value) setSel(null);
  }, [value]); // eslint-disable-line
  return (
    <div className="relative">
      <Input value={open ? q : sel ? `${sel.name} · ${sel.uhid}` : ""} placeholder="Search patient by name, UHID or phone"
        onFocus={() => (setOpen(true), setQ(""))} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-white shadow-lg">
          {!data ? <p className="p-3 text-xs text-muted">Searching…</p> : !data.items.length ? <p className="p-3 text-xs text-muted">No patients found</p> :
            data.items.map((p) => (
              <button type="button" key={p.id} onMouseDown={() => (setSel(p), onChange(p.id, p), setOpen(false))} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50">
                <span className="font-medium">{p.name}</span><span className="text-xs text-muted">{p.uhid} · {p.phone}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
