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
 * Abroad agency advises clients against. Any internal user, and a client
 * browsing their own organisation's catalogue from the portal, may read it;
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
    // The masters screen: every institution, including ones taken out of
    // Course Finder, so a hidden one can be found again and put back.
    if (url.searchParams.get("masters") === "1") {
      if (session.identity.role === "client") throw new LiveAccessError(403, "Course Finder masters are available to staff only.");
      // Searched in the database as the person types. The list used to be
      // read whole and searched in the browser, but the database returns at
      // most a thousand rows to one request, so in a large catalogue every
      // university after the first thousand names could never be found.
      const found = await findInstitutions(optional(url.searchParams.get("q")) ?? "", token);
      return appendRefreshCookies(Response.json({ ok: true, institutions: found }), session.refreshed, request);
    }
    // One institution in full, with the courses recorded under it, for editing.
    const detail = url.searchParams.get("institutionDetail");
    if (detail) {
      if (session.identity.role === "client") throw new LiveAccessError(403, "Course Finder masters are available to staff only.");
      const id = uuid(detail, "Institution");
      const [rows, courses] = await Promise.all([
        supabaseRequest<Json[]>(`/rest/v1/institutions?select=id,name,country,city,website,notes,active&id=eq.${id}&limit=1`, { method: "GET" }, token),
        supabaseRequest<Json[]>(`/rest/v1/courses?select=id,name,level,field_of_study,duration_months,tuition_fee,currency,intake_months,notes,active&institution_id=eq.${id}&order=name.asc&limit=2000`, { method: "GET" }, token),
      ]);
      if (!rows.length) throw new InputError("That institution is not in your catalogue.");
      return appendRefreshCookies(Response.json({ ok: true, institution: rows[0], courses }), session.refreshed, request);
    }
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
    // The list a filter or a form picks an institution from. It is read in
    // pages because the database returns at most a thousand rows to one
    // request; read in one go, every institution past the first thousand
    // names was missing from the pickers. A caller that already holds the
    // list asks for it to be left out.
    const institutions = url.searchParams.get("institutions") === "0" ? undefined : await allActiveInstitutions(token);
    const sources = await supabaseRequest<Json[]>(
      "/rest/v1/course_source_registry?select=country_code,country_name,source_system,source_name,source_url,authority_type,coverage,sync_mode,status,last_success_at,last_error&order=country_name.asc",
      { method: "GET" }, token,
    ).catch(() => []);
    return appendRefreshCookies(
      Response.json({ ok: true, ...catalog, institutions, sources, page, limit }),
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
      // Only what was sent is changed, so switching an institution off does
      // not need the rest of its details repeated.
      const changes: Json = {};
      if (typeof body.active === "boolean") changes.active = body.active;
      if (body.name !== undefined) changes.name = required(body.name, "Institution name");
      if (body.country !== undefined) changes.country = required(body.country, "Country");
      if (body.city !== undefined) changes.city = optional(body.city);
      if (body.website !== undefined) changes.website = optional(body.website);
      if (body.notes !== undefined) changes.notes = optional(body.notes);
      if (!Object.keys(changes).length) throw new InputError("Nothing to change.");
      await patch("institutions", uuid(body.institutionId, "Institution"), changes, token);
    } else if (action === "create_course") {
      const institutionId = uuid(body.institutionId, "Institution");
      const institutions = await supabaseRequest<Json[]>(
        `/rest/v1/institutions?select=id&id=eq.${institutionId}&organisation_id=eq.${org}&active=eq.true&limit=1`,
        { method: "GET" }, token,
      );
      if (!institutions.length) throw new InputError("Choose an active institution from your catalogue.");
      await insert(
        "courses",
        {
          id: crypto.randomUUID(),
          organisation_id: org,
          institution_id: institutionId,
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
      if (body.name !== undefined) changes.name = required(body.name, "Course name");
      if (body.level !== undefined) changes.level = optional(body.level);
      if (body.fieldOfStudy !== undefined) changes.field_of_study = optional(body.fieldOfStudy);
      if (body.durationMonths !== undefined) changes.duration_months = optionalInt(body.durationMonths);
      if (body.tuitionFee !== undefined) changes.tuition_fee = optionalNumber(body.tuitionFee);
      if (body.currency !== undefined) changes.currency = optional(body.currency) || "AUD";
      if (body.intakeMonths !== undefined) changes.intake_months = optional(body.intakeMonths);
      if (body.notes !== undefined) changes.notes = optional(body.notes);
      if (!Object.keys(changes).length) throw new InputError("Nothing to change.");
      await patch("courses", uuid(body.courseId, "Course"), changes, token);
    } else {
      throw new InputError("Unsupported Course Finder action.");
    }
    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) {
    return apiError(error);
  }
}

async function allActiveInstitutions(token: string): Promise<Json[]> {
  const rows: Json[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const page = await supabaseRequest<Json[]>(
      `/rest/v1/institutions?select=id,name,country,city&active=eq.true&order=name.asc,id.asc&limit=1000&offset=${offset}`,
      { method: "GET" }, token,
    );
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

const SEARCH_NOISE = new Set(["of", "the", "and", "for", "in", "at", "de", "la"]);
/**
 * Institutions matching what was typed, best first. Every word typed has to
 * appear in the name, in any order ("institute polytechnic" finds
 * "Polytechnic Institute Australia"). When nothing matches, the words are
 * shortened to their first four letters, which forgives a misspelling later
 * in a word ("polythnetic"), then to their last four, which forgives one at
 * the start, and failing that one word at a time is left out.
 * A country or city typed on its own lists the institutions there.
 */
async function findInstitutions(query: string, token: string): Promise<Json[]> {
  const select = "/rest/v1/institutions?select=id,name,country,city,active&order=name.asc&limit=50";
  const read = (filters: string[]) =>
    supabaseRequest<Json[]>(`${select}${filters.map((filter) => `&${filter}`).join("")}`, { method: "GET" }, token);
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !SEARCH_NOISE.has(word)).slice(0, 6);
  if (!words.length) return read([]);
  const named = (parts: string[]) => parts.map((part) => `name=ilike.*${part}*`);
  const place = words.join(" ");
  const [exact, placed] = await Promise.all([
    read(named(words)),
    read([`or=(country.ilike.*${place}*,city.ilike.*${place}*)`]).catch(() => [] as Json[]),
  ]);
  let rows = exact;
  if (!rows.length) {
    const stems = words.map((word) => (word.length > 4 ? word.slice(0, 4) : word));
    rows = await read(named(stems));
    // A slip near the start of a word ("ploytechnic") leaves its ending
    // intact, so the last letters are tried when the first ones find nothing.
    if (!rows.length) rows = await read(named(words.map((word) => (word.length > 5 ? word.slice(-4) : word))));
    if (!rows.length && stems.length > 1) {
      const partial = await Promise.all(stems.map((_, skip) => read(named(stems.filter((__, index) => index !== skip)))));
      // Those matching most of the words come first.
      const seen = new Map<string, { row: Json; hits: number }>();
      for (const list of partial) for (const row of list) {
        const key = String(row.id);
        seen.set(key, { row, hits: (seen.get(key)?.hits ?? 0) + 1 });
      }
      rows = [...seen.values()].sort((a, b) => b.hits - a.hits).map((item) => item.row).slice(0, 50);
    }
  }
  const ids = new Set(rows.map((row) => String(row.id)));
  return [...rows, ...placed.filter((row) => !ids.has(String(row.id)))].slice(0, 50);
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed))
    throw new InputError(`${label} is invalid.`);
  return parsed;
}
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) {
    if (/23505/.test(error.message)) return Response.json({ ok: false, error: "That catalogue entry already exists. Search the existing list before adding it again." }, { status: 409 });
    const migrationMissing = /search_course_catalog|PGRST202|does not exist/i.test(error.message);
    return Response.json(
      { ok: false, error: migrationMissing ? "Course Finder needs database migration 0026_course_finder_catalog.sql." : "The database rejected this Course Finder action." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  }
  console.error(error);
  return Response.json({ ok: false, error: "Course Finder could not be loaded." }, { status: 500 });
}
