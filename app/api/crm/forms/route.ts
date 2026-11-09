import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { drainClientNotices } from "@/server/client-notices";
import { publicOrigin } from "@/server/public-origin";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * Client forms: the questionnaires an agency sends before a visa application.
 *
 * Templates are masters data (any internal user reads them, a manager or
 * administrator changes them). A form on a case is created, edited, sent,
 * answered and reviewed only through the database's case_form_action, which
 * checks who may do what; this route passes the request through and, after a
 * send, delivers the client's email straight away.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: unknown) => (typeof value === "string" && UUID.test(value) ? value : null);
const text = (value: unknown, max = 20000) => (typeof value === "string" ? value.slice(0, max) : null);
const CASE_ACTIONS = ["create", "update", "send", "view", "save", "submit", "review", "withdraw", "delete"];

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const token = session.accessToken;
    const query = new URL(request.url).searchParams;
    const caseId = uuid(query.get("caseId"));
    if (query.has("caseId") && !caseId) throw new InputError("Invalid case.");
    const staff = session.identity.role !== "client";
    const filter = caseId ? `&case_id=eq.${caseId}` : "";
    const forms = await rest(`case_forms?select=*&order=created_at.desc${filter}`, token);
    const templates = staff
      ? await rest(`form_templates?select=*&order=title.asc${query.get("templates") === "all" ? "" : "&active=is.true"}`, token)
      : [];
    const notices = staff
      ? await rest(`client_notice_outbox?select=id,case_id,form_id,kind,status,last_error,attempts,created_at,sent_at&kind=eq.form_request&order=created_at.desc&limit=100${filter}`, token)
      : [];
    return appendRefreshCookies(
      Response.json({ ok: true, forms, templates, notices }, { headers: { "Cache-Control": "no-store" } }),
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
    const token = session.accessToken;
    const body = (await request.json()) as Json;
    const action = String(body.action ?? "");

    if (action.startsWith("template_")) {
      if (session.identity.role === "client") throw new LiveAccessError(403, "Form templates are available to staff only.");
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only a manager or administrator can change form templates.");
      const fields = body.fields === undefined ? undefined : validFields(body.fields);
      if (action === "template_create") {
        const row = {
          id: crypto.randomUUID(),
          organisation_id: session.identity.organisationId,
          title: requiredText(body.title, "Title", 200),
          visa_subclass: text(body.visaSubclass, 40)?.trim() || null,
          description: text(body.description, 4000)?.trim() || null,
          fields: fields ?? [],
          active: body.active !== false,
          created_by: session.identity.profileId,
        };
        const [created] = await mutate("form_templates", "POST", row, token);
        return appendRefreshCookies(Response.json({ ok: true, template: created }), session.refreshed, request);
      }
      const id = uuid(body.templateId);
      if (!id) throw new InputError("Template is invalid.");
      if (action === "template_update") {
        const changes: Json = { updated_at: new Date().toISOString() };
        if (body.title !== undefined) changes.title = requiredText(body.title, "Title", 200);
        if (body.visaSubclass !== undefined) changes.visa_subclass = text(body.visaSubclass, 40)?.trim() || null;
        if (body.description !== undefined) changes.description = text(body.description, 4000)?.trim() || null;
        if (fields !== undefined) changes.fields = fields;
        if (typeof body.active === "boolean") changes.active = body.active;
        const [updated] = await mutate(`form_templates?id=eq.${id}`, "PATCH", changes, token);
        return appendRefreshCookies(Response.json({ ok: true, template: updated }), session.refreshed, request);
      }
      if (action === "template_delete") {
        await mutate(`form_templates?id=eq.${id}`, "DELETE", undefined, token);
        return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
      }
      throw new InputError("Unknown template action.");
    }

    if (!CASE_ACTIONS.includes(action)) throw new InputError("Unknown form action.");
    if (action === "create" ? !uuid(body.caseId) : !uuid(body.id)) throw new InputError("Invalid form or case.");
    const form = await supabaseRequest<Json>(
      "/rest/v1/rpc/case_form_action",
      {
        method: "POST",
        body: JSON.stringify({
          p_action: action,
          p_case: uuid(body.caseId),
          p_id: uuid(body.id),
          p_template: uuid(body.templateId),
          p_title: text(body.title, 200),
          p_description: text(body.description, 4000),
          p_subclass: text(body.visaSubclass, 40),
          p_fields: body.fields === undefined ? null : validFields(body.fields),
          p_answers: body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : null,
          p_note: text(body.note, 2000),
        }),
      },
      token,
    );
    // Sending queued the client's email; deliver it now, from the officer's
    // own Gmail, rather than on the next scheduled attempt.
    if (action === "send") await drainClientNotices(publicOrigin(request));
    return appendRefreshCookies(Response.json({ ok: true, form }), session.refreshed, request);
  } catch (error) {
    return apiError(error);
  }
}

/** The database validates fields fully; this keeps an obviously wrong payload from reaching it with a confusing message. */
function validFields(value: unknown): Json[] {
  if (!Array.isArray(value) || value.length > 150) throw new InputError("A form holds between one and 150 questions.");
  return value.map((field) => {
    if (!field || typeof field !== "object") throw new InputError("Every question needs a label and a type.");
    const f = field as Json;
    const key = String(f.key ?? "");
    if (!/^[a-z0-9_]{1,60}$/.test(key)) throw new InputError(`The question key "${key}" must be lower-case letters, digits and underscores.`);
    if (!String(f.label ?? "").trim()) throw new InputError("Every question needs a label.");
    return f;
  });
}

async function rest(query: string, token: string) {
  return supabaseRequest<Json[]>(`/rest/v1/${query}`, { method: "GET" }, token);
}
async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", value: Json | undefined, token: string) {
  const rows = await supabaseRequest<Json[]>(
    `/rest/v1/${path}`,
    { method, headers: { Prefer: "return=representation" }, body: value ? JSON.stringify(value) : undefined },
    token,
  );
  if (method !== "DELETE" && (!Array.isArray(rows) || rows.length === 0))
    throw new LiveAccessError(403, "Only a manager or administrator can change form templates.");
  return Array.isArray(rows) ? rows : [];
}
function requiredText(value: unknown, label: string, max: number) {
  const parsed = text(value, max)?.trim();
  if (!parsed) throw new InputError(`${label} is required.`);
  return parsed;
}
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) {
    // The database's own message names the missing answer or the rule that stopped the change.
    let detail: { code?: string; message?: string } = {};
    try { detail = JSON.parse(error.message); } catch { /* a non-JSON upstream error */ }
    const status = detail.code === "42501" || error.status === 401 || error.status === 403 ? 403 : error.status >= 500 ? 503 : 400;
    return Response.json({ ok: false, error: detail.message || "The database rejected this change to the form." }, { status });
  }
  console.error(error);
  return Response.json({ ok: false, error: "The form could not be loaded." }, { status: 500 });
}
