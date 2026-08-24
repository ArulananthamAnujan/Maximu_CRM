"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Supabase completes the Google OAuth exchange and redirects here with the
 * session in the URL fragment, which never reaches a server on its own --
 * that is the whole point of the implicit flow. This page's only job is to
 * read it client-side and hand it to /api/auth/google/callback, which turns
 * it into the same httpOnly cookies a password sign-in sets.
 */
export default function GoogleCallbackPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const oauthError = params.get("error_description") || params.get("error");
      if (oauthError) {
        setError(oauthError);
        return;
      }
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        setError("Google did not return a session. Try signing in again.");
        return;
      }
      try {
        const response = await fetch("/api/auth/google/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: Number(params.get("expires_in")) || undefined,
            token_type: params.get("token_type") || undefined,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(result.error || "Google sign-in could not be completed.");
          return;
        }
        window.location.replace("/");
      } catch {
        setError("Google sign-in could not be completed.");
      }
    })();
  }, []);

  return (
    <main className="googleCallback">
      {error ? (
        <>
          <p>{error}</p>
          <Link href="/">Back to sign-in</Link>
        </>
      ) : (
        <p>Signing you in with Google…</p>
      )}
    </main>
  );
}
