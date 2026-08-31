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
    const token = session.accessToken;
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 30, 1), 100);
    const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
    const institution = url.searchParams.get("institution");
    if (institution) uuid(institution, "Institution");
    const v2Body = {
      p_query: optional(url.searchParams.get("q")),
      p_country: optional(url.searchParams.get("country")),
      p_level: optional(url.searchParams.get("level")),
      p_field: optional(url.searchParams.get("field")),
      p_intake: optional(url.searchParams.get("intake")),
      p_max_fee: optionalNumber(url.searchParams.get("maxFee")),
      p_max_duration: optionalInt(url.searchParams.get("maxDuration")),
      p_verified_only: url.searchParams.get("verified") === "true",
      p_institution: institution || null,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    };
    let catalog: Json;
    try {
      catalog = await supabaseRequest<Json>(
        "/rest/v1/rpc/search_course_catalog_v2",
        { method: "POST", body: JSON.stringify(v2Body) },
        token,
      );
    } catch (reason) {
      if (!(reason instanceof SupabaseError) || !/search_course_catalog_v2|PGRST202|does not exist/i.test(reason.message)) throw reason;
      catalog = await supabaseRequest<Json>(
        "/rest/v1/rpc/search_course_catalog",
        {
          method: "POST",
          body: JSON.stringify({
            p_query: v2Body.p_query,
            p_country: v2Body.p_country,
            p_level: v2Body.p_level,
            p_institution: v2Body.p_institution,
            p_limit: v2Body.p_limit,
            p_offset: v2Body.p_offset,
          }),
        },
        token,
      );
    }
    const institutions = await
      // Small compared to the course catalogue -- the list an administrator
      // picks from when adding a course, and looks a new institution up
      // against before adding a duplicate.
      supabaseRequest<Json[]>(
        "/rest/v1/institutions?select=id,name,country,city&active=eq.true&order=name.asc&limit=5000",
        { method: "GET" },
        token,
      );
    return appendRefreshCookies(
      Response.json({ ok: true, ...catalog, institutions, page, limit }),
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
  if (error instanceof SupabaseError) {
    const migrationMissing = /search_course_catalog|PGRST202|does not exist/i.test(error.message);
    return Response.json(
      { ok: false, error: migrationMissing ? "Course Finder needs database migration 0026_course_finder_catalog.sql." : "The database rejected this Course Finder action." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  }
  console.error(error);
  return Response.json({ ok: false, error: "Course Finder could not be loaded." }, { status: 500 });
}
