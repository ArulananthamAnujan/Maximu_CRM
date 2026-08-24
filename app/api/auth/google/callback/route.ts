import {
  isSecureRequest,
  jsonWithCookies,
  sessionCookieHeaders,
  SupabaseError,
  supabaseRequest,
  type SupabaseSession,
} from "@/server/supabase";
import { profileForUser } from "@/server/supabase-session";

export const dynamic = "force-dynamic";

/**
 * The second half of Google sign-in. Supabase's own OAuth exchange has
 * already happened by the time this is called; the browser has the tokens
 * from the URL fragment (never sent to a server on its own) and hands them
 * here to become the same httpOnly session cookies a password sign-in sets.
 * Whoever the Google account belongs to still has to be a known CRM login --
 * this does not create the trust, only carries a session Supabase already
 * decided to issue.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };
    const accessToken = body.access_token;
    const refreshToken = body.refresh_token;
    if (!accessToken || !refreshToken)
      return Response.json(
        { ok: false, error: "Google sign-in did not return a session." },
        { status: 400 },
      );

    const user = await supabaseRequest<{ id: string; email?: string }>(
      "/auth/v1/user",
      { method: "GET" },
      accessToken,
    );

    const profile = await profileForUser(accessToken, user.id);
    if (!profile)
      return Response.json(
        {
          ok: false,
          error:
            "This Google account is not linked to a Maximus CRM profile, and there is no invitation for it. Ask an administrator to add you under Staff & Masters.",
        },
        { status: 403 },
      );
    if (!profile.active)
      return Response.json(
        {
          ok: false,
          error:
            "Your Maximus CRM account has been deactivated. Contact a Maximus administrator.",
        },
        { status: 403 },
      );

    const session: SupabaseSession = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number(body.expires_in) || 3600,
      token_type: body.token_type || "bearer",
      user,
    };
    return jsonWithCookies(
      { ok: true },
      200,
      sessionCookieHeaders(session, isSecureRequest(request)),
    );
  } catch (error) {
    if (error instanceof SupabaseError && (error.status === 400 || error.status === 401))
      return Response.json(
        { ok: false, error: "That Google sign-in could not be verified." },
        { status: 401 },
      );
    console.error(error);
    return Response.json(
      { ok: false, error: "Google sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }
}
