"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/api";
import { homeFor } from "@/lib/nav";
import { Spinner } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const s = getSession();
    router.replace(s ? homeFor(s.user.role) : "/login");
  }, [router]);
  return <Spinner />;
}
