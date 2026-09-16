"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Connection = { email: string; gmail: boolean; calendar: boolean; oauthConfigured: boolean };
export default function MobileWorkspace() {
  const [state, setState] = useState<"checking" | "signin" | "wrong" | "ready" | "error">("checking");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const requestedProfile = params.get("profile");
        if (requestedProfile && /^[0-9a-f-]{36}$/i.test(requestedProfile)) {
          sessionStorage.setItem("maximus-workspace-return", requestedProfile);
          history.replaceState(null, "", window.location.pathname);
        }
        const expected = sessionStorage.getItem("maximus-workspace-return");
        if (!expected) throw new Error("Open Connect Gmail & Calendar from the Maximus mobile app to continue.");
        const response = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
        const session = await response.json();
        if (response.status === 401) { setState("signin"); return; }
        if (!response.ok) throw new Error(session.error || "Your account could not be checked.");
        if (session.identity?.profileId !== expected) { setState("wrong"); return; }
        if (session.identity.role === "client") throw new Error("Google Workspace connections are available to staff only.");
        const result = await fetch("/api/crm/workspace-connection", { cache: "no-store", signal: controller.signal });
        const body = await result.json();
        if (!result.ok) throw new Error(body.error || "Connection status could not be checked.");
        setConnection(body); setState("ready");
        setError(new URLSearchParams(location.search).get("workspace_error") || "");
      } catch (reason) {
        if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Please try again."); setState("error"); }
      }
    })();
    return () => controller.abort();
  }, []);
  return <main className="googleCallback"><section className="accountSetupCard">
    <strong>MAXIMUS CRM</strong><h1>Connect your Google Workspace</h1>
    <p>Google asks for permission in your phone’s browser. Your mailbox and calendar will then be available in the Maximus app.</p>
    {state === "checking" && <p role="status">Checking your account…</p>}
    {state === "signin" && <><p>Sign in with the same CRM account you use in the app.</p><Link className="primaryButton" href="/">Sign in to Maximus</Link></>}
    {state === "wrong" && <><p>This browser is signed in to a different Maximus account.</p><button className="primaryButton" onClick={async () => {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) location.assign("/"); else setError("Sign-out failed. Please try again.");
    }}>Switch account</button></>}
    {state === "ready" && connection && <><p><strong>{connection.email}</strong></p>
      <p>Gmail: {connection.gmail ? "Connected" : "Not connected"}<br />Calendar: {connection.calendar ? "Connected" : "Not connected"}</p>
      {connection.oauthConfigured && <a className="primaryButton" href="/api/auth/gmail/start?workspace=1">{connection.gmail && connection.calendar ? "Reconnect Google" : "Continue to Google"}</a>}
      {!connection.oauthConfigured && <p>Your administrator needs to enable the Google Workspace connection.</p>}
    </>}
    {error && <p role="alert" className="caseWorkError">{error}</p>}
    <p><a href="au.com.maximuseducation.crm://workspace/complete" onClick={() => sessionStorage.removeItem("maximus-workspace-return")}>Return to the Maximus app</a></p>
  </section></main>;
}
