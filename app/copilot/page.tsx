"use client";
import { useEffect } from "react";
export default function CopilotPage() {
  useEffect(() => {
    const current = new URL(window.location.href);
    const target = new URL("/", current.origin);
    target.searchParams.set("copilot", "1");
    const caseId = current.searchParams.get("case");
    if (caseId) target.searchParams.set("case", caseId);
    window.location.replace(target.toString());
  }, []);
  return <main className="copilotRedirect" role="status">Opening Copilot beside your CRM workspace…</main>;
}
