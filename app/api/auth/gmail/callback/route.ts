import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { cookie, isSecureRequest, readCookie, supabaseRequest } from "@/server/supabase";
import { gmailAccountEmail, gmailExchangeCode, GMAIL_SCOPE } from "@/server/gmail";
import { protect } from "@/server/protected-fields";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "maximus_gmail_state";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirect = (message = "") => {
    const target = new URL("/", url.origin);
    target.searchParams.set("gmail", message ? "error" : "connected");
    if (message) target.searchParams.set("workspace_error", message);
    const headers = new Headers({ Location: target.toString() });
    headers.append("Set-Cookie", cookie(STATE_COOKIE, "", 0, isSecureRequest(request)));
    return new Response(null, { status: 302, headers });
  };
  try {
    const session = await liveSession(request);
    const respond = (message = "") => appendRefreshCookies(redirect(message), session.refreshed, request);
    if (session.identity.role === "client") return respond("Google workspace is available to staff only.");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = readCookie(request, STATE_COOKIE);
    if (!state || !expected || state !== expected || !state.startsWith(`${session.identity.profileId}.`)) return respond("The Google connection request expired. Please connect again.");
    if (!code || url.searchParams.has("error")) return respond("Google connection was not completed. You can continue using the CRM and connect later.");
    const workspace = state.split(".")[1] === "workspace";
    const tokens = await gmailExchangeCode({ code, redirectUri: `${url.origin}/api/auth/gmail/callback` });
    const email = await gmailAccountEmail(tokens.access_token);
    if (email.trim().toLowerCase() !== session.identity.email.trim().toLowerCase()) return respond("Choose the Google account matching your CRM sign-in email. Your existing connections were not changed.");
    if (!tokens.refresh_token) return respond("Google did not provide continuing access. Please reconnect and approve the requested permissions.");
    const scopes = new Set((tokens.scope ?? "").split(/\s+/));
    const gmailGranted = GMAIL_SCOPE.split(" ").filter(scope => !scope.endsWith("userinfo.email")).every(scope => scopes.has(scope));
    const calendarGranted = scopes.has("https://www.googleapis.com/auth/calendar.events");
    const providers = [...(gmailGranted ? ["gmail"] : []), ...(workspace && calendarGranted ? ["google_calendar"] : [])];
    if (!providers.length) return respond("No Gmail or Calendar permissions were granted. Please connect again and approve the services you need.");
    const tokenReference = await protect(tokens.refresh_token);
    // Each provider row stays owned by the authenticated profile. Never use
    // an admin token to attach a mailbox using only a supplied email address.
    for (const provider of providers) {
      const existing = await supabaseRequest<{ id: string }[]>(`/rest/v1/mailbox_connections?select=id&profile_id=eq.${session.identity.profileId}&provider=eq.${provider}&limit=1`, { method: "GET" }, session.accessToken);
      await supabaseRequest(existing[0] ? `/rest/v1/mailbox_connections?id=eq.${existing[0].id}&profile_id=eq.${session.identity.profileId}` : "/rest/v1/mailbox_connections", {
        method: existing[0] ? "PATCH" : "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ ...(existing[0] ? {} : { id: crypto.randomUUID(), organisation_id: session.identity.organisationId, profile_id: session.identity.profileId, provider, connection_type: "personal" }), email, token_reference: tokenReference, active: true }),
      }, session.accessToken);
    }
    if (!gmailGranted || (workspace && !calendarGranted)) return respond(`Connected ${providers.join(" and ").replace("google_calendar", "Calendar")}. Reconnect to approve the remaining Google permissions.`);
    return respond();
  } catch {
    return redirect("Your Google connection could not be completed. Please reconnect; your CRM account remains available.");
  }
}
