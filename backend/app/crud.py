"""Generic, permission-aware REST CRUD for every resource: /api/r/{resource}.
Workflow rules live in services.py and plug in through the hook dictionaries."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import Float, Integer, or_
from sqlalchemy.orm import Session

from . import models as m
from .auth import current_user
from .db import get_db

STAFF = {"admin", "doctor", "nurse", "receptionist", "lab", "pharmacist", "accountant"}
CLIN = {"doctor", "nurse"}
FRONT = {"receptionist"}
FIN = {"accountant"}


def R(model, read, write, search=()):
    return {"model": model, "read": set(read), "write": set(write), "search": search}


RESOURCES = {
    "patients": R(m.Patient, STAFF, CLIN | FRONT, ("name", "uhid", "phone", "email")),
    "appointments": R(m.Appointment, STAFF, CLIN | FRONT, ("reason", "status", "date")),
    "vitals": R(m.Vital, CLIN, CLIN),
    "allergies": R(m.Allergy, CLIN | {"pharmacist"}, CLIN, ("allergen",)),
    "encounters": R(m.Encounter, CLIN, {"doctor"}, ("diagnosis", "complaint")),
    "prescriptions": R(m.Prescription, CLIN | {"pharmacist"}, {"doctor"}, ("status",)),
    "lab-orders": R(m.LabOrder, CLIN | {"lab", "receptionist"}, {"doctor", "lab"}, ("test_name", "sample_id", "status")),
    "admissions": R(m.Admission, STAFF, CLIN | FRONT, ("reason", "status")),
    "beds": R(m.Bed, STAFF, {"nurse", "receptionist"}, ("ward", "bed_no", "bed_type", "status")),
    "staff": R(m.Staff, STAFF, set(), ("name", "role", "specialization", "phone")),
    "departments": R(m.Department, STAFF, set(), ("name", "code")),
    "branches": R(m.Branch, STAFF, set(), ("name", "city")),
    "duties": R(m.Duty, STAFF, {"nurse"}, ("shift", "area", "date")),
    "medicines": R(m.Medicine, {"pharmacist", "doctor"}, {"pharmacist"}, ("name", "generic_name", "batch_no")),
    "suppliers": R(m.Supplier, {"pharmacist", "accountant"}, {"pharmacist"}, ("name", "contact_person")),
    "purchase-orders": R(m.PurchaseOrder, {"pharmacist", "accountant"}, {"pharmacist"}, ("po_number", "status")),
    "charges": R(m.Charge, FIN | FRONT, FIN, ("description", "source")),
    "invoices": R(m.Invoice, FIN | FRONT, set(), ("invoice_no", "status", "claim_status", "tpa_name")),
    "payments": R(m.Payment, FIN | FRONT, set(), ("mode", "kind", "reference")),
    "expenses": R(m.Expense, FIN, FIN, ("category", "description", "vendor")),
    "notifications": R(m.Notification, STAFF, FRONT, ("message", "channel", "category")),
    "feedback": R(m.Feedback, FRONT, FRONT, ("comment", "category")),
    "complaints": R(m.Complaint, FRONT | CLIN, FRONT, ("subject", "ticket_no", "status")),
    "campaigns": R(m.Campaign, FRONT, FRONT, ("name", "audience")),
    "users": R(m.User, set(), set(), ("username", "name", "role")),
    "audit-logs": R(m.AuditLog, set(), set(), ("user", "action", "entity")),
}

# hook signatures: before_create(db, data, user); after_create(db, obj, user)
# before_update(db, obj, data, user); after_update(db, obj, old: dict, user); before_delete(db, obj, user)
BEFORE_CREATE, AFTER_CREATE, BEFORE_UPDATE, AFTER_UPDATE, BEFORE_DELETE = {}, {}, {}, {}, {}

router = APIRouter(prefix="/api/r", tags=["resources"])


def cfg_for(res):
    cfg = RESOURCES.get(res)
    if not cfg:
        raise HTTPException(404, f"Unknown resource '{res}'")
    return cfg


def check(user, roles):
    if user["role"] != "admin" and user["role"] not in roles:
        raise HTTPException(403, "Your role is not permitted to perform this action")


def audit(db, user, action, entity, entity_id=None, detail=""):
    db.add(m.AuditLog(user=user.get("username"), role=user.get("role"), action=action,
                      entity=entity, entity_id=entity_id, detail=str(detail)[:250]))


def coerce(column, value):
    if value in ("", None):
        return None
    if isinstance(column.type, Integer):
        return int(value)
    if isinstance(column.type, Float):
        return float(value)
    return value


def clean(model, data: dict, partial=False):
    cols = model.__table__.columns
    out = {}
    for k, v in data.items():
        if k in cols and k not in ("id", "created_at"):
            try:
                out[k] = coerce(cols[k], v) if not isinstance(v, (list, dict, bool)) else v
            except (TypeError, ValueError):
                raise HTTPException(422, f"Invalid value for '{k}'")
    if not partial:
        for c in cols:
            if not c.nullable and not c.primary_key and c.default is None and out.get(c.name) in (None, ""):
                raise HTTPException(422, f"Missing required field: {c.name.replace('_', ' ')}")
    return out


def enrich(db: Session, rows):
    """Attach human-readable names for linked records (patient, doctor, staff, bed, supplier, department)."""
    dicts = [r.to_dict() for r in rows]

    def lookup(model, key):
        ids = {d.get(key) for d in dicts if d.get(key)}
        return {o.id: o for o in db.query(model).filter(model.id.in_(ids))} if ids else {}

    pmap = lookup(m.Patient, "patient_id")
    staff = {**lookup(m.Staff, "doctor_id"), **lookup(m.Staff, "staff_id")}
    beds, sups, deps = lookup(m.Bed, "bed_id"), lookup(m.Supplier, "supplier_id"), lookup(m.Department, "department_id")
    for d in dicts:
        if (p := pmap.get(d.get("patient_id"))):
            d["patient_name"], d["patient_uhid"], d["patient_phone"] = p.name, p.uhid, p.phone
        if (s := staff.get(d.get("doctor_id"))):
            d["doctor_name"] = s.name
        if (s := staff.get(d.get("staff_id"))):
            d["staff_name"], d["staff_role"] = s.name, s.role
        if (b := beds.get(d.get("bed_id"))):
            d["bed_label"] = f"{b.ward} · {b.bed_no}"
        if (s := sups.get(d.get("supplier_id"))):
            d["supplier_name"] = s.name
        if (dp := deps.get(d.get("department_id"))):
            d["department_name"] = dp.name
    return dicts


# ----- reusable operations (also called by workflow & portal endpoints) -----
def create_record(db, res, data, user, skip_perm=False):
    cfg = cfg_for(res)
    if not skip_perm:
        check(user, cfg["write"])
    data = dict(data)
    if res in BEFORE_CREATE:
        BEFORE_CREATE[res](db, data, user)
    obj = cfg["model"](**clean(cfg["model"], data))
    db.add(obj)
    db.flush()
    if res in AFTER_CREATE:
        AFTER_CREATE[res](db, obj, user)
    audit(db, user, "create", res, obj.id)
    db.commit()
    return obj


def update_record(db, res, obj_id, data, user, skip_perm=False):
    cfg = cfg_for(res)
    if not skip_perm:
        check(user, cfg["write"])
    obj = db.get(cfg["model"], obj_id)
    if not obj:
        raise HTTPException(404, "Record not found")
    data = dict(data)
    old = obj.to_dict()
    if res in BEFORE_UPDATE:
        BEFORE_UPDATE[res](db, obj, data, user)
    for k, v in clean(cfg["model"], data, partial=True).items():
        setattr(obj, k, v)
    db.flush()
    if res in AFTER_UPDATE:
        AFTER_UPDATE[res](db, obj, old, user)
    audit(db, user, "update", res, obj.id, ",".join(k for k in data if k in old))
    db.commit()
    return obj


# ----- routes -----
@router.get("/{res}")
def list_records(res: str, request: Request, q: str = "", sort: str = "id", order: str = "desc",
                 limit: int = 50, offset: int = 0, db: Session = Depends(get_db), user=Depends(current_user)):
    cfg = cfg_for(res)
    check(user, cfg["read"])
    M = cfg["model"]
    cols = M.__table__.columns
    query = db.query(M)
    for k, v in request.query_params.items():
        if k in cols and v != "":
            if "," in v:
                query = query.filter(getattr(M, k).in_([coerce(cols[k], x) for x in v.split(",")]))
            else:
                query = query.filter(getattr(M, k) == coerce(cols[k], v))
    if q and cfg["search"]:
        like = f"%{q}%"
        conds = [getattr(M, f).ilike(like) for f in cfg["search"]]
        if "patient_id" in cols:  # search linked records by patient name / UHID
            pids = [p.id for p in db.query(m.Patient.id).filter(or_(m.Patient.name.ilike(like), m.Patient.uhid.ilike(like)))]
            if pids:
                conds.append(M.patient_id.in_(pids))
        query = query.filter(or_(*conds))
    total = query.count()
    sort_col = getattr(M, sort) if sort in cols else M.id
    query = query.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    rows = query.offset(max(offset, 0)).limit(min(max(limit, 1), 500)).all()
    return {"items": enrich(db, rows), "total": total}


@router.get("/{res}/{obj_id}")
def get_record(res: str, obj_id: int, db: Session = Depends(get_db), user=Depends(current_user)):
    cfg = cfg_for(res)
    check(user, cfg["read"])
    obj = db.get(cfg["model"], obj_id)
    if not obj:
        raise HTTPException(404, "Record not found")
    return enrich(db, [obj])[0]


@router.post("/{res}", status_code=201)
def create(res: str, data: dict, db: Session = Depends(get_db), user=Depends(current_user)):
    return enrich(db, [create_record(db, res, data, user)])[0]


@router.patch("/{res}/{obj_id}")
def update(res: str, obj_id: int, data: dict, db: Session = Depends(get_db), user=Depends(current_user)):
    return enrich(db, [update_record(db, res, obj_id, data, user)])[0]


@router.delete("/{res}/{obj_id}")
def delete(res: str, obj_id: int, db: Session = Depends(get_db), user=Depends(current_user)):
    cfg = cfg_for(res)
    check(user, cfg["write"])
    obj = db.get(cfg["model"], obj_id)
    if not obj:
        raise HTTPException(404, "Record not found")
    if res in BEFORE_DELETE:
        BEFORE_DELETE[res](db, obj, user)
    db.delete(obj)
    audit(db, user, "delete", res, obj_id)
    db.commit()
    return {"ok": True}
