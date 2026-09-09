"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

export default function GoogleCallbackPage() {
  const started = useRef(false);
  const continueTo = useRef("/");
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const requestedSetup = new URLSearchParams(window.location.search).get("setup") === "1";
      window.history.replaceState(null, "", window.location.pathname);
      const authError = params.get("error_description") || params.get("error");
      if (authError) { setError(authError); return; }
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError("This sign-in link is missing or expired. Ask your Maximus team to resend your account email.");
        return;
      }
      try {
        const response = await fetch("/api/auth/google/callback", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken,
            expires_in: Number(params.get("expires_in")) || undefined, token_type: params.get("token_type") || undefined }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) { setError(result.error || "Your sign-in could not be completed."); return; }
        continueTo.current = result.next === "/api/auth/gmail/start?workspace=1&auto=1" ? result.next : "/";
        if (requestedSetup || ["recovery", "invite"].includes(params.get("type") || "")) setSetup(true);
        else window.location.replace(continueTo.current);
      } catch { setError("Your sign-in could not be completed. Please try again."); }
    })();
  }, []);

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") || "");
    if (password !== data.get("confirmation")) { setError("The passwords do not match."); return; }
    if (password.length < 12 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      setError("Use at least 12 characters including a letter and a number."); return;
    }
    setWorking(true); setError("");
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Your password could not be saved.");
      window.location.replace(continueTo.current);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Please try again."); }
    finally { setWorking(false); }
  };

  return <main className="googleCallback"><section className="accountSetupCard">
    <strong>Maximus CRM</strong>
    <h1>{setup ? "Create your password" : error ? "Check your sign-in link" : "Verifying your account…"}</h1>
    {setup && <><p>Choose a password to access your Maximus workspace.</p>
      <form onSubmit={savePassword}>
        <label>New password<input type="password" name="password" required minLength={12} maxLength={256} autoComplete="new-password" /></label>
        <label>Confirm password<input type="password" name="confirmation" required minLength={12} maxLength={256} autoComplete="new-password" /></label>
        <p>At least 12 characters, including a letter and a number.</p>
        <button className="primaryButton" disabled={working}>{working ? "Saving…" : "Save password and continue"}</button>
      </form></>}
    {error && <p className="caseWorkError" role="alert">{error}</p>}
    {error && !setup && <Link href="/">Back to sign-in</Link>}
  </section></main>;
}
