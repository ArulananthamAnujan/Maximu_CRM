import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * Wording for the three emails this CRM sends a client on its own: a
 * document request, an invoice, a new portal login. Every internal user
 * may read it; only a manager or administrator may change it.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "Email templates are available to staff only.");
    const token = session.accessToken;
    const templates = await get("email_templates?select=*&order=kind.asc", token);
    return appendRefreshCookies(
      Response.json({ ok: true, templates }),
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
      throw new LiveAccessError(403, "Email templates are available to staff only.");
    const token = session.accessToken;
    const body = (await request.json()) as Json;
    const action = required(body.action, "Action");
    if (session.identity.role === "staff")
      throw new LiveAccessError(403, "Only a manager or administrator can change an email template.");

    if (action === "update") {
      const changes: Json = {};
      if (body.subject !== undefined) changes.subject = required(body.subject, "Subject");
      if (body.body !== undefined) changes.body = required(body.body, "Body");
      changes.updated_at = new Date().toISOString();
      await patch("email_templates", uuid(body.templateId, "Template"), changes, token);
    } else {
      throw new InputError("Unsupported email template action.");
    }
    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) {
    return apiError(error);
  }
}

async function get(query: string, token: string) {
  return supabaseRequest(`/rest/v1/${query}`, { method: "GET" }, token);
}
async function patch(table: string, id: string, value: Json, token: string) {
  const updated = await supabaseRequest<Json[]>(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(value) },
    token,
  );
  if (!Array.isArray(updated) || updated.length === 0)
    throw new LiveAccessError(403, "Only a manager or administrator can change an email template.");
}
function optional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function required(value: unknown, label: string) {
  const parsed = optional(value);
  if (!parsed) throw new InputError(`${label} is required.`);
  return parsed;
}
function uuid(value: unknown, label: string) {
  const parsed = required(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed))
    throw new InputError(`${label} is invalid.`);
  return parsed;
}
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this change to email templates." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error);
  return Response.json({ ok: false, error: "Email templates could not be loaded." }, { status: 500 });
}
