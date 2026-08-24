import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { cookie, isSecureRequest, readCookie, supabaseRequest } from "@/server/supabase";
import { gmailAccountEmail, gmailExchangeCode } from "@/server/gmail";
import { protect } from "@/server/protected-fields";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "maximus_gmail_state";

/**
 * The second half of connecting Gmail. Google hands back an authorization
 * code here; it is exchanged server-to-server for a refresh token, which is
 * the only thing kept -- encrypted with the same field key that protects
 * passport numbers -- against the connecting person's own mailbox_connections
 * row. Nobody else's row is ever touched: RLS restricts it to its owner and
 * to administrators, and this route writes with the signed-in person's own
 * access token rather than a service-role key.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectHome = (status: "connected" | "error") => {
    const target = new URL("/", url.origin);
    target.searchParams.set("gmail", status);
    const headers = new Headers({ Location: target.toString() });
    headers.append(
      "Set-Cookie",
      cookie(STATE_COOKIE, "", 0, isSecureRequest(request)),
    );
    return new Response(null, { status: 302, headers });
  };

  try {
    const session = await liveSession(request);
    const respond = (status: "connected" | "error") =>
      appendRefreshCookies(redirectHome(status), session.refreshed, request);

    if (session.identity.role === "client") return respond("error");

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = readCookie(request, STATE_COOKIE);
    if (!code || !state || !expectedState || state !== expectedState)
      return respond("error");

    const tokens = await gmailExchangeCode({
      code,
      redirectUri: `${url.origin}/api/auth/gmail/callback`,
    });
    if (!tokens.refresh_token) return respond("error");

    const email = await gmailAccountEmail(tokens.access_token);
    const tokenReference = await protect(tokens.refresh_token);

    const existing = await supabaseRequest<{ id: string }[]>(
      `/rest/v1/mailbox_connections?select=id&profile_id=eq.${session.identity.profileId}&provider=eq.gmail`,
      { method: "GET" },
      session.accessToken,
    );
    if (existing.length > 0) {
      await supabaseRequest(
        `/rest/v1/mailbox_connections?id=eq.${existing[0].id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            email,
            token_reference: tokenReference,
            active: true,
          }),
        },
        session.accessToken,
      );
    } else {
      await supabaseRequest(
        "/rest/v1/mailbox_connections",
        {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            organisation_id: session.identity.organisationId,
            profile_id: session.identity.profileId,
            email,
            provider: "gmail",
            connection_type: "personal",
            token_reference: tokenReference,
            active: true,
          }),
        },
        session.accessToken,
      );
    }

    return respond("connected");
  } catch (error) {
    console.error(error);
    return redirectHome("error");
  }
}
