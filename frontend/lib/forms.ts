import type { FieldDef } from "@/components/data";

export const PATIENT_FIELDS: FieldDef[] = [
  { name: "name", label: "Full name", required: true, span: 2 },
  { name: "dob", label: "Date of birth", type: "date", required: true },
  { name: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"], required: true },
  { name: "phone", label: "Mobile", type: "tel", required: true, placeholder: "+91 9xxxx xxxxx" },
  { name: "email", label: "Email", type: "email" },
  { name: "blood_group", label: "Blood group", type: "select", options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
  { name: "emergency_contact", label: "Emergency contact" },
  { name: "address", label: "Address", span: 2 },
  { name: "insurance_provider", label: "Insurance provider" },
  { name: "policy_no", label: "Policy number" },
];

export const VITAL_FIELDS: FieldDef[] = [
  { name: "bp", label: "Blood pressure (mmHg)", placeholder: "120/80" },
  { name: "pulse", label: "Pulse (bpm)", type: "number", min: 20, max: 250 },
  { name: "temperature", label: "Temperature (°F)", type: "number", min: 90, max: 110 },
  { name: "spo2", label: "SpO₂ (%)", type: "number", min: 50, max: 100 },
  { name: "weight", label: "Weight (kg)", type: "number", min: 0.5, max: 300 },
  { name: "height", label: "Height (cm)", type: "number", min: 30, max: 250 },
];

export const ALLERGY_FIELDS: FieldDef[] = [
  { name: "allergen", label: "Allergen", required: true },
  { name: "severity", label: "Severity", type: "select", options: ["mild", "moderate", "severe"], required: true },
  { name: "reaction", label: "Reaction", span: 2 },
];

export const ENCOUNTER_FIELDS: FieldDef[] = [
  { name: "complaint", label: "Chief complaint", required: true, span: 2 },
  { name: "notes", label: "Clinical notes / examination", type: "textarea" },
  { name: "diagnosis", label: "Diagnosis (doctor's assessment)", required: true },
  { name: "icd_code", label: "ICD-10 code", placeholder: "e.g. J02.9" },
  { name: "treatment_plan", label: "Treatment plan", type: "textarea" },
  { name: "follow_up_date", label: "Follow-up date", type: "date" },
];

export const STATUS_APPT = ["booked", "checked-in", "in-consultation", "completed", "cancelled", "no-show"];
