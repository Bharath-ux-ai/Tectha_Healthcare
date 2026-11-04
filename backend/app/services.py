"""Cross-module workflow rules: UHID, tokens, slot checks, charges, dispensing,
billing, insurance, discharge, reminders and the patient portal."""
import uuid
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models as m
from .auth import current_user, require
from .crud import (AFTER_CREATE, AFTER_UPDATE, BEFORE_CREATE, BEFORE_DELETE, BEFORE_UPDATE, RESOURCES,
                   audit, create_record, enrich, update_record)
from .auth import hash_password
from .db import get_db

router = APIRouter(prefix="/api", tags=["workflows"])

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
DEFAULT_PORTAL_PASSWORD = "Welcome@123"
LAB_CATALOG = {
    "Complete Blood Count": 350, "Fasting Blood Sugar": 150, "HbA1c": 550, "Lipid Profile": 700,
    "Liver Function Test": 800, "Kidney Function Test": 750, "Thyroid Profile": 650, "Urine Routine": 200,
    "Dengue NS1": 900, "CRP": 450,
}
RADIOLOGY_CATALOG = {
    "X-ray Chest PA": ("X-ray", 600), "X-ray Knee AP/Lat": ("X-ray", 700), "CT Brain Plain": ("CT", 3500),
    "CT Abdomen Contrast": ("CT", 6500), "MRI Lumbar Spine": ("MRI", 7500), "MRI Knee": ("MRI", 6800),
    "USG Abdomen": ("USG", 1200),
}


def today():
    return date.today().isoformat()


def notify(db, patient_id, message, category="manual", channel="WhatsApp"):
    p = db.get(m.Patient, patient_id) if patient_id else None
    n = m.Notification(patient_id=patient_id, channel=channel, category=category, message=message,
                       phone=p.phone if p else None, status="simulated-sent")
    db.add(n)
    return n


def add_charge(db, patient_id, source, ref_id, description, amount):
    exists = db.query(m.Charge).filter_by(source=source, ref_id=ref_id, patient_id=patient_id).first()
    if exists or not amount:
        return exists
    c = m.Charge(patient_id=patient_id, source=source, ref_id=ref_id, description=description, amount=round(amount, 2))
    db.add(c)
    return c


# ================= Patients =================
def patient_after_create(db, p, user):
    p.uhid = f"TTH-{date.today().year}-{p.id:05d}"
    if not db.query(m.User).filter_by(username=p.uhid).first():
        db.add(m.User(username=p.uhid, name=p.name, role="patient", patient_id=p.id,
                      password_hash=hash_password(DEFAULT_PORTAL_PASSWORD)))
    notify(db, p.id, f"Welcome to TEC THA HEALTHCARE, {p.name}. Your UHID is {p.uhid}. "
                     f"Portal login: {p.uhid}.", "registration")


def patient_before_create(db, data, user):
    phone = str(data.get("phone") or "")
    if phone and not (phone.replace("+", "").replace(" ", "").isdigit() and len(phone) >= 10):
        raise HTTPException(422, "Phone number must have at least 10 digits")
    if data.get("dob") and data["dob"] > today():
        raise HTTPException(422, "Date of birth cannot be in the future")


def patient_before_delete(db, p, user):
    if db.query(m.Appointment).filter_by(patient_id=p.id).count() or db.query(m.Invoice).filter_by(patient_id=p.id).count():
        raise HTTPException(409, "Patient has clinical or billing history; mark as inactive instead of deleting")


BEFORE_CREATE["patients"] = patient_before_create
AFTER_CREATE["patients"] = patient_after_create
BEFORE_DELETE["patients"] = patient_before_delete


# ================= Appointments / availability / queue =================
def doctor_slots(db, doctor: m.Staff, d: str, exclude_id=None):
    try:
        day = DAYS[date.fromisoformat(d).weekday()]
    except ValueError:
        raise HTTPException(422, "Invalid date")
    if day not in (doctor.available_days or "") or doctor.status != "active":
        return day, []
    booked = {a.time for a in db.query(m.Appointment).filter(
        m.Appointment.doctor_id == doctor.id, m.Appointment.date == d,
        m.Appointment.status.notin_(["cancelled", "no-show"]), m.Appointment.id != (exclude_id or 0))}
    slots = []
    t = datetime.strptime(doctor.slot_start or "09:00", "%H:%M")
    end = datetime.strptime(doctor.slot_end or "13:00", "%H:%M")
    while t < end:
        s = t.strftime("%H:%M")
        slots.append({"time": s, "available": s not in booked})
        t += timedelta(minutes=doctor.slot_minutes or 15)
    return day, slots


def validate_slot(db, doctor_id, d, t, exclude_id=None):
    doc = db.get(m.Staff, int(doctor_id)) if doctor_id else None
    if not doc or doc.role != "doctor":
        raise HTTPException(422, "Select a valid doctor")
    if d < today():
        raise HTTPException(422, "Appointment date cannot be in the past")
    day, slots = doctor_slots(db, doc, d, exclude_id)
    if not slots:
        raise HTTPException(409, f"{doc.name} is not available on {day}")
    match = next((s for s in slots if s["time"] == t), None)
    if not match:
        raise HTTPException(409, f"{t} is outside {doc.name}'s consulting hours ({doc.slot_start}–{doc.slot_end})")
    if not match["available"]:
        raise HTTPException(409, f"The {t} slot with {doc.name} is already booked")
    return doc


def next_token(db, doctor_id, d):
    mx = db.query(func.max(m.Appointment.token)).filter_by(doctor_id=doctor_id, date=d).scalar()
    return (mx or 0) + 1


def appt_before_create(db, data, user):
    if not db.get(m.Patient, int(data.get("patient_id") or 0)):
        raise HTTPException(422, "Select a valid patient")
    doc = validate_slot(db, data.get("doctor_id"), data.get("date", ""), data.get("time", ""))
    data["department_id"] = doc.department_id
    data["token"] = next_token(db, doc.id, data["date"])
    data["status"] = "booked"
    if data.get("type") == "tele":
        data["meeting_link"] = f"https://tele.tecthha.demo/room/{uuid.uuid4().hex[:10]}"


def appt_after_create(db, a, user):
    doc = db.get(m.Staff, a.doctor_id)
    extra = f" Teleconsult link: {a.meeting_link}" if a.meeting_link else f" Token #{a.token}."
    notify(db, a.patient_id, f"Appointment confirmed with {doc.name} on {a.date} at {a.time}.{extra}", "appointment")


def appt_before_update(db, a, data, user):
    if a.status in ("completed", "cancelled") and any(k in data for k in ("date", "time", "doctor_id")):
        raise HTTPException(409, f"A {a.status} appointment cannot be rescheduled")
    nd, nt, ndoc = data.get("date", a.date), data.get("time", a.time), data.get("doctor_id", a.doctor_id)
    if (nd, nt, int(ndoc)) != (a.date, a.time, a.doctor_id):
        doc = validate_slot(db, ndoc, nd, nt, exclude_id=a.id)
        data["department_id"] = doc.department_id
        if (nd, int(ndoc)) != (a.date, a.doctor_id):
            data["token"] = next_token(db, doc.id, nd)
        data["_rescheduled"] = True
    if data.get("status") == "completed" and a.status == "cancelled":
        raise HTTPException(409, "Cancelled appointment cannot be completed")


def appt_after_update(db, a, old, user):
    doc = db.get(m.Staff, a.doctor_id)
    if (a.date, a.time) != (old["date"], old["time"]) or a.doctor_id != old["doctor_id"]:
        notify(db, a.patient_id, f"Your appointment has been rescheduled to {a.date} at {a.time} with {doc.name}. Token #{a.token}.", "appointment")
    if a.status != old["status"]:
        if a.status == "cancelled":
            notify(db, a.patient_id, f"Your appointment with {doc.name} on {a.date} at {a.time} has been cancelled.", "appointment", "SMS")
        if a.status == "completed":
            add_charge(db, a.patient_id, "consultation", a.id, f"Consultation – {doc.name} ({a.date})", doc.consult_fee or 0)
            enc = db.query(m.Encounter).filter_by(appointment_id=a.id).first()
            fu = f" Your follow-up is due on {enc.follow_up_date}." if enc and enc.follow_up_date else ""
            notify(db, a.patient_id, f"Thank you for visiting {doc.name}. Please share your feedback.{fu}", "follow-up")


BEFORE_CREATE["appointments"] = appt_before_create
AFTER_CREATE["appointments"] = appt_after_create
BEFORE_UPDATE["appointments"] = appt_before_update
AFTER_UPDATE["appointments"] = appt_after_update


@router.get("/doctors")
def doctors(db: Session = Depends(get_db), user=Depends(current_user)):
    docs = db.query(m.Staff).filter_by(role="doctor").order_by(m.Staff.name).all()
    return enrich(db, docs)


@router.get("/doctors/{doctor_id}/slots")
def slots(doctor_id: int, d: str, db: Session = Depends(get_db), user=Depends(current_user)):
    doc = db.get(m.Staff, doctor_id)
    if not doc or doc.role != "doctor":
        raise HTTPException(404, "Doctor not found")
    day, s = doctor_slots(db, doc, d)
    return {"doctor": doc.name, "day": day, "available_days": doc.available_days, "slots": s,
            "hours": f"{doc.slot_start}–{doc.slot_end}"}


@router.get("/queue")
def queue(d: str | None = None, doctor_id: int | None = None, db: Session = Depends(get_db), user=Depends(require(*RESOURCES["appointments"]["read"]))):
    d = d or today()
    q = db.query(m.Appointment).filter(m.Appointment.date == d, m.Appointment.status != "cancelled")
    if doctor_id:
        q = q.filter_by(doctor_id=doctor_id)
    rows = enrich(db, q.order_by(m.Appointment.doctor_id, m.Appointment.token).all())
    by_doc = defaultdict(list)
    for r in rows:
        by_doc[r["doctor_id"]].append(r)
    out = []
    for did, items in by_doc.items():
        doc = db.get(m.Staff, did)
        waiting = [i for i in items if i["status"] == "checked-in"]
        for pos, w in enumerate(waiting):
            w["position"] = pos + 1
            w["est_wait_min"] = pos * (doc.slot_minutes or 15)
        current = next((i for i in items if i["status"] == "in-consultation"), None)
        out.append({"doctor_id": did, "doctor_name": doc.name, "department": items[0].get("department_name"),
                    "now_serving": current["token"] if current else None, "waiting": len(waiting),
                    "completed": sum(i["status"] == "completed" for i in items), "items": items})
    return {"date": d, "doctors": out}


# ================= Clinical =================
def rx_before_create(db, data, user):
    items = data.get("items") or []
    if not items or not all(i.get("medicine") and int(i.get("qty") or 0) > 0 for i in items):
        raise HTTPException(422, "Add at least one medicine with a quantity")
    data["doctor_id"] = data.get("doctor_id") or user.get("staff_id")
    data["status"] = "pending"


def rx_after_create(db, rx, user):
    notify(db, rx.patient_id, f"Your e-prescription #{rx.id} is ready at the TEC THA pharmacy.", "prescription", "SMS")


def encounter_before_create(db, data, user):
    data["doctor_id"] = data.get("doctor_id") or user.get("staff_id")


BEFORE_CREATE["prescriptions"] = rx_before_create
AFTER_CREATE["prescriptions"] = rx_after_create
BEFORE_CREATE["encounters"] = encounter_before_create


# ================= Diagnostics =================
@router.get("/catalog/tests")
def test_catalog(user=Depends(current_user)):
    return {"lab": [{"name": k, "price": v} for k, v in LAB_CATALOG.items()],
            "radiology": [{"name": k, "modality": v[0], "price": v[1]} for k, v in RADIOLOGY_CATALOG.items()]}


def lab_before_create(db, data, user):
    name = data.get("test_name")
    if data.get("category") == "radiology":
        mod, price = RADIOLOGY_CATALOG.get(name, (data.get("modality") or "X-ray", 1000))
        data.update(modality=data.get("modality") or mod, status="requested")
    else:
        price = LAB_CATALOG.get(name, 500)
        data.update(category="lab", status="ordered")
    data["price"] = data.get("price") or price
    data["doctor_id"] = data.get("doctor_id") or user.get("staff_id")


def lab_after_create(db, o, user):
    add_charge(db, o.patient_id, o.category, o.id, f"{'Radiology' if o.category == 'radiology' else 'Lab'} – {o.test_name}", o.price)


LAB_FLOW = ["ordered", "sample-collected", "processing", "completed"]
RAD_FLOW = ["requested", "scheduled", "scanned", "reported"]


def lab_before_update(db, o, data, user):
    st = data.get("status")
    if st and st != o.status and st != "cancelled":
        flow = RAD_FLOW if o.category == "radiology" else LAB_FLOW
        if st not in flow:
            raise HTTPException(422, f"Invalid status '{st}'")
        if o.status in ("completed", "reported", "cancelled"):
            raise HTTPException(409, f"Order already {o.status}")
        if st in ("completed", "reported") and not (data.get("result") or o.result or data.get("findings") or o.findings):
            raise HTTPException(422, "Enter the result / findings before finalising the report")
    if st == "sample-collected" and not o.sample_id:
        data["sample_id"] = f"SMP-{date.today():%y%m%d}-{o.id:04d}"
    if st in ("completed", "reported"):
        data["reported_by"] = user.get("name")


def lab_after_update(db, o, old, user):
    if o.status != old["status"] and o.status in ("completed", "reported"):
        o.reported_at = datetime.utcnow()
        notify(db, o.patient_id, f"Your {o.test_name} report is ready. View it in the TEC THA patient portal.", "lab", "SMS")
    if o.status == "cancelled" and old["status"] != "cancelled":
        ch = db.query(m.Charge).filter_by(source=o.category, ref_id=o.id, invoice_id=None).first()
        if ch:
            db.delete(ch)


BEFORE_CREATE["lab-orders"] = lab_before_create
AFTER_CREATE["lab-orders"] = lab_after_create
BEFORE_UPDATE["lab-orders"] = lab_before_update
AFTER_UPDATE["lab-orders"] = lab_after_update


# ================= Pharmacy =================
@router.get("/pharmacy/catalog")
def pharmacy_catalog(db: Session = Depends(get_db), user=Depends(current_user)):
    rows = db.query(m.Medicine.name, m.Medicine.form, func.sum(m.Medicine.stock), func.max(m.Medicine.unit_price),
                    func.max(m.Medicine.reorder_level)).filter(m.Medicine.expiry_date >= today()).group_by(m.Medicine.name, m.Medicine.form).all()
    return [{"name": r[0], "form": r[1], "stock": int(r[2] or 0), "unit_price": r[3], "reorder_level": r[4]} for r in sorted(rows)]


@router.get("/pharmacy/summary")
def pharmacy_summary(db: Session = Depends(get_db), user=Depends(require("pharmacist", "doctor"))):
    t, soon = today(), (date.today() + timedelta(days=90)).isoformat()
    meds = db.query(m.Medicine).all()
    by_name = defaultdict(int)
    reorder = {}
    for x in meds:
        if x.expiry_date >= t:
            by_name[x.name] += x.stock
        reorder[x.name] = x.reorder_level
    low = [{"name": n, "stock": by_name.get(n, 0), "reorder_level": r} for n, r in reorder.items() if by_name.get(n, 0) <= r]
    return {
        "pending_rx": db.query(m.Prescription).filter_by(status="pending").count(),
        "dispensed_today": db.query(m.Prescription).filter(m.Prescription.status == "dispensed", m.Prescription.dispensed_at >= datetime.combine(date.today(), datetime.min.time())).count(),
        "low_stock": low,
        "expired": [enrich(db, [x])[0] for x in meds if x.expiry_date < t and x.stock > 0],
        "expiring_soon": [enrich(db, [x])[0] for x in meds if t <= x.expiry_date <= soon and x.stock > 0],
        "stock_value": round(sum(x.stock * x.unit_price for x in meds if x.expiry_date >= t), 2),
    }


@router.post("/prescriptions/{rx_id}/dispense")
def dispense(rx_id: int, db: Session = Depends(get_db), user=Depends(require("pharmacist"))):
    rx = db.get(m.Prescription, rx_id)
    if not rx:
        raise HTTPException(404, "Prescription not found")
    if rx.status != "pending":
        raise HTTPException(409, f"Prescription already {rx.status}")
    plan, shortages, total = [], [], 0.0
    for item in rx.items:
        need = int(item.get("qty") or 0)
        batches = db.query(m.Medicine).filter(m.Medicine.name == item["medicine"], m.Medicine.expiry_date >= today(),
                                              m.Medicine.stock > 0).order_by(m.Medicine.expiry_date).all()  # FEFO
        alloc = []
        for b in batches:
            take = min(need, b.stock)
            if take:
                alloc.append((b, take))
                need -= take
            if not need:
                break
        if need:
            shortages.append(f"{item['medicine']} (short by {need})")
        plan.append((item, alloc))
    if shortages:
        raise HTTPException(409, "Insufficient non-expired stock: " + ", ".join(shortages))
    items = []
    for item, alloc in plan:
        item = dict(item)
        item["dispensed"] = []
        for b, take in alloc:
            b.stock -= take
            total += take * b.unit_price
            item["dispensed"].append({"batch_no": b.batch_no, "expiry_date": b.expiry_date, "qty": take, "unit_price": b.unit_price})
        items.append(item)
    rx.items, rx.status, rx.dispensed_at = items, "dispensed", datetime.utcnow()
    add_charge(db, rx.patient_id, "pharmacy", rx.id, f"Pharmacy – Prescription #{rx.id} ({len(items)} item{'s' if len(items) != 1 else ''})", total)
    audit(db, user, "dispense", "prescriptions", rx.id, f"amount={total:.2f}")
    db.commit()
    return enrich(db, [rx])[0]


def po_before_create(db, data, user):
    items = data.get("items") or []
    if not items:
        raise HTTPException(422, "Add at least one item to the purchase order")
    for i in items:
        if not i.get("name") or int(i.get("qty") or 0) <= 0:
            raise HTTPException(422, "Each item needs a medicine name and quantity")
    data["total"] = round(sum(int(i["qty"]) * float(i.get("unit_price") or 0) for i in items), 2)
    data["status"] = "ordered"


def po_after_create(db, po, user):
    po.po_number = f"PO-{date.today().year}-{po.id:04d}"


BEFORE_CREATE["purchase-orders"] = po_before_create
AFTER_CREATE["purchase-orders"] = po_after_create


@router.post("/purchase-orders/{po_id}/receive")
def receive_po(po_id: int, db: Session = Depends(get_db), user=Depends(require("pharmacist"))):
    po = db.get(m.PurchaseOrder, po_id)
    if not po or po.status != "ordered":
        raise HTTPException(409, "Only open purchase orders can be received")
    for i in po.items:
        batch = i.get("batch_no") or f"B{po.id:03d}{uuid.uuid4().hex[:4].upper()}"
        expiry = i.get("expiry_date") or (date.today() + timedelta(days=540)).isoformat()
        med = db.query(m.Medicine).filter_by(name=i["name"], batch_no=batch).first()
        if med:
            med.stock += int(i["qty"])
        else:
            ref = db.query(m.Medicine).filter_by(name=i["name"]).first()
            db.add(m.Medicine(name=i["name"], generic_name=ref.generic_name if ref else None, form=ref.form if ref else "Tablet",
                              batch_no=batch, expiry_date=expiry, stock=int(i["qty"]), reorder_level=ref.reorder_level if ref else 50,
                              unit_price=round(float(i.get("unit_price") or 0) * 1.25, 2), supplier_id=po.supplier_id))
    po.status, po.received_at = "received", datetime.utcnow()
    db.add(m.Expense(category="Pharmacy purchase", description=f"{po.po_number} received", amount=po.total, date=today(),
                     vendor=(db.get(m.Supplier, po.supplier_id) or m.Supplier(name="")).name))
    audit(db, user, "receive", "purchase-orders", po.id)
    db.commit()
    return enrich(db, [po])[0]


# ================= Operations (IPD) =================
def admission_before_create(db, data, user):
    bed = db.get(m.Bed, int(data.get("bed_id") or 0))
    if not bed or bed.status != "available":
        raise HTTPException(409, "Selected bed is not available")
    pid = int(data.get("patient_id") or 0)
    if db.query(m.Admission).filter_by(patient_id=pid, status="admitted").first():
        raise HTTPException(409, "Patient is already admitted")
    bed.status = "occupied"
    data.update(status="admitted", admit_date=data.get("admit_date") or today())


def admission_after_create(db, a, user):
    b = db.get(m.Bed, a.bed_id)
    notify(db, a.patient_id, f"Admission confirmed: {b.ward}, bed {b.bed_no}.", "admission", "SMS")


BEFORE_CREATE["admissions"] = admission_before_create
AFTER_CREATE["admissions"] = admission_after_create


@router.post("/admissions/{adm_id}/discharge")
def discharge(adm_id: int, data: dict, db: Session = Depends(get_db), user=Depends(require("doctor", "nurse"))):
    a = db.get(m.Admission, adm_id)
    if not a or a.status != "admitted":
        raise HTTPException(409, "Admission is not active")
    if not (data.get("discharge_summary") or "").strip():
        raise HTTPException(422, "Discharge summary is required")
    bed = db.get(m.Bed, a.bed_id)
    days = max(1, (date.today() - date.fromisoformat(a.admit_date)).days)
    a.status, a.discharge_date = "discharged", today()
    a.discharge_summary, a.condition_at_discharge = data["discharge_summary"], data.get("condition_at_discharge") or "Stable"
    add_charge(db, a.patient_id, "bed", a.id, f"Bed charges – {bed.ward} {bed.bed_no} × {days} day(s)", days * bed.daily_rate)
    bed.status = "cleaning"
    notify(db, a.patient_id, "You have been discharged. Your discharge summary is available in the patient portal.", "discharge")
    audit(db, user, "discharge", "admissions", a.id)
    db.commit()
    return enrich(db, [a])[0]


def bed_before_update(db, b, data, user):
    if data.get("status") and data["status"] != "occupied" and b.status == "occupied":
        if db.query(m.Admission).filter_by(bed_id=b.id, status="admitted").first():
            raise HTTPException(409, "Bed has an active admission; discharge the patient first")


BEFORE_UPDATE["beds"] = bed_before_update


def user_before_create(db, data, user):
    if not data.get("password") or len(data["password"]) < 6:
        raise HTTPException(422, "Password must be at least 6 characters")
    data["password_hash"] = hash_password(data.pop("password"))


def user_before_update(db, u, data, user):
    if data.get("password"):
        data["password_hash"] = hash_password(data.pop("password"))


BEFORE_CREATE["users"] = user_before_create
BEFORE_UPDATE["users"] = user_before_update


@router.get("/rbac")
def rbac(user=Depends(current_user)):
    return [{"resource": k, "read": sorted(v["read"] | {"admin"}), "write": sorted(v["write"] | {"admin"})} for k, v in RESOURCES.items()]


# ================= Finance =================
def recalc(db, inv: m.Invoice):
    pays = db.query(m.Payment).filter_by(invoice_id=inv.id).all()
    paid = sum(p.amount for p in pays if p.kind != "refund") - sum(p.amount for p in pays if p.kind == "refund")
    refunds = sum(p.amount for p in pays if p.kind == "refund")
    inv.paid = round(paid, 2)
    inv.balance = round(inv.total - paid, 2)
    if refunds and paid <= 0.009:
        inv.status = "refunded"
    elif inv.balance <= 0.009:
        inv.status = "paid"
    elif paid > 0:
        inv.status = "partial"
    else:
        inv.status = "unpaid"


def advance_balance(db, pid):
    adv = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter_by(patient_id=pid, kind="advance").scalar()
    used = db.query(func.coalesce(func.sum(m.Payment.amount), 0)).filter_by(patient_id=pid, kind="advance_applied").scalar()
    return round(float(adv) - float(used), 2)


@router.get("/patients/{pid}/account")
def patient_account(pid: int, db: Session = Depends(get_db), user=Depends(require("accountant", "receptionist"))):
    if not db.get(m.Patient, pid):
        raise HTTPException(404, "Patient not found")
    unbilled = db.query(m.Charge).filter_by(patient_id=pid, invoice_id=None).order_by(m.Charge.id).all()
    invoices = db.query(m.Invoice).filter_by(patient_id=pid).all()
    return {"unbilled": [c.to_dict() for c in unbilled], "unbilled_total": round(sum(c.amount for c in unbilled), 2),
            "advance_balance": advance_balance(db, pid), "outstanding": round(sum(i.balance for i in invoices), 2)}


@router.post("/payments/advance")
def advance(data: dict, db: Session = Depends(get_db), user=Depends(require("accountant", "receptionist"))):
    amt = float(data.get("amount") or 0)
    if amt <= 0 or not db.get(m.Patient, int(data.get("patient_id") or 0)):
        raise HTTPException(422, "Valid patient and positive amount required")
    p = m.Payment(patient_id=int(data["patient_id"]), amount=amt, mode=data.get("mode") or "cash", kind="advance",
                  reference=data.get("reference"), note="Advance deposit")
    db.add(p)
    db.flush()
    notify(db, p.patient_id, f"Advance deposit of ₹{amt:,.2f} received. Receipt #{p.id}.", "billing", "SMS")
    audit(db, user, "advance", "payments", p.id, amt)
    db.commit()
    return p.to_dict()


@router.post("/invoices/generate")
def generate_invoice(data: dict, db: Session = Depends(get_db), user=Depends(require("accountant", "receptionist"))):
    pid = int(data.get("patient_id") or 0)
    charges = db.query(m.Charge).filter_by(patient_id=pid, invoice_id=None).all()
    if not charges:
        raise HTTPException(409, "No unbilled charges for this patient")
    subtotal = round(sum(c.amount for c in charges), 2)
    discount = min(float(data.get("discount") or 0), subtotal)
    tax = round((subtotal - discount) * float(data.get("tax_pct") or 0) / 100, 2)
    total = round(subtotal - discount + tax, 2)
    inv = m.Invoice(patient_id=pid, items=[{"source": c.source, "description": c.description, "amount": c.amount} for c in charges],
                    subtotal=subtotal, discount=discount, tax=tax, total=total, balance=total, notes=data.get("notes"),
                    tpa_name=data.get("tpa_name") or None, policy_no=data.get("policy_no") or None,
                    claim_amount=float(data.get("claim_amount") or 0), claim_status="submitted" if data.get("tpa_name") else "none")
    db.add(inv)
    db.flush()
    inv.invoice_no = f"INV-{date.today().year}-{inv.id:05d}"
    for c in charges:
        c.invoice_id = inv.id
    adv = advance_balance(db, pid)
    if adv > 0:
        db.add(m.Payment(patient_id=pid, invoice_id=inv.id, amount=min(adv, total), mode="adjustment", kind="advance_applied", note="Advance adjusted"))
        db.flush()
    recalc(db, inv)
    notify(db, pid, f"Invoice {inv.invoice_no} generated: total ₹{inv.total:,.2f}, balance due ₹{inv.balance:,.2f}.", "billing")
    audit(db, user, "generate", "invoices", inv.id, total)
    db.commit()
    return enrich(db, [inv])[0]


def _invoice(db, inv_id):
    inv = db.get(m.Invoice, inv_id)
    if not inv:
        raise HTTPException(404, "Invoice not found")
    return inv


@router.get("/invoices/{inv_id}/detail")
def invoice_detail(inv_id: int, db: Session = Depends(get_db), user=Depends(current_user)):
    inv = _invoice(db, inv_id)
    if user["role"] == "patient" and inv.patient_id != user.get("patient_id"):
        raise HTTPException(403, "Not your invoice")
    if user["role"] not in ("patient", "admin", "accountant", "receptionist"):
        raise HTTPException(403, "Not permitted")
    d = enrich(db, [inv])[0]
    d["payments"] = [p.to_dict() for p in db.query(m.Payment).filter_by(invoice_id=inv.id).order_by(m.Payment.id)]
    d["patient"] = db.get(m.Patient, inv.patient_id).to_dict()
    return d


@router.post("/invoices/{inv_id}/pay")
def pay(inv_id: int, data: dict, db: Session = Depends(get_db), user=Depends(require("accountant", "receptionist"))):
    inv = _invoice(db, inv_id)
    amt = float(data.get("amount") or 0)
    if amt <= 0 or amt > inv.balance + 0.009:
        raise HTTPException(422, f"Amount must be between 0 and the balance ₹{inv.balance:,.2f}")
    db.add(m.Payment(patient_id=inv.patient_id, invoice_id=inv.id, amount=amt, mode=data.get("mode") or "cash",
                     kind="payment", reference=data.get("reference")))
    db.flush()
    recalc(db, inv)
    notify(db, inv.patient_id, f"Payment of ₹{amt:,.2f} received for {inv.invoice_no}. Balance: ₹{inv.balance:,.2f}.", "billing", "SMS")
    audit(db, user, "payment", "invoices", inv.id, amt)
    db.commit()
    return invoice_detail(inv.id, db, user)


@router.post("/invoices/{inv_id}/refund")
def refund(inv_id: int, data: dict, db: Session = Depends(get_db), user=Depends(require("accountant"))):
    inv = _invoice(db, inv_id)
    amt = float(data.get("amount") or 0)
    if not (data.get("reason") or "").strip():
        raise HTTPException(422, "Refund reason is required")
    if amt <= 0 or amt > inv.paid + 0.009:
        raise HTTPException(422, f"Refund must be between 0 and amount paid ₹{inv.paid:,.2f}")
    db.add(m.Payment(patient_id=inv.patient_id, invoice_id=inv.id, amount=amt, mode=data.get("mode") or "cash",
                     kind="refund", note=data["reason"]))
    db.flush()
    recalc(db, inv)
    notify(db, inv.patient_id, f"Refund of ₹{amt:,.2f} processed for {inv.invoice_no}.", "billing", "SMS")
    audit(db, user, "refund", "invoices", inv.id, amt)
    db.commit()
    return invoice_detail(inv.id, db, user)


CLAIM_FLOW = {"none": ["submitted"], "submitted": ["approved", "rejected"], "approved": ["settled"], "rejected": ["submitted"], "settled": []}


@router.post("/invoices/{inv_id}/claim")
def claim(inv_id: int, data: dict, db: Session = Depends(get_db), user=Depends(require("accountant"))):
    inv = _invoice(db, inv_id)
    st = data.get("status")
    if st not in CLAIM_FLOW.get(inv.claim_status, []):
        raise HTTPException(409, f"Cannot move claim from '{inv.claim_status}' to '{st}'")
    if st == "submitted":
        if not (data.get("tpa_name") or inv.tpa_name):
            raise HTTPException(422, "TPA / insurer name is required")
        inv.tpa_name = data.get("tpa_name") or inv.tpa_name
        inv.policy_no = data.get("policy_no") or inv.policy_no
        inv.claim_amount = float(data.get("claim_amount") or inv.balance)
    if st == "approved":
        inv.approved_amount = min(float(data.get("approved_amount") or inv.claim_amount), inv.balance)
    if st == "settled":
        amt = min(inv.approved_amount, inv.balance)
        if amt > 0:
            db.add(m.Payment(patient_id=inv.patient_id, invoice_id=inv.id, amount=amt, mode="insurance", kind="insurance",
                             reference=inv.policy_no, note=f"TPA settlement – {inv.tpa_name}"))
            db.flush()
    inv.claim_status = st
    recalc(db, inv)
    audit(db, user, f"claim-{st}", "invoices", inv.id)
    db.commit()
    return invoice_detail(inv.id, db, user)


@router.get("/finance/summary")
def finance_summary(db: Session = Depends(get_db), user=Depends(require("accountant"))):
    invs = db.query(m.Invoice).all()
    pays = db.query(m.Payment).all()
    exps = db.query(m.Expense).all()
    collected = sum(p.amount for p in pays if p.kind in ("payment", "advance", "insurance")) - sum(p.amount for p in pays if p.kind == "refund")
    by_source = Counter()
    for c in db.query(m.Charge).filter(m.Charge.invoice_id.isnot(None)):
        by_source[c.source] += c.amount
    by_mode = Counter()
    for p in pays:
        if p.kind in ("payment", "advance", "insurance"):
            by_mode[p.mode] += p.amount
    days = [(date.today() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    daily = {d: {"date": d[5:], "collections": 0.0, "expenses": 0.0} for d in days}
    for p in pays:
        d = p.created_at.date().isoformat()
        if d in daily:
            daily[d]["collections"] += -p.amount if p.kind == "refund" else (p.amount if p.kind != "advance_applied" else 0)
    for e in exps:
        if e.date in daily:
            daily[e.date]["expenses"] += e.amount
    exp_cat = Counter()
    for e in exps:
        exp_cat[e.category] += e.amount
    total_exp = sum(e.amount for e in exps)
    return {
        "billed": round(sum(i.total for i in invs), 2), "collected": round(collected, 2),
        "outstanding": round(sum(max(i.balance, 0) for i in invs), 2),
        "refunds": round(sum(p.amount for p in pays if p.kind == "refund"), 2),
        "expenses": round(total_exp, 2), "net": round(collected - total_exp, 2),
        "invoice_status": dict(Counter(i.status for i in invs)), "claims": dict(Counter(i.claim_status for i in invs if i.claim_status != "none")),
        "by_source": [{"name": k, "value": round(v, 2)} for k, v in by_source.most_common()],
        "by_mode": [{"name": k, "value": round(v, 2)} for k, v in by_mode.most_common()],
        "daily": [{**v, "collections": round(v["collections"], 2)} for v in daily.values()],
        "expense_by_category": [{"name": k, "value": round(v, 2)} for k, v in exp_cat.most_common()],
    }


# ================= Dashboard =================
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user=Depends(require(*{"doctor", "nurse", "receptionist", "lab", "pharmacist", "accountant"}))):
    t = today()
    appts_today = db.query(m.Appointment).filter_by(date=t).all()
    beds = db.query(m.Bed).all()
    occ = sum(b.status == "occupied" for b in beds)
    week = [(date.today() - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    appt_week = Counter(a.date for a in db.query(m.Appointment).filter(m.Appointment.date.in_(week), m.Appointment.status != "cancelled"))
    rev_week = Counter()
    for p in db.query(m.Payment).filter(m.Payment.kind.in_(["payment", "insurance", "advance"])):
        rev_week[p.created_at.date().isoformat()] += p.amount
    dept = Counter()
    deps = {d.id: d.name for d in db.query(m.Department)}
    for a in db.query(m.Appointment).filter(m.Appointment.date >= week[0], m.Appointment.status != "cancelled"):
        dept[deps.get(a.department_id, "Other")] += 1
    ratings = [f.rating for f in db.query(m.Feedback)]
    month_start = date.today().replace(day=1)
    return {
        "patients": db.query(m.Patient).count(),
        "new_patients_month": db.query(m.Patient).filter(m.Patient.created_at >= datetime.combine(month_start, datetime.min.time())).count(),
        "appointments_today": len([a for a in appts_today if a.status != "cancelled"]),
        "appt_status_today": dict(Counter(a.status for a in appts_today)),
        "waiting": sum(a.status == "checked-in" for a in appts_today),
        "admitted": db.query(m.Admission).filter_by(status="admitted").count(),
        "beds_total": len(beds), "beds_occupied": occ, "occupancy_pct": round(100 * occ / len(beds), 1) if beds else 0,
        "pending_labs": db.query(m.LabOrder).filter(m.LabOrder.status.notin_(["completed", "reported", "cancelled"])).count(),
        "pending_rx": db.query(m.Prescription).filter_by(status="pending").count(),
        "collections_today": round(rev_week.get(t, 0), 2),
        "outstanding": round(float(db.query(func.coalesce(func.sum(m.Invoice.balance), 0)).scalar()), 2),
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "open_complaints": db.query(m.Complaint).filter(m.Complaint.status.in_(["open", "in-progress"])).count(),
        "appointments_week": [{"date": d[5:], "count": appt_week.get(d, 0)} for d in week],
        "revenue_week": [{"date": d[5:], "amount": round(rev_week.get(d, 0), 2)} for d in week],
        "department_load": [{"name": k, "value": v} for k, v in dept.most_common()],
        "bed_status": [{"name": k, "value": v} for k, v in Counter(b.status for b in beds).items()],
        "recent_activity": [a.to_dict() for a in db.query(m.AuditLog).order_by(m.AuditLog.id.desc()).limit(8)],
    }


# ================= Engagement =================
@router.post("/notifications/send")
def send_notification(data: dict, db: Session = Depends(get_db), user=Depends(require("receptionist"))):
    if not (data.get("message") or "").strip():
        raise HTTPException(422, "Message is required")
    if data.get("channel") not in ("WhatsApp", "SMS", "Email"):
        raise HTTPException(422, "Channel must be WhatsApp, SMS or Email")
    n = notify(db, int(data["patient_id"]) if data.get("patient_id") else None, data["message"], data.get("category") or "manual", data["channel"])
    db.commit()
    return enrich(db, [n])[0]


@router.post("/reminders/run")
def run_reminders(data: dict, db: Session = Depends(get_db), user=Depends(require("receptionist"))):
    kind = data.get("kind")
    tom, t = (date.today() + timedelta(days=1)).isoformat(), date.today()
    count = 0
    if kind == "appointment":
        for a in db.query(m.Appointment).filter(m.Appointment.date == tom, m.Appointment.status == "booked"):
            doc = db.get(m.Staff, a.doctor_id)
            notify(db, a.patient_id, f"Reminder: appointment tomorrow ({a.date}) at {a.time} with {doc.name}. Token #{a.token}.", "reminder")
            count += 1
    elif kind == "followup":
        for e in db.query(m.Encounter).filter(m.Encounter.follow_up_date.between(t.isoformat(), (t + timedelta(days=7)).isoformat())):
            notify(db, e.patient_id, f"Follow-up reminder: your review is due on {e.follow_up_date}. Book via the TEC THA portal.", "follow-up", "SMS")
            count += 1
    elif kind == "birthday":
        md = t.strftime("-%m-%d")
        for p in db.query(m.Patient).filter(m.Patient.dob.like(f"%{md}")):
            notify(db, p.id, f"Happy Birthday, {p.name}! Wishing you good health from TEC THA HEALTHCARE.", "birthday")
            count += 1
    elif kind == "wellness":
        cutoff = date(t.year - 60, t.month, min(t.day, 28)).isoformat()
        for p in db.query(m.Patient).filter(m.Patient.dob <= cutoff):
            notify(db, p.id, "Senior wellness check: book your annual health check-up at 20% off this month.", "wellness")
            count += 1
    else:
        raise HTTPException(422, "kind must be appointment, followup, birthday or wellness")
    audit(db, user, f"reminders-{kind}", "notifications", None, count)
    db.commit()
    return {"kind": kind, "sent": count}


def audience(db, aud):
    q = db.query(m.Patient).filter_by(status="active")
    if aud in ("female", "male"):
        q = q.filter(func.lower(m.Patient.gender) == aud)
    if aud == "seniors":
        t = date.today()
        q = q.filter(m.Patient.dob <= date(t.year - 60, t.month, min(t.day, 28)).isoformat())
    return q.all()


@router.post("/campaigns/{cid}/send")
def send_campaign(cid: int, db: Session = Depends(get_db), user=Depends(require("receptionist"))):
    c = db.get(m.Campaign, cid)
    if not c or c.status == "sent":
        raise HTTPException(409, "Campaign not found or already sent")
    pts = audience(db, c.audience)
    for p in pts:
        notify(db, p.id, c.message.replace("{name}", p.name), "campaign", c.channel)
    c.status, c.sent_count = "sent", len(pts)
    audit(db, user, "send", "campaigns", c.id, len(pts))
    db.commit()
    return c.to_dict()


def complaint_after_create(db, c, user):
    c.ticket_no = f"CMP-{c.id:05d}"
    if c.patient_id:
        notify(db, c.patient_id, f"We have registered your complaint {c.ticket_no}. Our team will respond within 24 hours.", "complaint", "SMS")


def complaint_after_update(db, c, old, user):
    if c.status != old["status"] and c.status == "resolved" and c.patient_id:
        notify(db, c.patient_id, f"Your complaint {c.ticket_no} has been resolved. {c.resolution or ''}", "complaint", "SMS")


def feedback_before_create(db, data, user):
    r = int(data.get("rating") or 0)
    if not 1 <= r <= 5:
        raise HTTPException(422, "Rating must be between 1 and 5")


AFTER_CREATE["complaints"] = complaint_after_create
AFTER_UPDATE["complaints"] = complaint_after_update
BEFORE_CREATE["feedback"] = feedback_before_create


@router.get("/engagement/summary")
def engagement_summary(db: Session = Depends(get_db), user=Depends(require("receptionist", "doctor", "nurse"))):
    fb = db.query(m.Feedback).all()
    ratings = [f.rating for f in fb]
    visits = Counter(a.patient_id for a in db.query(m.Appointment).filter_by(status="completed"))
    total_pts = db.query(m.Patient).count()
    cat = defaultdict(list)
    for f in fb:
        cat[f.category].append(f.rating)
    return {
        "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "responses": len(ratings),
        "promoters_pct": round(100 * sum(r >= 4 for r in ratings) / len(ratings), 1) if ratings else 0,
        "distribution": [{"name": f"{i}★", "value": ratings.count(i)} for i in range(1, 6)],
        "by_category": [{"name": k, "value": round(sum(v) / len(v), 2)} for k, v in cat.items()],
        "complaints": dict(Counter(c.status for c in db.query(m.Complaint))),
        "notifications_by_channel": [{"name": k, "value": v} for k, v in Counter(n.channel for n in db.query(m.Notification)).items()],
        "notifications_by_category": [{"name": k, "value": v} for k, v in Counter(n.category for n in db.query(m.Notification)).most_common(8)],
        "patients_total": total_pts, "patients_visited": len(visits), "returning": sum(v >= 2 for v in visits.values()),
        "retention_pct": round(100 * sum(v >= 2 for v in visits.values()) / len(visits), 1) if visits else 0,
    }


# ================= Patient portal =================
def portal_user(user=Depends(current_user)):
    if user["role"] != "patient" or not user.get("patient_id"):
        raise HTTPException(403, "Patient portal access only")
    return user


@router.get("/portal/me")
def portal_me(db: Session = Depends(get_db), user=Depends(portal_user)):
    pid = user["patient_id"]

    def rows(model, order="id"):
        return enrich(db, db.query(model).filter_by(patient_id=pid).order_by(getattr(model, order).desc()).all())

    return {
        "patient": db.get(m.Patient, pid).to_dict(), "appointments": rows(m.Appointment, "date"),
        "encounters": rows(m.Encounter, "created_at"), "prescriptions": rows(m.Prescription), "labs": rows(m.LabOrder),
        "invoices": rows(m.Invoice), "notifications": rows(m.Notification), "vitals": rows(m.Vital, "created_at"),
        "allergies": rows(m.Allergy), "admissions": rows(m.Admission), "feedback": rows(m.Feedback),
    }


@router.post("/portal/appointments", status_code=201)
def portal_book(data: dict, db: Session = Depends(get_db), user=Depends(portal_user)):
    data = {k: data.get(k) for k in ("doctor_id", "date", "time", "type", "reason")}
    data["patient_id"] = user["patient_id"]
    return enrich(db, [create_record(db, "appointments", data, user, skip_perm=True)])[0]


@router.patch("/portal/appointments/{aid}")
def portal_update(aid: int, data: dict, db: Session = Depends(get_db), user=Depends(portal_user)):
    a = db.get(m.Appointment, aid)
    if not a or a.patient_id != user["patient_id"]:
        raise HTTPException(404, "Appointment not found")
    if a.status not in ("booked",):
        raise HTTPException(409, "Only booked appointments can be changed online")
    allowed = {k: v for k, v in data.items() if k in ("date", "time", "doctor_id")}
    if data.get("status") == "cancelled":
        allowed["status"] = "cancelled"
    return enrich(db, [update_record(db, "appointments", aid, allowed, user, skip_perm=True)])[0]


@router.post("/portal/feedback", status_code=201)
def portal_feedback(data: dict, db: Session = Depends(get_db), user=Depends(portal_user)):
    data = {k: data.get(k) for k in ("rating", "category", "comment")}
    data["patient_id"] = user["patient_id"]
    return create_record(db, "feedback", data, user, skip_perm=True).to_dict()


@router.post("/portal/complaints", status_code=201)
def portal_complaint(data: dict, db: Session = Depends(get_db), user=Depends(portal_user)):
    data = {k: data.get(k) for k in ("subject", "description", "category")}
    data["patient_id"] = user["patient_id"]
    return create_record(db, "complaints", data, user, skip_perm=True).to_dict()
