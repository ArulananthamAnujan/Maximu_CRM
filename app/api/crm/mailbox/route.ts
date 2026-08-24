import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import {
  buildRawMessage,
  gmailOAuthConfigured,
  gmailRefreshAccessToken,
  gmailSend,
  GmailError,
  GmailNotConfiguredError,
} from "@/server/gmail";
import { protect, ProtectedFieldError, reveal } from "@/server/protected-fields";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * A member of staff's own Gmail connection, and sending through it. Every
 * read and write here is scoped to the signed-in person's own profile_id --
 * row-level security already restricts mailbox_connections to its owner (and
 * to administrators), but this only ever asks for its own row regardless of
 * role, because "my mailbox" should mean the same thing to everyone.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "The mailbox connection is available to staff only.");
    const rows = await supabaseRequest<{ email: string; active: boolean }[]>(
      `/rest/v1/mailbox_connections?select=email,active&profile_id=eq.${session.identity.profileId}&provider=eq.gmail&limit=1`,
      { method: "GET" },
      session.accessToken,
    );
    const connection = rows[0];
    return appendRefreshCookies(
      Response.json({
        ok: true,
        oauthConfigured: gmailOAuthConfigured(),
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
      throw new LiveAccessError(403, "The mailbox connection is available to staff only.");
    const token = session.accessToken;
    const body = (await request.json()) as Json;
    const action = body.action;

    if (action === "disconnect") {
      await supabaseRequest(
        `/rest/v1/mailbox_connections?profile_id=eq.${session.identity.profileId}&provider=eq.gmail`,
        { method: "DELETE" },
        token,
      );
    } else if (action === "send_message") {
      const messageId = uuid(body.messageId, "Message");

      const connections = await supabaseRequest<
        { email: string; token_reference: string | null; active: boolean }[]
      >(
        `/rest/v1/mailbox_connections?select=email,token_reference,active&profile_id=eq.${session.identity.profileId}&provider=eq.gmail&limit=1`,
        { method: "GET" },
        token,
      );
      const connection = connections[0];
      if (!connection?.active || !connection.token_reference)
        throw new InputError("Connect your Gmail account before sending.");

      const messages = await supabaseRequest<
        { id: string; thread_id: string; recipients: string[]; cc: string[]; body_preview: string | null }[]
      >(
        `/rest/v1/email_messages?select=id,thread_id,recipients,cc,body_preview&id=eq.${messageId}&limit=1`,
        { method: "GET" },
        token,
      );
      const message = messages[0];
      if (!message) throw new LiveAccessError(403, "That message could not be found.");

      const threads = await supabaseRequest<{ id: string; subject: string }[]>(
        `/rest/v1/email_threads?select=id,subject&id=eq.${message.thread_id}&limit=1`,
        { method: "GET" },
        token,
      );
      const thread = threads[0];
      if (!thread) throw new LiveAccessError(403, "That message's thread could not be found.");

      let refreshToken: string;
      try {
        refreshToken = await reveal(connection.token_reference);
      } catch (error) {
        if (error instanceof ProtectedFieldError)
          throw new InputError(
            "Your Gmail connection could not be read. Reconnect your Gmail account.",
          );
        throw error;
      }
      const fresh = await gmailRefreshAccessToken(refreshToken);
      const raw = buildRawMessage({
        from: connection.email,
        to: message.recipients ?? [],
        cc: message.cc ?? [],
        subject: thread.subject,
        body: message.body_preview ?? "",
      });
      const sent = await gmailSend({ accessToken: fresh.access_token, raw });

      // Google may hand back a new refresh token on rotation; keep it if so.
      if (fresh.refresh_token) {
        await supabaseRequest(
          `/rest/v1/mailbox_connections?profile_id=eq.${session.identity.profileId}&provider=eq.gmail`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ token_reference: await protect(fresh.refresh_token) }),
          },
          token,
        );
      }

      const now = new Date().toISOString();
      await supabaseRequest(
        `/rest/v1/email_messages?id=eq.${messageId}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            delivery_state: "sent",
            sent_at: now,
            provider_message_id: sent.id,
          }),
        },
        token,
      );
      await supabaseRequest(
        `/rest/v1/email_threads?id=eq.${thread.id}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "sent",
            last_message_at: now,
            provider_thread_id: sent.threadId,
          }),
        },
        token,
      );
    } else {
      throw new InputError("Unsupported mailbox action.");
    }

    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) {
    return apiError(error);
  }
}

function uuid(value: unknown, label: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed))
    throw new InputError(`${label} is invalid.`);
  return parsed;
}
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof GmailNotConfiguredError)
    return Response.json({ ok: false, error: error.message }, { status: 503 });
  if (error instanceof GmailError)
    return Response.json(
      { ok: false, error: "Google rejected the request. Reconnect your Gmail account." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  if (error instanceof SupabaseError)
    return Response.json(
      { ok: false, error: "The database rejected this mailbox action." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  console.error(error);
  return Response.json({ ok: false, error: "The mailbox action could not be completed." }, { status: 500 });
}
