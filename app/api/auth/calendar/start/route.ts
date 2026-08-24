import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { cookie, isSecureRequest } from "@/server/supabase";
import { calendarAuthorizeUrl } from "@/server/google-calendar";
import { googleOAuthConfigured } from "@/server/google-oauth-client";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "maximus_calendar_state";

/**
 * Connecting a member of staff's own Google Calendar, so an appointment
 * scheduled in this CRM can be pushed onto it. Staff only, and separate from
 * the Gmail connection -- someone can turn one on without the other, even
 * though both go through the same Google Cloud OAuth client.
 */
export async function GET(request: Request) {
  const home = () => Response.redirect(new URL("/", request.url).toString(), 302);
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      return appendRefreshCookies(home(), session.refreshed, request);
    if (!googleOAuthConfigured())
      return appendRefreshCookies(home(), session.refreshed, request);

    const origin = new URL(request.url).origin;
    const state = crypto.randomUUID();
    const authorize = calendarAuthorizeUrl({
      redirectUri: `${origin}/api/auth/calendar/callback`,
      state,
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
