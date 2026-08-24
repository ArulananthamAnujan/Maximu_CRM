import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * Institutions and the courses they offer -- the reference data a Study
 * Abroad agency advises clients against. Every internal user may browse it;
 * only the roles that maintain masters data elsewhere (branches, templates,
 * workflows) may add or change an entry, enforced the same way here.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "Course Finder is available to staff only.");
    const token = session.accessToken;
    const [institutions, courses] = await Promise.all([
      get("institutions?select=*&order=name.asc", token),
      get("courses?select=*&order=name.asc", token),
    ]);
    return appendRefreshCookies(
      Response.json({ ok: true, institutions, courses }),
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
      throw new LiveAccessError(403, "Course Finder is available to staff only.");
    const token = session.accessToken;
    const org = session.identity.organisationId;
    const body = (await request.json()) as Json;
    const action = required(body.action, "Action");
    // Masters data, maintained by the same roles that maintain branches,
    // templates and workflows -- checked here rather than left to the
    // database's own rejection, which is a genuine error on an INSERT rather
    // than the empty-result pattern a blocked update or select gets.
    if (session.identity.role === "staff")
      throw new LiveAccessError(403, "Only a manager or administrator can change Course Finder.");

    if (action === "create_institution") {
      await insert(
        "institutions",
        {
          id: crypto.randomUUID(),
          organisation_id: org,
          name: required(body.name, "Institution name"),
          country: required(body.country, "Country"),
          city: optional(body.city),
          website: optional(body.website),
          notes: optional(body.notes),
          active: true,
        },
        token,
      );
    } else if (action === "update_institution") {
      const changes: Json = {};
      if (typeof body.active === "boolean") changes.active = body.active;
      if (body.notes !== undefined) changes.notes = optional(body.notes);
      await patch("institutions", uuid(body.institutionId, "Institution"), changes, token);
    } else if (action === "create_course") {
      await insert(
        "courses",
        {
          id: crypto.randomUUID(),
          organisation_id: org,
          institution_id: uuid(body.institutionId, "Institution"),
          name: required(body.name, "Course name"),
          level: optional(body.level),
          field_of_study: optional(body.fieldOfStudy),
          duration_months: optionalInt(body.durationMonths),
          tuition_fee: optionalNumber(body.tuitionFee),
          currency: optional(body.currency) || "AUD",
          intake_months: optional(body.intakeMonths),
          notes: optional(body.notes),
          active: true,
        },
        token,
      );
    } else if (action === "update_course") {
      const changes: Json = {};
      if (typeof body.active === "boolean") changes.active = body.active;
      if (body.notes !== undefined) changes.notes = optional(body.notes);
      await patch("courses", uuid(body.courseId, "Course"), changes, token);
    } else {
      throw new InputError("Unsupported Course Finder action.");
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
    throw new LiveAccessError(403, "Only a manager or administrator can change Course Finder.");
}
async function patch(table: string, id: string, value: Json, token: string) {
  const updated = await supabaseRequest<Json[]>(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(value) },
    token,
  );
  if (!Array.isArray(updated) || updated.length === 0)
    throw new LiveAccessError(403, "Only a manager or administrator can change Course Finder.");
}
function optional(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function required(value: unknown, label: string) {
  const parsed = optional(value);
  if (!parsed) throw new InputError(`${label} is required.`);
  return parsed;
}
function optionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function optionalInt(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed === null ? null : Math.round(parsed);
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
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this Course Finder action." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error);
  return Response.json({ ok: false, error: "Course Finder could not be loaded." }, { status: 500 });
}
