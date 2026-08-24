import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { googleOAuthConfigured } from "@/server/google-oauth-client";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * A member of staff's own Calendar connection. Reading and disconnecting
 * mirror the mailbox route exactly -- always scoped to the signed-in
 * person's own profile_id, never anyone else's row, regardless of role.
 * There is no send/sync action here: pushing an appointment happens inside
 * the appointment create and delete paths themselves, the moment the CRM
 * already knows the appointment changed.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "The calendar connection is available to staff only.");
    const rows = await supabaseRequest<{ email: string; active: boolean }[]>(
      `/rest/v1/mailbox_connections?select=email,active&profile_id=eq.${session.identity.profileId}&provider=eq.google_calendar&limit=1`,
      { method: "GET" },
      session.accessToken,
    );
    const connection = rows[0];
    return appendRefreshCookies(
      Response.json({
        ok: true,
        oauthConfigured: googleOAuthConfigured(),
        connected: Boolean(connection?.active),
        email: connection?.email ?? null,
      }),
      session.refreshed,
      request,
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "The calendar connection is available to staff only.");
    const body = (await request.json()) as Json;
    if (body.action !== "disconnect") throw new InputError("Unsupported calendar action.");
    await supabaseRequest(
      `/rest/v1/mailbox_connections?profile_id=eq.${session.identity.profileId}&provider=eq.google_calendar`,
      { method: "DELETE" },
      session.accessToken,
    );
    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) {
    return apiError(error);
  }
}

class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError)
    return Response.json(
      { ok: false, error: "The database rejected this calendar action." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  console.error(error);
  return Response.json({ ok: false, error: "The calendar action could not be completed." }, { status: 500 });
}
