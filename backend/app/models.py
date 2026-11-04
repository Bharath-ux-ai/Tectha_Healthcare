"""Shared data model for all six modules. Every table carries id + created_at;
operational tables carry branch_id so the schema is multi-branch ready."""
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import mapped_column

from .db import Base


def S(n=120, **kw):
    return mapped_column(String(n), **kw)


def I(**kw):
    return mapped_column(Integer, **kw)


def F(**kw):
    return mapped_column(Float, **kw)


def T(**kw):
    return mapped_column(Text, **kw)


def FK(**kw):  # logical foreign key (kept as plain int for portable demo seeding)
    return mapped_column(Integer, index=True, **kw)


class Core(Base):
    __abstract__ = True
    id = mapped_column(Integer, primary_key=True)
    created_at = mapped_column(DateTime, default=datetime.utcnow)
    HIDDEN: tuple = ()

    def to_dict(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns if c.name not in self.HIDDEN}


# ---------- Hospital operations ----------
class Branch(Core):
    __tablename__ = "branches"
    name = S(nullable=False)
    city = S()
    address = S(255)
    phone = S(30)


class Department(Core):
    __tablename__ = "departments"
    name = S(nullable=False)
    code = S(20)
    description = S(255)
    branch_id = FK(default=1)


class Staff(Core):
    __tablename__ = "staff"
    name = S(nullable=False)
    role = S(30, nullable=False)  # doctor | nurse | receptionist | lab | pharmacist | accountant | admin
    department_id = FK()
    specialization = S()
    qualification = S()
    phone = S(30)
    email = S()
    consult_fee = F(default=0)
    available_days = S(40, default="Mon,Tue,Wed,Thu,Fri,Sat")
    slot_start = S(5, default="09:00")
    slot_end = S(5, default="13:00")
    slot_minutes = I(default=15)
    status = S(20, default="active")
    branch_id = FK(default=1)


class User(Core):
    __tablename__ = "users"
    HIDDEN = ("password_hash",)
    username = S(60, unique=True, nullable=False)
    password_hash = S(255, nullable=False)
    name = S()
    role = S(30, nullable=False)
    staff_id = FK()
    patient_id = FK()
    active = mapped_column(Boolean, default=True)


class Bed(Core):
    __tablename__ = "beds"
    ward = S(60, nullable=False)
    room = S(20)
    bed_no = S(20, nullable=False)
    bed_type = S(30, default="General")
    daily_rate = F(default=1500)
    status = S(20, default="available")  # available | occupied | cleaning | maintenance
    branch_id = FK(default=1)


class Duty(Core):
    __tablename__ = "duties"
    staff_id = FK(nullable=False)
    date = S(10, nullable=False)
    shift = S(20, nullable=False)  # Morning | Evening | Night
    area = S(60)
    status = S(20, default="scheduled")


class AuditLog(Core):
    __tablename__ = "audit_logs"
    user = S(60)
    role = S(30)
    action = S(40)
    entity = S(60)
    entity_id = I()
    detail = S(255)


# ---------- Patient experience ----------
class Patient(Core):
    __tablename__ = "patients"
    uhid = S(30, unique=True)
    name = S(nullable=False)
    dob = S(10, nullable=False)
    gender = S(10, nullable=False)
    phone = S(30, nullable=False)
    email = S()
    blood_group = S(5)
    address = S(255)
    emergency_contact = S()
    insurance_provider = S()
    policy_no = S(60)
    status = S(20, default="active")
    branch_id = FK(default=1)


class Appointment(Core):
    __tablename__ = "appointments"
    patient_id = FK(nullable=False)
    doctor_id = FK(nullable=False)
    department_id = FK()
    date = S(10, nullable=False)
    time = S(5, nullable=False)
    type = S(20, default="in-person")  # in-person | tele
    reason = S(255)
    status = S(20, default="booked")  # booked | checked-in | in-consultation | completed | cancelled | no-show
    token = I()
    meeting_link = S(255)
    branch_id = FK(default=1)


# ---------- Clinical care ----------
class Vital(Core):
    __tablename__ = "vitals"
    patient_id = FK(nullable=False)
    bp = S(10)
    pulse = I()
    temperature = F()
    spo2 = I()
    weight = F()
    height = F()
    recorded_by = S(60)


class Allergy(Core):
    __tablename__ = "allergies"
    patient_id = FK(nullable=False)
    allergen = S(nullable=False)
    reaction = S()
    severity = S(20, default="moderate")


class Encounter(Core):
    __tablename__ = "encounters"
    patient_id = FK(nullable=False)
    appointment_id = FK()
    doctor_id = FK()
    complaint = S(255)
    notes = T()
    diagnosis = S(255)
    icd_code = S(20)
    treatment_plan = T()
    follow_up_date = S(10)


class Prescription(Core):
    __tablename__ = "prescriptions"
    patient_id = FK(nullable=False)
    encounter_id = FK()
    doctor_id = FK()
    items = mapped_column(JSON, default=list)  # [{medicine, dosage, frequency, days, qty, instructions}]
    notes = S(255)
    status = S(20, default="pending")  # pending | dispensed | cancelled
    dispensed_at = mapped_column(DateTime)


class Admission(Core):
    __tablename__ = "admissions"
    patient_id = FK(nullable=False)
    doctor_id = FK()
    bed_id = FK(nullable=False)
    admit_date = S(10)
    reason = S(255)
    status = S(20, default="admitted")
    discharge_date = S(10)
    discharge_summary = T()
    condition_at_discharge = S(60)


# ---------- Diagnostics & pharmacy ----------
class LabOrder(Core):
    __tablename__ = "lab_orders"
    patient_id = FK(nullable=False)
    doctor_id = FK()
    encounter_id = FK()
    category = S(20, default="lab")  # lab | radiology
    test_name = S(nullable=False)
    modality = S(20)  # X-ray | CT | MRI | USG (radiology)
    priority = S(20, default="routine")
    status = S(30, default="ordered")
    sample_id = S(40)
    result = T()
    reference_range = S()
    findings = T()
    impression = S(255)
    reported_by = S(60)
    reported_at = mapped_column(DateTime)
    price = F(default=0)


class Supplier(Core):
    __tablename__ = "suppliers"
    name = S(nullable=False)
    contact_person = S()
    phone = S(30)
    email = S()
    gstin = S(30)
    address = S(255)


class Medicine(Core):
    __tablename__ = "medicines"
    __table_args__ = (UniqueConstraint("name", "batch_no"),)
    name = S(nullable=False)
    generic_name = S()
    form = S(30, default="Tablet")
    batch_no = S(40, nullable=False)
    expiry_date = S(10, nullable=False)
    stock = I(default=0)
    reorder_level = I(default=50)
    unit_price = F(default=0)
    supplier_id = FK()
    manufacturer = S()


class PurchaseOrder(Core):
    __tablename__ = "purchase_orders"
    po_number = S(30)
    supplier_id = FK(nullable=False)
    items = mapped_column(JSON, default=list)  # [{name, qty, unit_price, batch_no, expiry_date}]
    total = F(default=0)
    status = S(20, default="ordered")  # ordered | received | cancelled
    expected_date = S(10)
    received_at = mapped_column(DateTime)


# ---------- Financial ----------
class Charge(Core):
    __tablename__ = "charges"
    patient_id = FK(nullable=False)
    source = S(30)  # consultation | lab | radiology | pharmacy | bed | procedure
    ref_id = I()
    description = S(255)
    amount = F(default=0)
    invoice_id = FK()


class Invoice(Core):
    __tablename__ = "invoices"
    invoice_no = S(30)
    patient_id = FK(nullable=False)
    items = mapped_column(JSON, default=list)
    subtotal = F(default=0)
    discount = F(default=0)
    tax = F(default=0)
    total = F(default=0)
    paid = F(default=0)
    balance = F(default=0)
    status = S(20, default="unpaid")  # unpaid | partial | paid | refunded
    tpa_name = S()
    policy_no = S(60)
    claim_amount = F(default=0)
    claim_status = S(20, default="none")  # none | submitted | approved | rejected | settled
    approved_amount = F(default=0)
    notes = S(255)
    branch_id = FK(default=1)


class Payment(Core):
    __tablename__ = "payments"
    patient_id = FK(nullable=False)
    invoice_id = FK()
    amount = F(nullable=False)
    mode = S(20, default="cash")  # cash | card | upi | insurance | adjustment
    kind = S(20, default="payment")  # payment | advance | advance_applied | refund | insurance
    reference = S(60)
    note = S(255)


class Expense(Core):
    __tablename__ = "expenses"
    category = S(40, nullable=False)
    description = S(255)
    amount = F(nullable=False)
    date = S(10, nullable=False)
    vendor = S()
    branch_id = FK(default=1)


# ---------- Patient engagement ----------
class Notification(Core):
    __tablename__ = "notifications"
    patient_id = FK()
    channel = S(20, default="WhatsApp")  # WhatsApp | SMS | Email
    category = S(30, default="manual")
    message = T(nullable=False)
    phone = S(30)
    status = S(30, default="simulated-sent")


class Feedback(Core):
    __tablename__ = "feedback"
    patient_id = FK(nullable=False)
    rating = I(nullable=False)
    category = S(40, default="Overall")
    comment = S(500)


class Complaint(Core):
    __tablename__ = "complaints"
    ticket_no = S(30)
    patient_id = FK()
    subject = S(nullable=False)
    description = T()
    category = S(40, default="Service")
    priority = S(20, default="medium")
    status = S(20, default="open")  # open | in-progress | resolved | closed
    assigned_to = S(60)
    resolution = S(500)


class Campaign(Core):
    __tablename__ = "campaigns"
    name = S(nullable=False)
    channel = S(20, default="WhatsApp")
    audience = S(30, default="all")  # all | female | male | seniors
    message = T(nullable=False)
    scheduled_date = S(10)
    status = S(20, default="draft")
    sent_count = I(default=0)
