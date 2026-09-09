"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CopilotPanel } from "../copilot-panel";
export default function CopilotPage() {
  const [state, setState] = useState<{ ready: boolean; error: string; caseId: string }>({ ready: false, error: "", caseId: "" });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok || !body.authenticated) throw new Error(body.error || "Sign in to use Copilot.");
      if (body.identity.role === "client") throw new Error("Copilot is available to staff only.");
      if (!controller.signal.aborted) setState({ ready: true, error: "", caseId: new URLSearchParams(window.location.search).get("case") || "" });
    }).catch(error => { if (!controller.signal.aborted) setState({ ready: false, error: error.message, caseId: "" }); });
    return () => controller.abort();
  }, []);
  if (!state.ready) return <main className="copilotStandalone"><p role="status">{state.error || "Opening your Copilot workspace…"}</p>{state.error && <Link href="/">Back to CRM sign-in</Link>}</main>;
  return <CopilotPanel initialCaseId={state.caseId} standalone />;
}
