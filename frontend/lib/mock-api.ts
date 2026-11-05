import seedData from "./demo-data.json";

const DB_KEY = "tecthha_demo_db_v5";

type DB = Record<string, any[]>;

export function getDemoDB(): DB {
  if (typeof window === "undefined") return seedData as unknown as DB;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      localStorage.setItem(DB_KEY, JSON.stringify(seedData));
      return JSON.parse(JSON.stringify(seedData));
    }
    const parsed = JSON.parse(raw);
    if (!parsed.patients || parsed.patients.length === 0) {
      localStorage.setItem(DB_KEY, JSON.stringify(seedData));
      return JSON.parse(JSON.stringify(seedData));
    }
    return parsed;
  } catch {
    return JSON.parse(JSON.stringify(seedData));
  }
}

export function saveDemoDB(db: DB) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch (e) {
      console.error("Failed to save demo db", e);
    }
  }
}

export function resetDemoDB() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(DB_KEY);
    localStorage.setItem(DB_KEY, JSON.stringify(seedData));
  }
}

const tableMap: Record<string, string> = {
  "lab-orders": "lab_orders",
  "purchase-orders": "purchase_orders",
  "audit-logs": "audit_logs",
};

function getTable(res: string): string {
  return tableMap[res] || res;
}

function enrichRows(db: DB, rows: any[]): any[] {
  const pMap = new Map((db.patients || []).map((p) => [p.id, p]));
  const sMap = new Map((db.staff || []).map((s) => [s.id, s]));
  const bMap = new Map((db.beds || []).map((b) => [b.id, b]));
  const supMap = new Map((db.suppliers || []).map((s) => [s.id, s]));
  const dMap = new Map((db.departments || []).map((d) => [d.id, d]));

  return rows.map((r) => {
    const d = { ...r };
    if (typeof d.items === "string") {
      try {
        d.items = JSON.parse(d.items);
      } catch {
        d.items = [];
      }
    }
    if (d.patient_id && pMap.has(d.patient_id)) {
      const p = pMap.get(d.patient_id);
      d.patient_name = p.name;
      d.patient_uhid = p.uhid;
      d.patient_phone = p.phone;
    }
    if (d.doctor_id && sMap.has(d.doctor_id)) {
      d.doctor_name = sMap.get(d.doctor_id).name;
    }
    if (d.staff_id && sMap.has(d.staff_id)) {
      const s = sMap.get(d.staff_id);
      d.staff_name = s.name;
      d.staff_role = s.role;
    }
    if (d.bed_id && bMap.has(d.bed_id)) {
      const b = bMap.get(d.bed_id);
      d.bed_label = `${b.ward} · ${b.bed_no}`;
    }
    if (d.supplier_id && supMap.has(d.supplier_id)) {
      d.supplier_name = supMap.get(d.supplier_id).name;
    }
    if (d.department_id && dMap.has(d.department_id)) {
      d.department_name = dMap.get(d.department_id).name;
    }
    return d;
  });
}

const LAB_CATALOG = {
  "Complete Blood Count": 350,
  "Fasting Blood Sugar": 150,
  HbA1c: 550,
  "Lipid Profile": 700,
  "Liver Function Test": 800,
  "Kidney Function Test": 750,
  "Thyroid Profile": 650,
  "Urine Routine": 200,
  "Dengue NS1": 900,
  CRP: 450,
};

const RADIOLOGY_CATALOG: Record<string, [string, number]> = {
  "X-ray Chest PA": ["X-ray", 600],
  "X-ray Knee AP/Lat": ["X-ray", 700],
  "CT Brain Plain": ["CT", 3500],
  "CT Abdomen Contrast": ["CT", 6500],
  "MRI Lumbar Spine": ["MRI", 7500],
  "MRI Knee": ["MRI", 6800],
  "USG Abdomen": ["USG", 1200],
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayStr() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export async function handleMockApi<T = any>(
  urlPath: string,
  opts: { method?: string; body?: any } = {}
): Promise<T> {
  const method = (opts.method || (opts.body ? "POST" : "GET")).toUpperCase();
  const [cleanPath, queryStr] = urlPath.split("?");
  const params = new URLSearchParams(queryStr || "");
  const db = getDemoDB();
  const body = opts.body || {};

  // Auth: Login
  if (cleanPath === "/api/auth/login" && method === "POST") {
    const username = (body.username || "").trim();
    const user = (db.users || []).find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      throw new Error("Invalid username or password");
    }
    return {
      token: `demo-token-${user.id}-${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        staff_id: user.staff_id,
        patient_id: user.patient_id,
        active: user.active,
      },
    } as T;
  }

  // Auth: Me
  if (cleanPath === "/api/auth/me") {
    const raw = typeof window !== "undefined" ? localStorage.getItem("tecthha.session") : null;
    const session = raw ? JSON.parse(raw) : null;
    return (session?.user || db.users[0]) as T;
  }

  // RBAC matrix
  if (cleanPath === "/api/rbac") {
    const matrix = [
      { resource: "patients", read: ["admin", "doctor", "nurse", "receptionist"], write: ["admin", "doctor", "nurse", "receptionist"] },
      { resource: "appointments", read: ["admin", "doctor", "nurse", "receptionist"], write: ["admin", "doctor", "nurse", "receptionist"] },
      { resource: "vitals", read: ["admin", "doctor", "nurse"], write: ["admin", "doctor", "nurse"] },
      { resource: "allergies", read: ["admin", "doctor", "nurse", "pharmacist"], write: ["admin", "doctor", "nurse"] },
      { resource: "encounters", read: ["admin", "doctor", "nurse"], write: ["admin", "doctor"] },
      { resource: "prescriptions", read: ["admin", "doctor", "nurse", "pharmacist"], write: ["admin", "doctor"] },
      { resource: "lab-orders", read: ["admin", "doctor", "nurse", "lab", "receptionist"], write: ["admin", "doctor", "lab"] },
      { resource: "admissions", read: ["admin", "doctor", "nurse", "receptionist"], write: ["admin", "doctor", "nurse", "receptionist"] },
      { resource: "beds", read: ["admin", "doctor", "nurse", "receptionist"], write: ["admin", "nurse", "receptionist"] },
      { resource: "medicines", read: ["admin", "pharmacist", "doctor", "nurse"], write: ["admin", "pharmacist"] },
      { resource: "suppliers", read: ["admin", "pharmacist", "accountant"], write: ["admin", "pharmacist"] },
      { resource: "purchase-orders", read: ["admin", "pharmacist", "accountant"], write: ["admin", "pharmacist"] },
      { resource: "charges", read: ["admin", "accountant", "receptionist"], write: ["admin", "accountant"] },
      { resource: "invoices", read: ["admin", "accountant", "receptionist"], write: ["admin"] },
      { resource: "payments", read: ["admin", "accountant", "receptionist"], write: ["admin"] },
      { resource: "expenses", read: ["admin", "accountant"], write: ["admin", "accountant"] },
    ];
    return matrix as T;
  }

  // Doctors
  if (cleanPath === "/api/doctors") {
    const docs = (db.staff || []).filter((s) => s.role === "doctor");
    return enrichRows(db, docs) as T;
  }

  // Doctor slots
  const doctorSlotsMatch = cleanPath.match(/^\/api\/doctors\/(\d+)\/slots$/);
  if (doctorSlotsMatch) {
    const did = Number(doctorSlotsMatch[1]);
    const doc = (db.staff || []).find((s) => s.id === did);
    const dateParam = params.get("d") || todayStr();
    const dayName = DAYS[new Date(dateParam).getDay() === 0 ? 6 : new Date(dateParam).getDay() - 1];
    const appts = (db.appointments || []).filter(
      (a) => a.doctor_id === did && a.date === dateParam && a.status !== "cancelled"
    );
    const booked = new Set(appts.map((a) => a.time));

    const slots = [];
    let curH = 9, curM = 0;
    while (curH < 17) {
      const timeStr = `${String(curH).padStart(2, "0")}:${String(curM).padStart(2, "0")}`;
      slots.push({ time: timeStr, available: !booked.has(timeStr) });
      curM += 20;
      if (curM >= 60) {
        curH++;
        curM = 0;
      }
    }
    return {
      doctor: doc ? doc.name : "Doctor",
      day: dayName,
      available_days: doc ? doc.available_days : "Mon,Tue,Wed,Thu,Fri,Sat",
      slots,
      hours: "09:00–17:00",
    } as T;
  }

  // OPD Queue
  if (cleanPath === "/api/queue") {
    const targetDate = params.get("d") || todayStr();
    const docParam = params.get("doctor_id");
    let appts = (db.appointments || []).filter(
      (a) => a.date === targetDate && a.status !== "cancelled"
    );
    if (docParam) {
      appts = appts.filter((a) => a.doctor_id === Number(docParam));
    }
    const enriched = enrichRows(db, appts);
    const byDoc: Record<number, any[]> = {};
    for (const a of enriched) {
      if (!byDoc[a.doctor_id]) byDoc[a.doctor_id] = [];
      byDoc[a.doctor_id].push(a);
    }
    const docs = [];
    for (const [didStr, items] of Object.entries(byDoc)) {
      const did = Number(didStr);
      const doc = (db.staff || []).find((s) => s.id === did);
      const waiting = items.filter((i) => i.status === "checked-in");
      waiting.forEach((w, idx) => {
        w.position = idx + 1;
        w.est_wait_min = idx * 15;
      });
      const inConsult = items.find((i) => i.status === "in-consultation");
      docs.push({
        doctor_id: did,
        doctor_name: doc ? doc.name : "Doctor",
        department: items[0]?.department_name || "General Medicine",
        now_serving: inConsult ? inConsult.token : null,
        waiting: waiting.length,
        completed: items.filter((i) => i.status === "completed").length,
        items,
      });
    }
    return { date: targetDate, doctors: docs } as T;
  }

  // Test catalog
  if (cleanPath === "/api/catalog/tests") {
    return {
      lab: Object.entries(LAB_CATALOG).map(([name, price]) => ({ name, price })),
      radiology: Object.entries(RADIOLOGY_CATALOG).map(([name, [modality, price]]) => ({
        name,
        modality,
        price,
      })),
    } as T;
  }

  // Pharmacy catalog
  if (cleanPath === "/api/pharmacy/catalog") {
    const map = new Map<string, any>();
    for (const m of db.medicines || []) {
      if (m.expiry_date >= todayStr()) {
        const key = `${m.name}|${m.form}`;
        if (!map.has(key)) {
          map.set(key, {
            name: m.name,
            form: m.form,
            stock: 0,
            unit_price: m.unit_price,
            reorder_level: m.reorder_level,
          });
        }
        map.get(key)!.stock += m.stock;
      }
    }
    return Array.from(map.values()) as T;
  }

  // Pharmacy summary
  if (cleanPath === "/api/pharmacy/summary") {
    const t = todayStr();
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 90);
    const soon = soonDate.toISOString().slice(0, 10);
    const meds = db.medicines || [];
    const stockMap: Record<string, number> = {};
    const reorderMap: Record<string, number> = {};
    for (const m of meds) {
      if (m.expiry_date >= t) {
        stockMap[m.name] = (stockMap[m.name] || 0) + m.stock;
      }
      reorderMap[m.name] = m.reorder_level;
    }
    const low = Object.entries(reorderMap)
      .filter(([name, level]) => (stockMap[name] || 0) <= level)
      .map(([name, level]) => ({ name, stock: stockMap[name] || 0, reorder_level: level }));

    return {
      pending_rx: (db.prescriptions || []).filter((p) => p.status === "pending").length,
      dispensed_today: (db.prescriptions || []).filter((p) => p.status === "dispensed").length,
      low_stock: low,
      expired: enrichRows(db, meds.filter((m) => m.expiry_date < t && m.stock > 0)),
      expiring_soon: enrichRows(db, meds.filter((m) => m.expiry_date >= t && m.expiry_date <= soon && m.stock > 0)),
      stock_value: Math.round(meds.filter((m) => m.expiry_date >= t).reduce((sum, m) => sum + m.stock * m.unit_price, 0)),
    } as T;
  }

  // Dispense prescription
  const dispenseMatch = cleanPath.match(/^\/api\/prescriptions\/(\d+)\/dispense$/);
  if (dispenseMatch && method === "POST") {
    const rxId = Number(dispenseMatch[1]);
    const rx = (db.prescriptions || []).find((p) => p.id === rxId);
    if (!rx) throw new Error("Prescription not found");
    rx.status = "dispensed";
    rx.dispensed_at = new Date().toISOString();
    let rxItems = rx.items;
    if (typeof rxItems === "string") {
      try { rxItems = JSON.parse(rxItems); } catch { rxItems = []; }
    }
    rx.items = rxItems;
    const totalAmount = (rxItems || []).reduce((acc: number, it: any) => acc + (Number(it.qty) || 1) * 35, 0);
    db.charges.push({
      id: db.charges.length + 1,
      patient_id: rx.patient_id,
      source: "pharmacy",
      ref_id: rx.id,
      description: `Pharmacy – Prescription #${rx.id}`,
      amount: totalAmount || 150,
      invoice_id: null,
      created_at: new Date().toISOString(),
    });
    saveDemoDB(db);
    return enrichRows(db, [rx])[0] as T;
  }

  // Receive purchase order
  const poReceiveMatch = cleanPath.match(/^\/api\/purchase-orders\/(\d+)\/receive$/);
  if (poReceiveMatch && method === "POST") {
    const poId = Number(poReceiveMatch[1]);
    const po = (db.purchase_orders || []).find((p) => p.id === poId);
    if (!po) throw new Error("Purchase order not found");
    po.status = "received";
    po.received_date = todayStr();
    saveDemoDB(db);
    return enrichRows(db, [po])[0] as T;
  }

  // Discharge admission
  const dischargeMatch = cleanPath.match(/^\/api\/admissions\/(\d+)\/discharge$/);
  if (dischargeMatch && method === "POST") {
    const admId = Number(dischargeMatch[1]);
    const adm = (db.admissions || []).find((a) => a.id === admId);
    if (!adm) throw new Error("Admission not found");
    adm.status = "discharged";
    adm.discharge_date = todayStr();
    adm.summary = body.summary || adm.summary;
    const bed = (db.beds || []).find((b) => b.id === adm.bed_id);
    if (bed) bed.status = "cleaning";
    saveDemoDB(db);
    return enrichRows(db, [adm])[0] as T;
  }

  // Patient account summary
  const patientAccMatch = cleanPath.match(/^\/api\/patients\/(\d+)\/account$/);
  if (patientAccMatch) {
    const pid = Number(patientAccMatch[1]);
    const charges = (db.charges || []).filter((c) => c.patient_id === pid);
    const unbilled = charges.filter((c) => !c.invoice_id);
    const invoices = (db.invoices || []).filter((i) => i.patient_id === pid);
    const payments = (db.payments || []).filter((p) => p.patient_id === pid);
    const advPayments = payments.filter((p) => p.kind === "advance");
    const advUsed = payments.filter((p) => p.kind === "advance-adjustment");
    const advBalance = advPayments.reduce((s, p) => s + p.amount, 0) - advUsed.reduce((s, p) => s + p.amount, 0);

    return {
      patient_id: pid,
      advance_balance: Math.max(0, advBalance),
      unbilled_charges: unbilled,
      unbilled_total: unbilled.reduce((s, c) => s + c.amount, 0),
      invoices: enrichRows(db, invoices),
      payments: enrichRows(db, payments),
    } as T;
  }

  // Record advance payment
  if (cleanPath === "/api/payments/advance" && method === "POST") {
    const p = {
      id: (db.payments || []).length + 1,
      patient_id: Number(body.patient_id),
      invoice_id: null,
      amount: Number(body.amount),
      mode: body.mode || "cash",
      kind: "advance",
      reference: body.reference || `ADV-${Date.now().toString().slice(-6)}`,
      created_at: new Date().toISOString(),
    };
    db.payments.push(p);
    saveDemoDB(db);
    return p as T;
  }

  // Generate invoice
  if (cleanPath === "/api/invoices/generate" && method === "POST") {
    const pid = Number(body.patient_id);
    const unbilled = (db.charges || []).filter((c) => c.patient_id === pid && !c.invoice_id);
    const subtotal = unbilled.reduce((s, c) => s + c.amount, 0);
    const discount = Number(body.discount || 0);
    const tax = Math.round((subtotal - discount) * 0.05);
    const total = Math.max(0, subtotal - discount + tax);

    const inv = {
      id: (db.invoices || []).length + 1,
      invoice_no: `INV-${new Date().getFullYear()}-${String((db.invoices || []).length + 1).padStart(4, "0")}`,
      patient_id: pid,
      subtotal,
      discount,
      tax,
      total,
      paid: 0,
      balance: total,
      status: "unpaid",
      tpa_name: body.tpa_name || null,
      claim_status: body.tpa_name ? "submitted" : "none",
      created_at: new Date().toISOString(),
    };
    db.invoices.push(inv);
    unbilled.forEach((c) => (c.invoice_id = inv.id));
    saveDemoDB(db);
    return enrichRows(db, [inv])[0] as T;
  }

  // Invoice Detail
  const invDetailMatch = cleanPath.match(/^\/api\/invoices\/(\d+)\/detail$/);
  if (invDetailMatch) {
    const invId = Number(invDetailMatch[1]);
    const inv = (db.invoices || []).find((i) => i.id === invId);
    if (!inv) throw new Error("Invoice not found");
    const charges = (db.charges || []).filter((c) => c.invoice_id === invId);
    const payments = (db.payments || []).filter((p) => p.invoice_id === invId);
    const patient = (db.patients || []).find((p) => p.id === inv.patient_id) || {};
    const enriched = enrichRows(db, [inv])[0];
    return {
      ...enriched,
      patient,
      items: charges,
      payments,
    } as T;
  }

  // Pay invoice
  const invPayMatch = cleanPath.match(/^\/api\/invoices\/(\d+)\/pay$/);
  if (invPayMatch && method === "POST") {
    const invId = Number(invPayMatch[1]);
    const inv = (db.invoices || []).find((i) => i.id === invId);
    if (!inv) throw new Error("Invoice not found");
    const amt = Number(body.amount);
    inv.paid = (inv.paid || 0) + amt;
    inv.balance = Math.max(0, inv.total - inv.paid);
    inv.status = inv.balance <= 0 ? "paid" : "partial";

    db.payments.push({
      id: (db.payments || []).length + 1,
      patient_id: inv.patient_id,
      invoice_id: inv.id,
      amount: amt,
      mode: body.mode || "cash",
      kind: "payment",
      reference: body.reference || `PAY-${Date.now().toString().slice(-6)}`,
      created_at: new Date().toISOString(),
    });
    saveDemoDB(db);
    const patient = (db.patients || []).find((p) => p.id === inv.patient_id) || {};
    const charges = (db.charges || []).filter((c) => c.invoice_id === invId);
    const payments = (db.payments || []).filter((p) => p.invoice_id === invId);
    return { ...enrichRows(db, [inv])[0], patient, items: charges, payments } as T;
  }

  // Claim invoice
  const invClaimMatch = cleanPath.match(/^\/api\/invoices\/(\d+)\/claim$/);
  if (invClaimMatch && method === "POST") {
    const invId = Number(invClaimMatch[1]);
    const inv = (db.invoices || []).find((i) => i.id === invId);
    if (!inv) throw new Error("Invoice not found");
    inv.claim_status = body.status || "approved";
    saveDemoDB(db);
    const patient = (db.patients || []).find((p) => p.id === inv.patient_id) || {};
    const charges = (db.charges || []).filter((c) => c.invoice_id === invId);
    const payments = (db.payments || []).filter((p) => p.invoice_id === invId);
    return { ...enrichRows(db, [inv])[0], patient, items: charges, payments } as T;
  }

  // Finance summary (matching Reports component in finance/page.tsx)
  if (cleanPath === "/api/finance/summary") {
    const invs = db.invoices || [];
    const pays = db.payments || [];
    const exps = db.expenses || [];
    const collected =
      pays.filter((p) => ["payment", "advance", "insurance"].includes(p.kind)).reduce((s, p) => s + p.amount, 0) -
      pays.filter((p) => p.kind === "refund").reduce((s, p) => s + p.amount, 0);
    const totalExp = exps.reduce((s, e) => s + e.amount, 0);
    const outstanding = invs.reduce((s, i) => s + Math.max(i.balance || 0, 0), 0);
    const billed = invs.reduce((s, i) => s + (i.total || 0), 0);

    const days = Array.from({ length: 14 }, (_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (13 - i));
      return dt.toISOString().slice(5, 10);
    });

    return {
      billed: Math.round(billed),
      collected: Math.round(collected),
      outstanding: Math.round(outstanding),
      refunds: 1500,
      expenses: Math.round(totalExp),
      net: Math.round(collected - totalExp),
      daily: days.map((date, idx) => ({
        date,
        collections: 12000 + (idx % 4) * 3500,
        expenses: 6000 + (idx % 3) * 2000,
      })),
      by_source: [
        { name: "Consultations", value: 38000 },
        { name: "Pharmacy", value: 52000 },
        { name: "Lab & Radiology", value: 41000 },
        { name: "Bed charges", value: 47000 },
      ],
      by_mode: [
        { name: "UPI", value: 74000 },
        { name: "Card", value: 58000 },
        { name: "Cash", value: 46000 },
      ],
      expense_by_category: [
        { name: "Salaries", value: 85000 },
        { name: "Consumables", value: 32000 },
        { name: "Utilities", value: 18000 },
        { name: "Maintenance", value: 14000 },
      ],
    } as T;
  }

  // Dashboard Stats (exact fields expected by dashboard/page.tsx)
  if (cleanPath === "/api/dashboard") {
    const today = todayStr();
    const appts = db.appointments || [];
    const apptsToday = appts.filter((a) => a.date === today && a.status !== "cancelled");
    const beds = db.beds || [];
    const occ = beds.filter((b) => b.status === "occupied").length;
    const feedback = db.feedback || [];
    const avgRating = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : 4.8;
    const complaints = db.complaints || [];

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (6 - i));
      return dt.toISOString().slice(5, 10);
    });

    const statusCounts: Record<string, number> = {};
    for (const a of appts.filter((a) => a.date === today)) {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    }

    const bedCounts: Record<string, number> = {};
    for (const b of beds) {
      bedCounts[b.status] = (bedCounts[b.status] || 0) + 1;
    }

    return {
      patients: (db.patients || []).length || 17,
      new_patients_month: 8,
      appointments_today: apptsToday.length || 8,
      appt_status_today: statusCounts,
      waiting: appts.filter((a) => a.date === today && a.status === "checked-in").length || 2,
      admitted: (db.admissions || []).filter((a) => a.status === "admitted").length || 4,
      beds_total: beds.length || 20,
      beds_occupied: occ || 7,
      occupancy_pct: Math.round(((occ || 7) / (beds.length || 20)) * 100),
      pending_labs: (db.lab_orders || []).filter((l) => !["completed", "reported", "cancelled"].includes(l.status)).length || 4,
      pending_rx: (db.prescriptions || []).filter((p) => p.status === "pending").length || 3,
      collections_today: 18450,
      outstanding: (db.invoices || []).reduce((s, i) => s + Math.max(i.balance || 0, 0), 0) || 12800,
      avg_rating: Math.round(avgRating * 10) / 10,
      open_complaints: complaints.filter((c) => c.status !== "resolved").length || 1,
      appointments_week: weekDays.map((d, i) => ({ date: d, count: 6 + (i % 3) * 4 })),
      revenue_week: weekDays.map((d, i) => ({ date: d, amount: 14000 + (i % 4) * 4500 })),
      department_load: [
        { name: "General Medicine", value: 18 },
        { name: "Cardiology", value: 12 },
        { name: "Pediatrics", value: 9 },
        { name: "Orthopedics", value: 7 },
      ],
      bed_status: Object.entries(bedCounts).map(([name, value]) => ({ name, value })),
      recent_activity: (db.audit_logs || []).slice(0, 8),
    } as T;
  }

  // Engagement Summary (exact fields expected by engagement/page.tsx)
  if (cleanPath === "/api/engagement/summary") {
    const feedback = db.feedback || [];
    const ratings = feedback.map((f) => f.rating);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 4.8;
    const complaints = db.complaints || [];

    return {
      avg_rating: Math.round(avgRating * 10) / 10,
      responses: ratings.length || 18,
      promoters_pct: Math.round((ratings.filter((r) => r >= 4).length / (ratings.length || 1)) * 100) || 89,
      distribution: [1, 2, 3, 4, 5].map((i) => ({ name: `${i}★`, value: ratings.filter((r) => r === i).length })),
      by_category: [
        { name: "Doctor", value: 4.9 },
        { name: "Nursing", value: 4.7 },
        { name: "Facilities", value: 4.6 },
        { name: "Billing", value: 4.5 },
      ],
      complaints: {
        open: complaints.filter((c) => c.status === "open").length,
        "in-progress": complaints.filter((c) => c.status === "in-progress").length,
        resolved: complaints.filter((c) => c.status === "resolved").length,
      },
      notifications_by_channel: [
        { name: "WhatsApp", value: 68 },
        { name: "SMS", value: 24 },
        { name: "Email", value: 12 },
      ],
      notifications_by_category: [
        { name: "appointment", value: 38 },
        { name: "reminder", value: 22 },
        { name: "billing", value: 16 },
        { name: "lab", value: 14 },
      ],
      patients_total: (db.patients || []).length || 17,
      patients_visited: 14,
      returning: 8,
      retention_pct: 57.1,
    } as T;
  }

  // Send notification
  if (cleanPath === "/api/notifications/send" && method === "POST") {
    const n = {
      id: (db.notifications || []).length + 1,
      patient_id: body.patient_id || null,
      channel: body.channel || "WhatsApp",
      category: body.category || "manual",
      message: body.message,
      phone: body.phone || "+91 90000 00000",
      status: "simulated-sent",
      created_at: new Date().toISOString(),
    };
    db.notifications.push(n);
    saveDemoDB(db);
    return n as T;
  }

  // Reminders run
  if (cleanPath === "/api/reminders/run" && method === "POST") {
    return { kind: body.kind || "appointment", sent: 4 } as T;
  }

  // Campaign send
  const campSendMatch = cleanPath.match(/^\/api\/campaigns\/(\d+)\/send$/);
  if (campSendMatch && method === "POST") {
    const cid = Number(campSendMatch[1]);
    const c = (db.campaigns || []).find((x) => x.id === cid);
    if (c) {
      c.status = "sent";
      c.sent_count = (db.patients || []).length || 17;
      saveDemoDB(db);
      return c as T;
    }
  }

  // Portal: Me (exact fields expected by portal/page.tsx)
  if (cleanPath === "/api/portal/me") {
    const raw = typeof window !== "undefined" ? localStorage.getItem("tecthha.session") : null;
    const session = raw ? JSON.parse(raw) : null;
    const pid = session?.user?.patient_id || 1;
    const p = (db.patients || []).find((x) => x.id === pid) || db.patients[0];

    return {
      patient: p,
      appointments: enrichRows(db, (db.appointments || []).filter((a) => a.patient_id === p.id)),
      encounters: enrichRows(db, (db.encounters || []).filter((e) => e.patient_id === p.id)),
      prescriptions: enrichRows(db, (db.prescriptions || []).filter((r) => r.patient_id === p.id)),
      labs: enrichRows(db, (db.lab_orders || []).filter((l) => l.patient_id === p.id)),
      invoices: enrichRows(db, (db.invoices || []).filter((i) => i.patient_id === p.id)),
      notifications: (db.notifications || []).filter((n) => n.patient_id === p.id),
      vitals: enrichRows(db, (db.vitals || []).filter((v) => v.patient_id === p.id)),
      allergies: (db.allergies || []).filter((a) => a.patient_id === p.id),
      admissions: enrichRows(db, (db.admissions || []).filter((a) => a.patient_id === p.id)),
      feedback: (db.feedback || []).filter((f) => f.patient_id === p.id),
    } as T;
  }

  // Portal appointments
  if (cleanPath === "/api/portal/appointments") {
    if (method === "POST") {
      const raw = typeof window !== "undefined" ? localStorage.getItem("tecthha.session") : null;
      const session = raw ? JSON.parse(raw) : null;
      const pid = session?.user?.patient_id || 1;
      const newId = (db.appointments || []).length + 1;
      const appt = {
        id: newId,
        patient_id: pid,
        doctor_id: Number(body.doctor_id),
        date: body.date,
        time: body.time,
        token: (db.appointments || []).filter((a) => a.doctor_id === Number(body.doctor_id) && a.date === body.date).length + 1,
        status: "booked",
        type: body.type || "in-person",
        reason: body.reason || "Consultation",
        created_at: new Date().toISOString(),
      };
      db.appointments.push(appt);
      saveDemoDB(db);
      return enrichRows(db, [appt])[0] as T;
    }
  }

  const portalApptMatch = cleanPath.match(/^\/api\/portal\/appointments\/(\d+)$/);
  if (portalApptMatch && method === "PATCH") {
    const aid = Number(portalApptMatch[1]);
    const a = (db.appointments || []).find((x) => x.id === aid);
    if (!a) throw new Error("Appointment not found");
    Object.assign(a, body);
    saveDemoDB(db);
    return enrichRows(db, [a])[0] as T;
  }

  // Portal feedback & complaints
  if (cleanPath === "/api/portal/feedback" && method === "POST") {
    const fb = {
      id: (db.feedback || []).length + 1,
      patient_id: body.patient_id || 1,
      rating: body.rating || 5,
      category: body.category || "Overall",
      comment: body.comment || "",
      created_at: new Date().toISOString(),
    };
    db.feedback.push(fb);
    saveDemoDB(db);
    return fb as T;
  }

  if (cleanPath === "/api/portal/complaints" && method === "POST") {
    const cmp = {
      id: (db.complaints || []).length + 1,
      ticket_no: `TCK-${Date.now().toString().slice(-6)}`,
      patient_id: body.patient_id || 1,
      subject: body.subject,
      description: body.description || "",
      category: body.category || "Service",
      status: "open",
      created_at: new Date().toISOString(),
    };
    db.complaints.push(cmp);
    saveDemoDB(db);
    return cmp as T;
  }

  // Generic REST: /api/r/:res
  const rListMatch = cleanPath.match(/^\/api\/r\/([a-zA-Z0-9_\-]+)$/);
  if (rListMatch) {
    const resName = rListMatch[1];
    const table = getTable(resName);
    const list = db[table] || [];

    if (method === "GET") {
      let filtered = [...list];
      const q = params.get("q")?.toLowerCase();
      if (q) {
        filtered = filtered.filter((r) =>
          Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(q))
        );
      }
      for (const [key, val] of params.entries()) {
        if (key.startsWith("_") || ["q", "sort", "order", "limit", "offset"].includes(key) || val === "") {
          continue;
        }
        if (list.length > 0 && !(key in list[0])) {
          continue;
        }
        if (val.includes(",")) {
          const arr = val.split(",");
          filtered = filtered.filter((r) => arr.includes(String(r[key])));
        } else {
          filtered = filtered.filter((r) => String(r[key]) === String(val));
        }
      }
      const sort = params.get("sort") || "id";
      const order = params.get("order") || "desc";
      filtered.sort((a, b) => {
        const valA = a[sort] ?? "";
        const valB = b[sort] ?? "";
        return order === "desc" ? (valB > valA ? 1 : -1) : valA > valB ? 1 : -1;
      });

      const total = filtered.length;
      const offset = Number(params.get("offset") || 0);
      const limit = Number(params.get("limit") || 50);
      const paged = filtered.slice(offset, offset + limit);

      return { items: enrichRows(db, paged), total } as T;
    }

    if (method === "POST") {
      const newId = list.length ? Math.max(...list.map((r) => r.id || 0)) + 1 : 1;
      const item = { ...body, id: newId, created_at: new Date().toISOString() };

      if (resName === "patients") {
        item.uhid = `TTH-${new Date().getFullYear()}-${String(newId).padStart(5, "0")}`;
        db.users.push({
          id: db.users.length + 1,
          username: item.uhid,
          name: item.name,
          role: "patient",
          patient_id: newId,
          active: true,
        });
      }

      if (resName === "admissions") {
        const bed = (db.beds || []).find((b) => b.id === Number(item.bed_id));
        if (bed) bed.status = "occupied";
      }

      list.push(item);
      saveDemoDB(db);
      return enrichRows(db, [item])[0] as T;
    }
  }

  // Generic REST Item: /api/r/:res/:id
  const rItemMatch = cleanPath.match(/^\/api\/r\/([a-zA-Z0-9_\-]+)\/(\d+)$/);
  if (rItemMatch) {
    const resName = rItemMatch[1];
    const itemId = Number(rItemMatch[2]);
    const table = getTable(resName);
    const list = db[table] || [];
    const idx = list.findIndex((r) => r.id === itemId);

    if (method === "GET") {
      if (idx === -1) throw new Error("Record not found");
      return enrichRows(db, [list[idx]])[0] as T;
    }

    if (method === "PATCH") {
      if (idx === -1) throw new Error("Record not found");
      list[idx] = { ...list[idx], ...body };
      saveDemoDB(db);
      return enrichRows(db, [list[idx]])[0] as T;
    }

    if (method === "DELETE") {
      if (idx !== -1) {
        list.splice(idx, 1);
        saveDemoDB(db);
      }
      return { ok: true } as T;
    }
  }

  console.warn("Unhandled Mock API route:", method, cleanPath);
  return { ok: true } as T;
}
