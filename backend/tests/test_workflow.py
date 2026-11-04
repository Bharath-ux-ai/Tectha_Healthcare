"""End-to-end API test of the patient-to-billing workflow.
Run with the backend up:  python tests/test_workflow.py  (API_URL defaults to http://localhost:8000)"""
import os
import sys
from datetime import date

import httpx

API = os.getenv("API_URL", "http://localhost:8000")
c = httpx.Client(base_url=API, timeout=20)
ok = 0


def login(u, p):
    r = c.post("/api/auth/login", json={"username": u, "password": p})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def call(method, path, h, expect=200, **kw):
    global ok
    r = c.request(method, path, headers=h, **kw)
    if r.status_code != expect:
        print(f"FAIL {method} {path} -> {r.status_code} {r.text[:300]}")
        sys.exit(1)
    ok += 1
    return r.json()


today = date.today().isoformat()
rec, doc, lab, ph, acc = (login("reception", "reception123"), login("doctor", "doctor123"), login("lab", "lab123"),
                          login("pharmacy", "pharmacy123"), login("accounts", "accounts123"))

# 1-2 register patient -> UHID
p = call("POST", "/api/r/patients", rec, 201, json={"name": "Test Patient Workflow", "dob": "1990-05-10", "gender": "Female", "phone": "+91 90000 55555"})
assert p["uhid"].startswith("TTH-"), p
print("UHID", p["uhid"])
# validation
call("POST", "/api/r/patients", rec, 422, json={"name": "No Phone", "dob": "1990-01-01", "gender": "Male"})
# 3-5 doctor availability + booking + token
docs = call("GET", "/api/doctors", rec)
ananya = next(x for x in docs if x["name"] == "Dr. Ananya Raman")
slots = call("GET", f"/api/doctors/{ananya['id']}/slots?d={today}", rec)
free = next(s["time"] for s in slots["slots"] if s["available"])
appt = call("POST", "/api/r/appointments", rec, 201, json={"patient_id": p["id"], "doctor_id": ananya["id"], "date": today, "time": free, "reason": "Fever"})
assert appt["token"] >= 1
call("POST", "/api/r/appointments", rec, 409, json={"patient_id": p["id"], "doctor_id": ananya["id"], "date": today, "time": free})  # double booking
# reschedule + check-in
nxt = next(s["time"] for s in call("GET", f"/api/doctors/{ananya['id']}/slots?d={today}", rec)["slots"] if s["available"])
call("PATCH", f"/api/r/appointments/{appt['id']}", rec, json={"time": nxt})
call("PATCH", f"/api/r/appointments/{appt['id']}", rec, json={"status": "checked-in"})
q = call("GET", f"/api/queue?d={today}", rec)
assert any(i["id"] == appt["id"] for dq in q["doctors"] for i in dq["items"])
# 6-8 doctor: vitals, notes, prescription, lab request
call("PATCH", f"/api/r/appointments/{appt['id']}", doc, json={"status": "in-consultation"})
call("POST", "/api/r/vitals", doc, 201, json={"patient_id": p["id"], "bp": "120/80", "pulse": 82, "temperature": 100.2, "spo2": 98})
enc = call("POST", "/api/r/encounters", doc, 201, json={"patient_id": p["id"], "appointment_id": appt["id"], "complaint": "Fever 2 days",
                                                       "diagnosis": "Acute viral fever", "treatment_plan": "Rest, fluids", "follow_up_date": today})
rx = call("POST", "/api/r/prescriptions", doc, 201, json={"patient_id": p["id"], "encounter_id": enc["id"], "items": [
    {"medicine": "Paracetamol 500mg", "dosage": "1 tab", "frequency": "1-0-1", "days": 3, "qty": 6}]})
lo = call("POST", "/api/r/lab-orders", doc, 201, json={"patient_id": p["id"], "encounter_id": enc["id"], "category": "lab", "test_name": "Complete Blood Count"})
call("POST", "/api/r/prescriptions", rec, 403, json={"patient_id": p["id"], "items": [{"medicine": "x", "qty": 1}]})  # RBAC
call("PATCH", f"/api/r/appointments/{appt['id']}", doc, json={"status": "completed"})
# 9 lab result
call("PATCH", f"/api/r/lab-orders/{lo['id']}", lab, json={"status": "sample-collected"})
call("PATCH", f"/api/r/lab-orders/{lo['id']}", lab, 422, json={"status": "completed"})  # result required
done = call("PATCH", f"/api/r/lab-orders/{lo['id']}", lab, json={"status": "completed", "result": "Hb 12.8 g/dL; WBC 7,200"})
assert done["sample_id"]
# 10 pharmacy dispense
d = call("POST", f"/api/prescriptions/{rx['id']}/dispense", ph)
assert d["status"] == "dispensed" and d["items"][0]["dispensed"]
call("POST", f"/api/prescriptions/{rx['id']}/dispense", ph, 409)
# 11 billing: advance, invoice, partial, full, refund
call("POST", "/api/payments/advance", acc, json={"patient_id": p["id"], "amount": 200, "mode": "upi"})
acct = call("GET", f"/api/patients/{p['id']}/account", acc)
assert {x["source"] for x in acct["unbilled"]} >= {"consultation", "lab", "pharmacy"}, acct
inv = call("POST", "/api/invoices/generate", acc, json={"patient_id": p["id"], "discount": 50, "tax_pct": 0})
assert inv["paid"] == 200 and inv["status"] == "partial", inv
# 12 payment status
half = call("POST", f"/api/invoices/{inv['id']}/pay", acc, json={"amount": 100, "mode": "cash"})
assert half["status"] == "partial"
full = call("POST", f"/api/invoices/{inv['id']}/pay", acc, json={"amount": half["balance"], "mode": "card"})
assert full["status"] == "paid" and full["balance"] == 0
call("POST", f"/api/invoices/{inv['id']}/pay", acc, 422, json={"amount": 10})
call("POST", f"/api/invoices/{inv['id']}/refund", acc, json={"amount": 50, "reason": "Discount correction"})
# 13 notifications for this patient
notes = call("GET", f"/api/r/notifications?patient_id={p['id']}&limit=50", rec)
cats = {n["category"] for n in notes["items"]}
assert {"registration", "appointment", "follow-up", "lab", "billing"} <= cats, cats
# portal login of new patient
pp = login(p["uhid"], "Welcome@123")
me = call("GET", "/api/portal/me", pp)
assert me["invoices"] and me["prescriptions"] and me["labs"][0]["result"]
call("GET", "/api/r/patients", pp, 403)
# admissions / discharge
bed = call("GET", "/api/r/beds?status=available&limit=1", rec)["items"][0]
nurse = login("nurse", "nurse123")
adm = call("POST", "/api/r/admissions", rec, 201, json={"patient_id": p["id"], "bed_id": bed["id"], "doctor_id": ananya["id"], "reason": "Observation"})
call("POST", f"/api/admissions/{adm['id']}/discharge", nurse, json={"discharge_summary": "Afebrile, stable.", "condition_at_discharge": "Stable"})
assert call("GET", f"/api/r/beds/{bed['id']}", rec)["status"] == "cleaning"
# insurance claim on a fresh invoice (bed charge)
inv2 = call("POST", "/api/invoices/generate", acc, json={"patient_id": p["id"], "tpa_name": "Demo TPA", "policy_no": "POL-1"})
call("POST", f"/api/invoices/{inv2['id']}/claim", acc, json={"status": "approved", "approved_amount": inv2["total"]})
s = call("POST", f"/api/invoices/{inv2['id']}/claim", acc, json={"status": "settled"})
assert s["status"] == "paid"
# purchase order receive
admin = login("admin", "admin123")
sup = call("GET", "/api/r/suppliers", ph)["items"][0]
po = call("POST", "/api/r/purchase-orders", ph, 201, json={"supplier_id": sup["id"], "items": [{"name": "Salbutamol Inhaler", "qty": 30, "unit_price": 110}]})
call("POST", f"/api/purchase-orders/{po['id']}/receive", ph)
# engagement
call("POST", "/api/reminders/run", rec, json={"kind": "appointment"})
camp = call("GET", "/api/r/campaigns?status=draft", rec)["items"][0]
call("POST", f"/api/campaigns/{camp['id']}/send", rec)
for path, h in [("/api/dashboard", admin), ("/api/finance/summary", acc), ("/api/engagement/summary", rec), ("/api/pharmacy/summary", ph), ("/api/rbac", admin), ("/api/r/audit-logs", admin)]:
    call("GET", path, h)
print(f"ALL CHECKS PASSED ({ok} API calls)")
