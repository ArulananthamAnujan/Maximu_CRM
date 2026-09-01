import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseAdminRequest } from "@/server/supabase";
import { normaliseWhatsappNumber, whatsappConfig } from "@/server/whatsapp";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const configured = whatsappConfig().verifyToken;
  if (mode === "subscribe" && configured && token === configured && challenge)
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256")))
    return new Response("Invalid signature", { status: 401 });
  let payload: Json;
  try {
    payload = JSON.parse(raw) as Json;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const entries = Array.isArray(payload.entry) ? payload.entry.filter(isObject) : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes.filter(isObject) : [];
    for (const change of changes) {
      const value = isObject(change.value) ? change.value : {};
      await recordStatuses(value);
      await recordInbound(value);
    }
  }
  return Response.json({ ok: true });
}

function validSignature(body: string, received: string | null): boolean {
  const secret = whatsappConfig().appSecret;
  if (!secret || !received?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function recordStatuses(value: Json) {
  const statuses = Array.isArray(value.statuses) ? value.statuses.filter(isObject) : [];
  for (const status of statuses) {
    const id = text(status.id);
    const state = text(status.status);
    if (!id || !["sent", "delivered", "read", "failed"].includes(state)) continue;
    const errors = Array.isArray(status.errors) ? status.errors.filter(isObject) : [];
    await supabaseAdminRequest(
      `/rest/v1/whatsapp_messages?provider_message_id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          delivery_state: state,
          provider_error: errors.map((error) => text(error.title) || text(error.message)).filter(Boolean).join("; ") || null,
        }),
      },
    );
    await supabaseAdminRequest(
      `/rest/v1/campaign_recipients?provider_message_id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: state }),
      },
    ).catch(() => undefined);
  }
}

async function recordInbound(value: Json) {
  const messages = Array.isArray(value.messages) ? value.messages.filter(isObject) : [];
  for (const message of messages) {
    const providerId = text(message.id);
    const from = normaliseWhatsappNumber(text(message.from));
    const content = isObject(message.text) ? text(message.text.body) : "";
    if (!providerId || !from || !content) continue;
    const clients = await supabaseAdminRequest<Array<{ id: string; organisation_id: string; branch_id: string | null }>>(
      `/rest/v1/clients?select=id,organisation_id,branch_id&mobile_normalized=eq.${encodeURIComponent(from)}&archived_at=is.null&limit=2`,
    );
    if (clients.length !== 1) continue;
    const client = clients[0];
    const cases = await supabaseAdminRequest<Array<{ id: string }>>(
      `/rest/v1/cases?select=id&client_id=eq.${client.id}&order=closed_at.asc.nullsfirst,opened_at.desc&limit=1`,
    );
    if (!cases[0]) continue;
    await supabaseAdminRequest("/rest/v1/whatsapp_messages", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        organisation_id: client.organisation_id,
        branch_id: client.branch_id,
        case_id: cases[0].id,
        client_id: client.id,
        direction: "inbound",
        sender: from,
        recipient: text((isObject(value.metadata) ? value.metadata : {}).display_phone_number),
        body: content,
        provider_message_id: providerId,
        delivery_state: "received",
        received_at: new Date(Number(text(message.timestamp) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      }),
    });
  }
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
