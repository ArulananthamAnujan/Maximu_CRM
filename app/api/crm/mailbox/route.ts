import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import {
  buildRawMessage,
  gmailGetMessage,
  gmailHeader,
  gmailOAuthConfigured,
  gmailRefreshAccessToken,
  gmailSearchMessages,
  gmailSend,
  gmailTextBody,
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
    const rows = await supabaseRequest<{ email: string; active: boolean; token_reference: string | null }[]>(
      `/rest/v1/mailbox_connections?select=email,active,token_reference&profile_id=eq.${session.identity.profileId}&provider=eq.gmail&limit=1`,
      { method: "GET" },
      session.accessToken,
    );
    const connection = rows[0];
    const result: Json = {
        ok: true,
        oauthConfigured: gmailOAuthConfigured(),
        connected: Boolean(connection?.active),
        email: connection?.email ?? null,
    };
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "inbox" && connection?.active && connection.token_reference) {
      const fresh = await gmailRefreshAccessToken(await reveal(connection.token_reference));
      const search = String(url.searchParams.get("q") || "").trim();
      const matches = await gmailSearchMessages({
        accessToken: fresh.access_token,
        query: search || "in:anywhere",
        maxResults: 50,
      });
      const messages = await Promise.all(matches.map(async (match) => {
        const message = await gmailGetMessage({ accessToken: fresh.access_token, id: match.id });
        return {
          id: message.id,
          threadId: message.threadId,
          from: gmailHeader(message, "From"),
          to: gmailHeader(message, "To"),
          cc: gmailHeader(message, "Cc"),
          subject: gmailHeader(message, "Subject") || "(no subject)",
          date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : gmailHeader(message, "Date"),
          snippet: message.snippet || "",
          body: gmailTextBody(message.payload),
          unread: message.labelIds?.includes("UNREAD") ?? false,
          inbox: message.labelIds?.includes("INBOX") ?? false,
          sent: message.labelIds?.includes("SENT") ?? false,
        };
      }));
      result.messages = messages;
    }
    return appendRefreshCookies(
      Response.json(result),
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
    } else if (action === "sync_case") {
      const caseId = uuid(body.caseId, "Case");
      const cases = await supabaseRequest<{ client_id: string }[]>(
        `/rest/v1/cases?select=client_id&id=eq.${caseId}&limit=1`,
        { method: "GET" }, token,
      );
      if (!cases[0]) throw new LiveAccessError(403, "That case could not be found.");
      const clients = await supabaseRequest<{ id: string; email: string }[]>(
        `/rest/v1/clients?select=id,email&id=eq.${cases[0].client_id}&limit=1`,
        { method: "GET" }, token,
      );
      const client = clients[0];
      if (!client?.email) throw new InputError("Add the client's email address before syncing Gmail.");
      const connections = await supabaseRequest<
        { email: string; token_reference: string | null; active: boolean }[]
      >(
        `/rest/v1/mailbox_connections?select=email,token_reference,active&profile_id=eq.${session.identity.profileId}&provider=eq.gmail&limit=1`,
        { method: "GET" }, token,
      );
      const connection = connections[0];
      if (!connection?.active || !connection.token_reference)
        throw new InputError("Connect your Gmail account before receiving messages.");
      const refreshToken = await reveal(connection.token_reference);
      const fresh = await gmailRefreshAccessToken(refreshToken);
      const matches = await gmailSearchMessages({
        accessToken: fresh.access_token,
        query: `{from:${client.email} to:${client.email}}`,
        maxResults: 100,
      });
      let imported = 0;
      for (const match of matches.reverse()) {
        const existing = await supabaseRequest<{ id: string }[]>(
          `/rest/v1/email_messages?select=id&provider_message_id=eq.${encodeURIComponent(match.id)}&limit=1`,
          { method: "GET" }, token,
        );
        if (existing.length) continue;
        const gmail = await gmailGetMessage({ accessToken: fresh.access_token, id: match.id });
        let threads = await supabaseRequest<{ id: string }[]>(
          `/rest/v1/email_threads?select=id&provider_thread_id=eq.${encodeURIComponent(gmail.threadId)}&limit=1`,
          { method: "GET" }, token,
        );
        const sentAt = gmail.internalDate
          ? new Date(Number(gmail.internalDate)).toISOString()
          : new Date(gmailHeader(gmail, "Date") || Date.now()).toISOString();
        if (!threads.length) {
          const threadId = crypto.randomUUID();
          await supabaseRequest("/rest/v1/email_threads", {
            method: "POST", headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              id: threadId, organisation_id: session.identity.organisationId,
              client_id: client.id, case_id: caseId, provider_thread_id: gmail.threadId,
              subject: gmailHeader(gmail, "Subject") || "Email conversation",
              assigned_to: session.identity.profileId, status: "open",
              awaiting_party: "staff", last_message_at: sentAt,
            }),
          }, token);
          threads = [{ id: threadId }];
        }
        const sender = gmailHeader(gmail, "From");
        const outbound = sender.toLowerCase().includes(connection.email.toLowerCase());
        const addresses = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean);
        await supabaseRequest("/rest/v1/email_messages", {
          method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            id: crypto.randomUUID(), organisation_id: session.identity.organisationId,
            thread_id: threads[0].id, provider_message_id: gmail.id,
            sender, recipients: addresses(gmailHeader(gmail, "To")),
            cc: addresses(gmailHeader(gmail, "Cc")), direction: outbound ? "outbound" : "inbound",
            body_preview: gmailTextBody(gmail.payload).trim() || gmail.snippet || "",
            sent_at: sentAt, delivery_state: outbound ? "sent" : "received",
            created_by: session.identity.profileId, metadata: { gmail_thread_id: gmail.threadId },
          }),
        }, token);
        await supabaseRequest(`/rest/v1/email_threads?id=eq.${threads[0].id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ last_message_at: sentAt, awaiting_party: outbound ? "client" : "staff", status: "open" }),
        }, token);
        imported += 1;
      }
      return appendRefreshCookies(Response.json({ ok: true, imported }), session.refreshed, request);
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

      const threads = await supabaseRequest<
        { id: string; subject: string; client_id: string | null; case_id: string | null }[]
      >(
        `/rest/v1/email_threads?select=id,subject,client_id,case_id&id=eq.${message.thread_id}&limit=1`,
        { method: "GET" },
        token,
      );
      const thread = threads[0];
      if (!thread) throw new LiveAccessError(403, "That message's thread could not be found.");

      // Resolve the address again at the moment of dispatch. A draft can sit
      // for days; if staff corrected the case profile in the meantime, Gmail
      // must use that current address rather than the stale one stored when
      // the draft was composed.
      let recipients = message.recipients ?? [];
      if (thread.case_id && thread.client_id) {
        const clients = await supabaseRequest<{ email: string | null }[]>(
          `/rest/v1/clients?select=email&id=eq.${encodeURIComponent(thread.client_id)}&limit=1`,
          { method: "GET" },
          token,
        );
        const current = String(clients[0]?.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(current))
          throw new InputError("This case profile does not have a valid email address.");
        recipients = [current];
      }

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
        to: recipients,
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
            recipients,
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
