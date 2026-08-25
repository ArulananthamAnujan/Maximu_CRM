import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * The document-request checklist offered when asking a client for
 * documents. Every internal user may browse it; only the roles that
 * maintain masters data elsewhere (branches, templates, workflows,
 * Course Finder) may add or change an entry, enforced the same way here.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "The document checklist is available to staff only.");
    const token = session.accessToken;
    const templates = await get(
      "document_checklist_templates?select=*&order=category.asc,title.asc",
      token,
    );
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
      throw new LiveAccessError(403, "The document checklist is available to staff only.");
    const token = session.accessToken;
    const org = session.identity.organisationId;
    const body = (await request.json()) as Json;
    const action = required(body.action, "Action");
    // Masters data, maintained by the same roles that maintain branches,
    // templates and workflows -- checked here rather than left to the
    // database's own rejection, which is a genuine error on an INSERT
    // rather than the empty-result pattern a blocked update gets.
    if (session.identity.role === "staff")
      throw new LiveAccessError(403, "Only a manager or administrator can change the document checklist.");

    if (action === "create") {
      await insert(
        "document_checklist_templates",
        {
          id: crypto.randomUUID(),
          organisation_id: org,
          category: required(body.category, "Category"),
          title: required(body.title, "Title"),
          guidance: optional(body.guidance),
          active: true,
        },
        token,
      );
    } else if (action === "update") {
      const changes: Json = {};
      if (body.category !== undefined) changes.category = required(body.category, "Category");
      if (body.title !== undefined) changes.title = required(body.title, "Title");
      if (body.guidance !== undefined) changes.guidance = optional(body.guidance);
      if (typeof body.active === "boolean") changes.active = body.active;
      await patch("document_checklist_templates", uuid(body.templateId, "Template"), changes, token);
    } else {
      throw new InputError("Unsupported document checklist action.");
    }
    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) {
    return apiError(error);
  }
}

async function get(query: string, token: string) {
  return supabaseRequest(`/rest/v1/${query}`, { method: "GET" }, token);
}
async function insert(table: string, value: Json, token: string) {
  const updated = await supabaseRequest<Json[]>(
    `/rest/v1/${table}`,
    { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(value) },
    token,
  );
  if (!Array.isArray(updated) || updated.length === 0)
    throw new LiveAccessError(403, "Only a manager or administrator can change the document checklist.");
}
async function patch(table: string, id: string, value: Json, token: string) {
  const updated = await supabaseRequest<Json[]>(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(value) },
    token,
  );
  if (!Array.isArray(updated) || updated.length === 0)
    throw new LiveAccessError(403, "Only a manager or administrator can change the document checklist.");
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
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this change to the document checklist." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error);
  return Response.json({ ok: false, error: "The document checklist could not be loaded." }, { status: 500 });
}
