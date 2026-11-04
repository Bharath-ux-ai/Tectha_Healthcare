# TEC THA HEALTHCARE — MVP

**Six Modules. One Platform. Zero Silos.**
Next.js 16 + TypeScript + Tailwind v4 + Recharts · FastAPI + SQLAlchemy · PostgreSQL (SQLite fallback) · JWT + role-based access.

> All patient data is **synthetic**. WhatsApp/SMS, teleconsultation video and insurance/TPA are **simulated**. Not for clinical use without the production work listed below.

---

## 1. Run it (local, ~3 minutes)

Prerequisites: **Python 3.11+**, **Node.js 20+**. PostgreSQL optional.

```bash
# Terminal 1 — API (http://localhost:8000, docs at /docs)
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # then edit DATABASE_URL (or delete that line to use SQLite)
uvicorn app.main:app --port 8000

# Terminal 2 — Web app (http://localhost:3000)
cd frontend
npm install
npm run build && npm run start       # or: npm run dev
```

Open **http://localhost:3000**. The database tables and demo data are created automatically on first start.

### Using PostgreSQL
```bash
createdb -E UTF8 tecthha             # the database MUST be UTF8
# backend/.env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/tecthha
```
To reset demo data: drop/recreate the database (or delete `backend/tecthha.db` for SQLite) and restart the API.

### Docker (alternative)
```bash
docker compose up --build            # db + backend + frontend → http://localhost:3000
```
*(The compose file was written but not built in the development sandbox — see "Tested" below.)*

## 2. Test it
```bash
# with the API running:
cd backend && python tests/test_workflow.py
# → ALL CHECKS PASSED (51 API calls)
```
The test drives the full patient-to-billing flow plus RBAC denials, validation errors, double-booking, discharge, TPA settlement, purchase-order receipt, reminders and campaigns.

## 3. Demo logins

| Role | Username | Password | Lands on |
|---|---|---|---|
| Administrator | `admin` | `admin123` | Dashboard (all modules) |
| Doctor (GM) | `doctor` | `doctor123` | Dashboard → Doctor Desk |
| Doctor (Cardiology) | `cardio` | `doctor123` | |
| Nurse | `nurse` | `nurse123` | |
| Front desk | `reception` | `reception123` | |
| Lab technician | `lab` | `lab123` | Lab & Radiology |
| Pharmacist | `pharmacy` | `pharmacy123` | Pharmacy |
| Accounts | `accounts` | `accounts123` | Billing & Finance |
| Patient (portal) | `patient` | `patient123` | My Health Portal |

Every newly registered patient also gets a portal login: **username = UHID** (e.g. `TTH-2026-00015`), password **`Welcome@123`**.

## 4. 5-minute demo script (the integrated workflow)
1. `reception` → **Patients → Register patient** → UHID generated, opens 360° record.
2. **Book appointment** → choose Dr. Ananya Raman → pick a free slot → token issued, WhatsApp confirmation logged.
3. **Appointments & Queue** → **Check in**.
4. `doctor` → **Doctor Desk** → **Start consult** → **Clinical note** → **e-Rx** (allergy alert shown if relevant) → **Order test** → **Complete visit** (consultation charge + follow-up message posted).
5. `lab` → **Lab & Radiology** → Collect sample → Start processing → **Enter result** → Finalise (patient SMS logged).
6. `pharmacy` → **Dispensing queue** → **Dispense all (FEFO)** (stock deducted from earliest-expiring batch).
7. `accounts` → **Billing & Finance** → select patient → charges from consult + lab + pharmacy appear → **Generate invoice** → **Record payment** (partial or full).
8. Log in as the new patient (UHID / `Welcome@123`) → portal shows report, prescription, bill and all messages.

## 5. What's in each module

| Module | Implemented (working, persisted) |
|---|---|
| **1 Patient Experience** | Registration with validation, UHID, profile edit, booking against live slots, reschedule, cancel (with confirm), double-booking prevention, doctor availability board, token queue with "call next", waiting position & est. wait, patient portal (history, Rx, reports, bills, messages, book/reschedule/cancel, feedback, complaints), teleconsult demo |
| **2 Clinical Care** | Doctor desk, EMR timeline, vitals (abnormal highlighting), allergies, clinical notes, diagnosis + ICD code, treatment plan, follow-up date, e-prescriptions (doctor-authored only, allergy alert), lab/radiology ordering and viewing, discharge summary (printable) |
| **3 Hospital Operations** | Ops dashboard, OPD workflow status, IPD admissions with bed allocation, discharge with automatic bed charges, bed board (cleaning / maintenance), staff & doctor/nurse CRUD incl. consulting hours, departments, duty roster, branches (all key tables carry `branch_id`), user management, API-enforced RBAC matrix, audit log |
| **4 Financial** | Auto-posted charges, invoice generation (discount/tax), advance deposits auto-adjusted, partial payments, status & outstanding, refunds (reason required), TPA claim lifecycle, payments ledger, expenses CRUD, reports + CSV export |
| **5 Diagnostics & Pharmacy** | Lab worklist with sample IDs & status flow, result entry, radiology (X-ray/CT/MRI/USG) report entry, printable reports, prescription-linked dispensing (FEFO, expired batches blocked, all-or-nothing on shortage), inventory by batch & expiry, low-stock / expiry alerts, write-off, suppliers, purchase orders → receive into stock (creates batches + expense) |
| **6 Engagement** | Message log (WhatsApp/SMS/Email), compose, appointment / follow-up / birthday / senior-wellness reminder runs, feedback, complaints with tickets & resolution notice, campaigns with audience targeting, satisfaction & retention dashboard |

### Feature checklist
- **Implemented & tested** (automated API test + headless-browser click-through on PostgreSQL 16 and SQLite): all items above; the 13-step workflow; every page and tab for all 8 roles loads without errors; mobile (390 px) layout has no horizontal overflow; production build passes TypeScript.
- **Demo only (simulated)**: WhatsApp/SMS/Email delivery (logged with status `simulated-sent`), teleconsult video room, insurance/TPA adjudication, scheduled reminder jobs (run manually).
- **Not tested**: Docker images/compose (no Docker daemon in the build sandbox); printing on physical printers; browsers other than Chrome.
- **Pending (production)**: see limitations.

## 6. Known limitations / production requirements
- **Security**: JWT stored in browser localStorage, no refresh tokens, no password-reset or MFA, no rate limiting. Set a strong `JWT_SECRET`. Needs security review, penetration test, HTTPS.
- **Compliance**: audit log exists but isn't tamper-proof; no consent management, data-retention or encryption-at-rest policy. Requires DPDP Act 2023 (India) / HIPAA-equivalent review before real data.
- **Clinical safety**: allergy alert is a simple name match, not a drug-interaction database. No AI diagnosis or automated prescribing — clinicians enter everything.
- **Integrations to build**: WhatsApp Business API / SMS gateway, video provider, payment gateway, insurer/TPA APIs, PACS/DICOM, lab analyser (HL7/ASTM), ABDM/ABHA.
- **Data model**: dates stored as ISO strings; logical (not enforced) foreign keys; no migrations tool yet (add Alembic); branch scoping is schema-ready but not filtered in the UI.
- **UI components**: shadcn/ui-style primitives are implemented locally in `components/ui.tsx` (the shadcn CLI registry wasn't reachable during the build); they can be swapped for generated shadcn components later.
- Timestamps are stored in UTC; "today" uses the server's local date — run the API in the hospital's time zone.

## 7. Project layout
```
backend/app/
  models.py     shared data model (26 tables, all six modules)
  crud.py       generic permission-aware REST: /api/r/{resource} (search, filter, sort, paginate)
  services.py   cross-module workflows (UHID, slots, tokens, charges, dispensing, billing, claims, reminders, portal)
  seed.py       synthetic demo data built through the same workflows
  auth.py       PBKDF2 passwords, JWT, role guards
frontend/
  app/(app)/    dashboard, patients, appointments, clinical, operations, finance, diagnostics, pharmacy, engagement, portal
  components/   ui.tsx (primitives), data.tsx (DataTable/FormModal/CrudSection), booking, clinical, charts
```
#   T e c t h a _ H e a l t h c a r e  
 