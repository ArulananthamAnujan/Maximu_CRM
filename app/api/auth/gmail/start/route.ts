import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { cookie, isSecureRequest, supabaseRequest } from "@/server/supabase";
import { gmailAuthorizeUrl, gmailOAuthConfigured } from "@/server/gmail";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "maximus_gmail_state";

/** Reuse saved personal connections after sign-in, or request Google consent
 * for Gmail and Calendar together. The state is bound to the CRM profile.
 */
export async function GET(request: Request) {
  const home = () => Response.redirect(new URL("/", request.url).toString(), 302);
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      return appendRefreshCookies(home(), session.refreshed, request);
    if (!gmailOAuthConfigured())
      return appendRefreshCookies(home(), session.refreshed, request);

    const origin = new URL(request.url).origin;
    const params = new URL(request.url).searchParams;
    const workspace = params.get("workspace") === "1";
    if (workspace && params.get("auto") === "1") {
      const rows = await supabaseRequest<{ provider: string; email: string; active: boolean; token_reference: string | null }[]>(`/rest/v1/mailbox_connections?select=provider,email,active,token_reference&profile_id=eq.${session.identity.profileId}&provider=in.(gmail,google_calendar)`, { method: "GET" }, session.accessToken);
      const ready = ["gmail", "google_calendar"].every(provider => rows.some(row => row.provider === provider && row.active && row.token_reference && row.email.toLowerCase() === session.identity.email.toLowerCase()));
      if (ready) return appendRefreshCookies(home(), session.refreshed, request);
    }
    const state = `${session.identity.profileId}.${workspace ? "workspace" : "gmail"}.${crypto.randomUUID()}`;
    const authorize = gmailAuthorizeUrl({
      redirectUri: `${origin}/api/auth/gmail/callback`,
      state,
      workspace,
      loginHint: session.identity.email,
    });
    const headers = new Headers({ Location: authorize });
    headers.append(
      "Set-Cookie",
      cookie(STATE_COOKIE, state, 600, isSecureRequest(request)),
    );
    return appendRefreshCookies(
      new Response(null, { status: 302, headers }),
      session.refreshed,
      request,
    );
  } catch {
    return home();
  }
}
