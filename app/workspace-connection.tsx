"use client";
import {useFunctionAccess} from "./function-access-context";
import { useEffect, useState } from "react";
type Status = { email: string; gmail: boolean; calendar: boolean; drive: boolean; ai: boolean; oauthConfigured: boolean };
export function WorkspaceConnection() {
  const allowed=useFunctionAccess(),messagesEnabled=allowed("communications"),calendarEnabled=allowed("calendar");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if(!messagesEnabled&&!calendarEnabled)return;
    const controller = new AbortController();
    void fetch("/api/crm/workspace-connection", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      if (!controller.signal.aborted) { setStatus(body); const message = new URLSearchParams(window.location.search).get("workspace_error"); if (message) setError(message); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message || "Connections could not be checked."); });
    return () => controller.abort();
  }, [messagesEnabled,calendarEnabled]);
  if(!messagesEnabled&&!calendarEnabled)return null;
  return <div className="workspaceConnection" aria-label="Your workspace connections"><div><strong>{status?.email || "Your workspace"}</strong><span>{status ? `Gmail: ${status.gmail ? "connected" : "connect required"} · Calendar: ${status.calendar ? "connected" : "connect required"} · Shared Drive: ${status.drive ? "configured" : "setup required"} · Copilot: ${status.ai ? "configured" : "setup required"}` : error ? "Connection status unavailable" : "Checking connections…"}</span>{error && <p role="alert">{error}</p>}</div>{status?.oauthConfigured && <a href={messagesEnabled?(calendarEnabled?"/api/auth/gmail/start?workspace=1":"/api/auth/gmail/start"):"/api/auth/calendar/start"}>{messagesEnabled?(calendarEnabled?"Connect Gmail & Calendar":"Connect Gmail"):"Connect Calendar"}</a>}</div>;
}
