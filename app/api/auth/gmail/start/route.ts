import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { cookie, isSecureRequest } from "@/server/supabase";
import { gmailAuthorizeUrl, gmailOAuthConfigured } from "@/server/gmail";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "maximus_gmail_state";

/**
 * Connecting a member of staff's own Gmail account for sending case-linked
 * mail. This is separate from Google sign-in: it needs its own OAuth client
 * (a web client with gmail.send access, not the sign-in client) because a
 * refresh token has to be kept afterwards, which sign-in never needs.
 *
 * The redirect carries a random state, set as a short-lived cookie here and
 * checked against the same value on the callback, so the code exchange
 * cannot be forged by a request that never went through this page.
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
    const state = crypto.randomUUID();
    const authorize = gmailAuthorizeUrl({
      redirectUri: `${origin}/api/auth/gmail/callback`,
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
