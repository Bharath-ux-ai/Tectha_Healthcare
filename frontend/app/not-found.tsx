"use client";
import Link from "next/link";
import { ArrowLeft, Home, Pill } from "lucide-react";
import { Button } from "@/components/ui";
import { Logo } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="max-w-md rounded-xl border border-line bg-white p-8 shadow-sm">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Pill className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Page Not Found</h1>
        <p className="mt-2 text-sm text-muted">
          The requested page could not be found or you may not have permission to view it.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/dashboard">
            <Button className="w-full sm:w-auto">
              <Home className="size-4" /> Go to Dashboard
            </Button>
          </Link>
          <Link href="/pharmacy">
            <Button variant="secondary" className="w-full sm:w-auto">
              <Pill className="size-4" /> Pharmacy
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

