import { CalendarClock, FlaskConical, HeartHandshake, LayoutDashboard, Pill, Stethoscope, UserRound, Users, Wallet, Building2 } from "lucide-react";
import type { Role } from "./api";

export type NavItem = { href: string; label: string; icon: any; roles: Role[]; module?: string };

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "doctor", "nurse", "receptionist", "lab", "pharmacist", "accountant"] },
  { href: "/patients", label: "Patients", icon: Users, roles: ["admin", "doctor", "nurse", "receptionist"], module: "Patient Experience" },
  { href: "/appointments", label: "Appointments & Queue", icon: CalendarClock, roles: ["admin", "doctor", "nurse", "receptionist"], module: "Patient Experience" },
  { href: "/clinical", label: "Doctor Desk & EMR", icon: Stethoscope, roles: ["admin", "doctor", "nurse"], module: "Clinical Care" },
  { href: "/operations", label: "Hospital Operations", icon: Building2, roles: ["admin", "doctor", "nurse", "receptionist"], module: "Hospital Operations" },
  { href: "/finance", label: "Billing & Finance", icon: Wallet, roles: ["admin", "accountant", "receptionist"], module: "Financial Management" },
  { href: "/diagnostics", label: "Lab & Radiology", icon: FlaskConical, roles: ["admin", "lab", "doctor"], module: "Diagnostics & Pharmacy" },
  { href: "/pharmacy", label: "Pharmacy", icon: Pill, roles: ["admin", "pharmacist", "doctor", "nurse", "receptionist", "accountant"], module: "Diagnostics & Pharmacy" },
  { href: "/engagement", label: "Patient Engagement", icon: HeartHandshake, roles: ["admin", "receptionist"], module: "Patient Engagement" },
  { href: "/portal", label: "My Health Portal", icon: UserRound, roles: ["patient"], module: "Patient Portal" },
];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrator", doctor: "Doctor", nurse: "Nurse", receptionist: "Front Desk", lab: "Lab Technician",
  pharmacist: "Pharmacist", accountant: "Accounts", patient: "Patient",
};

export const homeFor = (role: Role) => (role === "patient" ? "/portal" : role === "lab" ? "/diagnostics" : role === "pharmacist" ? "/pharmacy" : "/dashboard");
export const allowed = (role: Role, path: string) => NAV.some((n) => path.startsWith(n.href) && n.roles.includes(role));
