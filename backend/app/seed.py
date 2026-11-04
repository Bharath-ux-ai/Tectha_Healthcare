"""Synthetic demo data (no real patient information). Runs once on an empty database.
Uses the same workflow functions as the UI so records are connected end-to-end."""
import random
from datetime import date, datetime, timedelta

from . import models as m
from .auth import hash_password
from .services import add_charge, generate_invoice, pay, patient_after_create

SYS = {"username": "system", "role": "admin", "name": "System Seed", "staff_id": None}
rnd = random.Random(42)


def d(offset=0):
    return (date.today() + timedelta(days=offset)).isoformat()


def ts(offset=0, hour=11):
    return datetime.combine(date.today() + timedelta(days=offset), datetime.min.time()) + timedelta(hours=hour, minutes=rnd.randint(0, 50))


def seed(db):
    if db.query(m.User).count():
        return
    db.add_all([m.Branch(name="TEC THA Main Hospital", city="Coimbatore", address="Avinashi Road (demo address)", phone="0422-0000000"),
                m.Branch(name="TEC THA City Clinic", city="Tiruppur", address="Demo Street", phone="0421-0000000")])
    deps = {}
    for name, code in [("General Medicine", "GM"), ("Cardiology", "CAR"), ("Pediatrics", "PED"), ("Orthopedics", "ORT"),
                       ("Radiology", "RAD"), ("Pathology", "PAT"), ("Pharmacy", "PHR"), ("Administration", "ADM")]:
        deps[code] = m.Department(name=name, code=code, description=f"{name} department")
        db.add(deps[code])
    db.flush()

    def staff(name, role, dep, **kw):
        s = m.Staff(name=name, role=role, department_id=deps[dep].id, phone=f"+91 90000 {rnd.randint(10000, 99999)}",
                    email=name.lower().replace("dr. ", "").replace(" ", ".") + "@tecthha.demo", **kw)
        db.add(s)
        db.flush()
        return s

    ALL = "Mon,Tue,Wed,Thu,Fri,Sat,Sun"
    ananya = staff("Dr. Ananya Raman", "doctor", "GM", specialization="Internal Medicine", qualification="MBBS, MD", consult_fee=500, available_days=ALL, slot_start="09:00", slot_end="17:00")
    vikram = staff("Dr. Vikram Sethu", "doctor", "CAR", specialization="Cardiology", qualification="MBBS, MD, DM", consult_fee=900, available_days="Mon,Wed,Fri", slot_start="10:00", slot_end="14:00", slot_minutes=20)
    meera = staff("Dr. Meera Krishnan", "doctor", "PED", specialization="Pediatrics", qualification="MBBS, DCH", consult_fee=600, available_days="Mon,Tue,Wed,Thu,Fri,Sat", slot_start="09:00", slot_end="12:00")
    arjun = staff("Dr. Arjun Prakash", "doctor", "ORT", specialization="Orthopedics", qualification="MBBS, MS Ortho", consult_fee=800, available_days="Tue,Thu,Sat", slot_start="14:00", slot_end="18:00", slot_minutes=20)
    kavya = staff("Dr. Kavya Nair", "doctor", "GM", specialization="Family Medicine", qualification="MBBS, DNB", consult_fee=500, available_days=ALL, slot_start="16:00", slot_end="20:00")
    doctors = [ananya, vikram, meera, arjun, kavya]
    nurses = [staff(n, "nurse", "GM", qualification="B.Sc Nursing") for n in ("Lakshmi Devi", "Priya Sundar", "Rahul Menon")]
    recep = staff("Divya Mohan", "receptionist", "ADM")
    labt = staff("Sanjay Kumar", "lab", "PAT", qualification="DMLT")
    pharm = staff("Fathima Begum", "pharmacist", "PHR", qualification="B.Pharm")
    acct = staff("Karthik Subramanian", "accountant", "ADM", qualification="B.Com")
    adm = staff("Hospital Administrator", "admin", "ADM")

    for u, pw, role, s in [("admin", "admin123", "admin", adm), ("doctor", "doctor123", "doctor", ananya), ("cardio", "doctor123", "doctor", vikram),
                           ("nurse", "nurse123", "nurse", nurses[0]), ("reception", "reception123", "receptionist", recep),
                           ("lab", "lab123", "lab", labt), ("pharmacy", "pharmacy123", "pharmacist", pharm), ("accounts", "accounts123", "accountant", acct)]:
        db.add(m.User(username=u, password_hash=hash_password(pw), role=role, name=s.name, staff_id=s.id))

    # beds
    beds = []
    for ward, prefix, n, typ, rate in [("General Ward A", "A", 8, "General", 1200), ("Semi-Private B", "B", 4, "Semi-private", 2500),
                                       ("Private Wing", "P", 4, "Private", 4500), ("ICU", "I", 4, "ICU", 9000)]:
        for i in range(1, n + 1):
            b = m.Bed(ward=ward, room=f"{prefix}{(i + 1) // 2:02d}", bed_no=f"{prefix}{i}", bed_type=typ, daily_rate=rate)
            beds.append(b)
            db.add(b)

    # suppliers & medicines
    sups = [m.Supplier(name=n, contact_person=c, phone=f"+91 90000 {rnd.randint(10000, 99999)}", email=f"orders@{n.split()[0].lower()}.demo", gstin=f"33DEMO{rnd.randint(1000, 9999)}Z1")
            for n, c in [("MediLine Distributors", "Ravi Shankar"), ("Kovai Pharma Agencies", "Selvi Arumugam"), ("SouthCare Surgicals", "Joseph Mathew")]]
    db.add_all(sups)
    db.flush()
    meds = [("Paracetamol 500mg", "Paracetamol", "Tablet", 2.0, 200), ("Amoxicillin 500mg", "Amoxicillin", "Capsule", 6.5, 100),
            ("Azithromycin 500mg", "Azithromycin", "Tablet", 18.0, 60), ("Metformin 500mg", "Metformin", "Tablet", 3.0, 150),
            ("Amlodipine 5mg", "Amlodipine", "Tablet", 4.0, 100), ("Atorvastatin 10mg", "Atorvastatin", "Tablet", 7.5, 100),
            ("Pantoprazole 40mg", "Pantoprazole", "Tablet", 6.0, 100), ("Cetirizine 10mg", "Cetirizine", "Tablet", 2.5, 100),
            ("Ibuprofen 400mg", "Ibuprofen", "Tablet", 3.5, 100), ("ORS Sachet", "Oral Rehydration Salts", "Sachet", 20.0, 50),
            ("Salbutamol Inhaler", "Salbutamol", "Inhaler", 145.0, 15), ("Vitamin D3 60000 IU", "Cholecalciferol", "Capsule", 32.0, 40)]
    for i, (name, gen, form, price, reorder) in enumerate(meds):
        sup = sups[i % 3].id
        db.add(m.Medicine(name=name, generic_name=gen, form=form, batch_no=f"B{24 + i:02d}A{i:02d}", expiry_date=d(45 + i * 3) if i % 4 == 0 else d(400 + i * 10),
                          stock=rnd.randint(60, 180) if i % 4 == 0 else rnd.randint(250, 600), reorder_level=reorder, unit_price=price, supplier_id=sup, manufacturer="Demo Labs"))
        if i % 3 == 1:
            db.add(m.Medicine(name=name, generic_name=gen, form=form, batch_no=f"B{25 + i:02d}C{i:02d}", expiry_date=d(600), stock=rnd.randint(100, 300),
                              reorder_level=reorder, unit_price=price, supplier_id=sup, manufacturer="Demo Labs"))
    db.add(m.Medicine(name="Ibuprofen 400mg", generic_name="Ibuprofen", form="Tablet", batch_no="B22X01", expiry_date=d(-20), stock=40, reorder_level=100, unit_price=3.5, supplier_id=sups[0].id, manufacturer="Demo Labs"))
    db.query(m.Medicine).filter_by(name="Salbutamol Inhaler").update({"stock": 8})

    # patients (synthetic)
    names = [("Arun Kumar", "M", 1979), ("Sangeetha Ravi", "F", 1988), ("Mohammed Irfan", "M", 1995), ("Janani Shankar", "F", 2016),
             ("Ramasamy Gounder", "M", 1952), ("Nithya Balaji", "F", 1991), ("Suresh Babu", "M", 1968), ("Kamala Venkatesh", "F", 1957),
             ("Harish Chandran", "M", 2001), ("Aishwarya Pillai", "F", 1999), ("Gopal Krishnan", "M", 1948), ("Revathi Murugan", "F", 1983),
             ("Daniel Joseph", "M", 1990), ("Thenmozhi Selvam", "F", 1975)]
    pts = []
    for i, (n, g, y) in enumerate(names):
        dob = f"{y}-{date.today():%m-%d}" if i == 5 else f"{y}-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}"
        p = m.Patient(name=n, gender="Male" if g == "M" else "Female", dob=dob, phone=f"+91 90000 {20000 + i * 137}", email=f"{n.split()[0].lower()}@example.com",
                      blood_group=rnd.choice(["A+", "B+", "O+", "AB+", "O-", "B-"]), address=f"{rnd.randint(1, 99)}, Demo Nagar, Coimbatore",
                      emergency_contact=f"Family · +91 90000 {30000 + i}", insurance_provider="Star Demo Health" if i % 3 == 0 else None,
                      policy_no=f"SDH-{100000 + i}" if i % 3 == 0 else None, created_at=ts(-rnd.randint(0, 40)))
        db.add(p)
        db.flush()
        patient_after_create(db, p, SYS)
        pts.append(p)
    db.add(m.User(username="patient", password_hash=hash_password("patient123"), role="patient", name=pts[0].name, patient_id=pts[0].id))
    db.add_all([m.Allergy(patient_id=pts[0].id, allergen="Penicillin", reaction="Rash", severity="severe"),
                m.Allergy(patient_id=pts[4].id, allergen="Sulfa drugs", reaction="Urticaria", severity="moderate"),
                m.Allergy(patient_id=pts[3].id, allergen="Peanuts", reaction="Swelling", severity="severe")])
    db.flush()

    # ---- history: completed visits over the last 14 days ----
    diag = [("Acute viral fever", "B34.9"), ("Type 2 diabetes mellitus", "E11.9"), ("Essential hypertension", "I10"),
            ("Acute pharyngitis", "J02.9"), ("Low back pain", "M54.5"), ("Gastritis", "K29.7"), ("Allergic rhinitis", "J30.4")]
    rx_for = {"B34.9": [("Paracetamol 500mg", "1-0-1", 5, 10)], "E11.9": [("Metformin 500mg", "1-0-1", 30, 60)],
              "I10": [("Amlodipine 5mg", "1-0-0", 30, 30)], "J02.9": [("Azithromycin 500mg", "1-0-0", 3, 3), ("Paracetamol 500mg", "1-1-1", 3, 9)],
              "M54.5": [("Ibuprofen 400mg", "1-0-1", 5, 10)], "K29.7": [("Pantoprazole 40mg", "1-0-0", 14, 14)], "J30.4": [("Cetirizine 10mg", "0-0-1", 7, 7)]}
    staff_user = {"username": "seed", "role": "admin", "name": "Seed", "staff_id": None}
    for k in range(26):
        off = -rnd.randint(1, 14)
        p, doc = rnd.choice(pts), rnd.choice([ananya, ananya, vikram, meera, kavya])
        a = m.Appointment(patient_id=p.id, doctor_id=doc.id, department_id=doc.department_id, date=d(off), time=f"{rnd.choice([9, 10, 11, 16, 17])}:{rnd.choice(['00', '15', '30'])}",
                          reason="Consultation", status="completed", token=k % 9 + 1, created_at=ts(off - 1))
        db.add(a)
        db.flush()
        dx, code = rnd.choice(diag)
        e = m.Encounter(patient_id=p.id, appointment_id=a.id, doctor_id=doc.id, complaint="Presenting complaints recorded", diagnosis=dx, icd_code=code,
                        notes="Synthetic demo note. Examination findings recorded by the treating doctor.", treatment_plan="Medication as prescribed; review if symptoms persist.",
                        follow_up_date=d(rnd.randint(1, 6)) if k % 4 == 0 else None, created_at=ts(off))
        db.add(e)
        db.add(m.Vital(patient_id=p.id, bp=f"{rnd.randint(110, 150)}/{rnd.randint(70, 95)}", pulse=rnd.randint(68, 98), temperature=round(rnd.uniform(97.6, 101.2), 1),
                       spo2=rnd.randint(95, 99), weight=rnd.randint(45, 88), height=rnd.randint(150, 180), recorded_by="Lakshmi Devi", created_at=ts(off)))
        db.flush()
        add_charge(db, p.id, "consultation", a.id, f"Consultation – {doc.name} ({a.date})", doc.consult_fee)
        items, amt = [], 0
        for med, freq, days, qty in rx_for[code]:
            batch = db.query(m.Medicine).filter(m.Medicine.name == med, m.Medicine.expiry_date >= d()).order_by(m.Medicine.expiry_date).first()
            batch.stock -= qty
            amt += qty * batch.unit_price
            items.append({"medicine": med, "dosage": "1 tab", "frequency": freq, "days": days, "qty": qty, "instructions": "After food",
                          "dispensed": [{"batch_no": batch.batch_no, "expiry_date": batch.expiry_date, "qty": qty, "unit_price": batch.unit_price}]})
        rx = m.Prescription(patient_id=p.id, encounter_id=e.id, doctor_id=doc.id, items=items, status="dispensed", dispensed_at=ts(off, 13), created_at=ts(off))
        db.add(rx)
        db.flush()
        add_charge(db, p.id, "pharmacy", rx.id, f"Pharmacy – Prescription #{rx.id}", amt)
        if k % 3 == 0:
            test = rnd.choice(["Complete Blood Count", "Fasting Blood Sugar", "Lipid Profile", "HbA1c"])
            lo = m.LabOrder(patient_id=p.id, doctor_id=doc.id, encounter_id=e.id, category="lab", test_name=test, status="completed", sample_id=f"SMP-{k:04d}",
                            result="Within normal limits (synthetic)", reference_range="See lab reference", reported_by="Sanjay Kumar", reported_at=ts(off, 15), price=350, created_at=ts(off))
            db.add(lo)
            db.flush()
            add_charge(db, p.id, "lab", lo.id, f"Lab – {test}", lo.price)
        db.flush()
        if k % 5 != 4:  # most visits billed
            inv = generate_invoice({"patient_id": p.id, "tax_pct": 0}, db, SYS)
            db.query(m.Invoice).filter_by(id=inv["id"]).update({"created_at": ts(off, 14)})
            if k % 4 != 3:
                full = k % 6 != 1
                pay(inv["id"], {"amount": inv["balance"] if full else round(inv["balance"] / 2), "mode": rnd.choice(["cash", "upi", "card"])}, db, SYS)
                db.query(m.Payment).filter_by(invoice_id=inv["id"]).update({"created_at": ts(off, 15)})
    db.commit()

    # ---- today & tomorrow (via workflow rules: tokens, notifications) ----
    from .crud import create_record, update_record
    statuses = ["completed", "in-consultation", "checked-in", "checked-in", "checked-in", "booked", "booked"]
    for i, st in enumerate(statuses):
        a = create_record(db, "appointments", {"patient_id": pts[i + 1].id, "doctor_id": ananya.id, "date": d(), "time": f"{9 + i // 2:02d}:{'00' if i % 2 == 0 else '30'}",
                                               "reason": rnd.choice(["Fever and cough", "Diabetes review", "BP check", "General check-up"])}, SYS)
        for step in ["checked-in", "in-consultation", "completed"][: ["booked", "checked-in", "in-consultation", "completed"].index(st)]:
            update_record(db, "appointments", a.id, {"status": step}, SYS)
    for i in range(3):
        create_record(db, "appointments", {"patient_id": pts[9 + i].id, "doctor_id": kavya.id, "date": d(), "time": f"{16 + i}:00", "reason": "Consultation",
                                           "type": "tele" if i == 0 else "in-person"}, SYS)
    create_record(db, "appointments", {"patient_id": pts[0].id, "doctor_id": ananya.id, "date": d(1), "time": "10:00", "reason": "Follow-up visit"}, SYS)
    create_record(db, "appointments", {"patient_id": pts[0].id, "doctor_id": kavya.id, "date": d(2), "time": "17:00", "reason": "Teleconsultation review", "type": "tele"}, SYS)
    create_record(db, "appointments", {"patient_id": pts[12].id, "doctor_id": ananya.id, "date": d(1), "time": "11:00", "reason": "Lab review"}, SYS)

    # pending diagnostics & prescriptions
    for pi, test in [(2, "Complete Blood Count"), (3, "Dengue NS1"), (6, "Lipid Profile")]:
        create_record(db, "lab-orders", {"patient_id": pts[pi].id, "doctor_id": ananya.id, "category": "lab", "test_name": test}, SYS)
    o = db.query(m.LabOrder).filter_by(test_name="Dengue NS1").first()
    update_record(db, "lab-orders", o.id, {"status": "sample-collected"}, SYS)
    for pi, test in [(4, "X-ray Chest PA"), (7, "MRI Lumbar Spine")]:
        create_record(db, "lab-orders", {"patient_id": pts[pi].id, "doctor_id": ananya.id, "category": "radiology", "test_name": test}, SYS)
    create_record(db, "prescriptions", {"patient_id": pts[1].id, "doctor_id": ananya.id, "items": [
        {"medicine": "Paracetamol 500mg", "dosage": "1 tab", "frequency": "1-0-1", "days": 5, "qty": 10, "instructions": "After food"},
        {"medicine": "Cetirizine 10mg", "dosage": "1 tab", "frequency": "0-0-1", "days": 5, "qty": 5, "instructions": "At bedtime"}]}, SYS)

    # admissions
    for pi, bi, off, reason in [(4, 0, -3, "Community acquired pneumonia – observation"), (7, 9, -1, "Uncontrolled diabetes"), (10, 16, -2, "Chest pain evaluation")]:
        a = create_record(db, "admissions", {"patient_id": pts[pi].id, "doctor_id": (vikram if bi == 16 else ananya).id, "bed_id": beds[bi].id, "reason": reason}, SYS)
        a.admit_date = d(off)
    db.commit()
    beds[3].status, beds[13].status = "cleaning", "maintenance"

    # expenses
    for off, cat, desc, amt in [(-13, "Salaries", "Nursing staff – fortnight", 9200), (-12, "Utilities", "Electricity", 3400), (-10, "Consumables", "Gloves, syringes", 1850),
                                (-8, "Maintenance", "Biomedical equipment AMC", 2600), (-6, "Utilities", "Water & internet", 950), (-4, "Consumables", "Lab reagents", 2240),
                                (-3, "Housekeeping", "Outsourced cleaning", 1500), (-1, "Marketing", "Health camp banners", 600)]:
        db.add(m.Expense(category=cat, description=desc, amount=amt, date=d(off), vendor="Demo Vendor"))
    # duties
    for off in (0, 1):
        for i, n in enumerate(nurses):
            db.add(m.Duty(staff_id=n.id, date=d(off), shift=["Morning", "Evening", "Night"][(i + off) % 3], area=["General Ward A", "ICU", "OPD"][i]))
        for i, doc in enumerate(doctors):
            db.add(m.Duty(staff_id=doc.id, date=d(off), shift="Morning" if i % 2 == 0 else "Evening", area="OPD"))
    # engagement
    comments = ["Doctor explained clearly", "Waiting time was long", "Clean and well organised", "Billing was quick", "Friendly nursing staff", "Pharmacy queue slow"]
    for i in range(18):
        db.add(m.Feedback(patient_id=rnd.choice(pts).id, rating=rnd.choice([5, 5, 4, 4, 4, 3, 5, 2]), category=rnd.choice(["Doctor", "Nursing", "Billing", "Facilities", "Pharmacy"]),
                          comment=rnd.choice(comments), created_at=ts(-rnd.randint(0, 14))))
    for i, (subj, st, pr) in enumerate([("Long waiting time at OPD", "open", "high"), ("Incorrect bill amount", "in-progress", "medium"),
                                        ("Parking unavailable", "resolved", "low"), ("Report delayed", "open", "medium")]):
        create_record(db, "complaints", {"patient_id": pts[i + 2].id, "subject": subj, "description": "Synthetic complaint for demo.", "priority": pr, "category": "Service"}, SYS)
        c = db.query(m.Complaint).order_by(m.Complaint.id.desc()).first()
        c.status = st
        if st == "resolved":
            c.resolution = "Additional parking arranged at the rear entrance."
    db.add_all([m.Campaign(name="World Diabetes Day screening", channel="WhatsApp", audience="all", message="Hi {name}, free blood sugar screening on 14 Nov at TEC THA. Reply YES to book.", scheduled_date=d(10)),
                m.Campaign(name="Senior flu vaccination drive", channel="SMS", audience="seniors", message="Dear {name}, flu vaccination for seniors is now available at TEC THA.", scheduled_date=d(3)),
                m.Campaign(name="Women's wellness week", channel="WhatsApp", audience="female", message="Hi {name}, book your wellness check-up this week at 20% off.", scheduled_date=d(-5), status="sent", sent_count=7)])
    db.commit()
