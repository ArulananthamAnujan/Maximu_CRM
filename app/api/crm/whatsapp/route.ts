import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import {
  sendWhatsappText,
  whatsappConfigured,
  WhatsAppError,
} from "@/server/whatsapp";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "WhatsApp sending is available to staff only.");
    return appendRefreshCookies(
      Response.json({ ok: true, configured: whatsappConfigured() }),
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
      throw new LiveAccessError(403, "WhatsApp sending is available to staff only.");
    const token = session.accessToken;
    const body = (await request.json()) as Json;
    if (body.action !== "send_message") throw new InputError("Unsupported WhatsApp action.");
    const messageId = uuid(body.messageId, "Message");
    const rows = await supabaseRequest<
      { id: string; case_id: string; client_id: string; body: string; delivery_state: string }[]
    >(
      `/rest/v1/whatsapp_messages?select=id,case_id,client_id,body,delivery_state&id=eq.${messageId}&limit=1`,
      { method: "GET" },
      token,
    );
    const message = rows[0];
    if (!message) throw new LiveAccessError(403, "That WhatsApp message is not available to you.");
    if (!["draft", "failed"].includes(message.delivery_state))
      throw new InputError("Only a draft or failed WhatsApp message can be sent.");
    const clients = await supabaseRequest<{ mobile: string | null }[]>(
      `/rest/v1/clients?select=mobile&id=eq.${message.client_id}&limit=1`,
      { method: "GET" },
      token,
    );
    const mobile = String(clients[0]?.mobile ?? "").trim();
    if (!mobile) throw new InputError("Add the client's mobile number before sending WhatsApp.");
    try {
      const sent = await sendWhatsappText({ to: mobile, body: message.body });
      const now = new Date().toISOString();
      await supabaseRequest(`/rest/v1/whatsapp_messages?id=eq.${message.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          recipient: mobile,
          provider_message_id: sent.id,
          delivery_state: "sent",
          sent_at: now,
          provider_error: null,
        }),
      }, token);
      await supabaseRequest("/rest/v1/audit_events", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          organisation_id: session.identity.organisationId,
          actor_id: session.identity.profileId,
          action: "whatsapp.sent",
          resource_type: "whatsapp_message",
          resource_id: message.id,
          case_id: message.case_id,
          summary: "Sent case-linked WhatsApp message",
        }),
      }, token);
      return appendRefreshCookies(Response.json({ ok: true, providerMessageId: sent.id }), session.refreshed, request);
    } catch (error) {
      await supabaseRequest(`/rest/v1/whatsapp_messages?id=eq.${message.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          delivery_state: "failed",
          provider_error: error instanceof Error ? error.message.slice(0, 1000) : "Provider failure",
        }),
      }, token).catch(() => undefined);
      throw error;
    }
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
  if (error instanceof WhatsAppError)
    return Response.json({ ok: false, error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 503 });
  if (error instanceof SupabaseError)
    return Response.json({ ok: false, error: "The database rejected this WhatsApp action." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error);
  return Response.json({ ok: false, error: "The WhatsApp action could not be completed." }, { status: 500 });
}
