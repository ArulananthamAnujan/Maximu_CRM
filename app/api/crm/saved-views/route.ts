import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

/**
 * A named filter preset, private to whoever saved it -- RLS scopes every
 * read and write here to the caller's own profile_id, so nobody's screen
 * changes because of someone else's view.
 */
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const url = new URL(request.url);
    const moduleKey = url.searchParams.get("module");
    const filter = moduleKey ? `&module=eq.${encodeURIComponent(moduleKey)}` : "";
    const views = await supabaseRequest<Json[]>(
      `/rest/v1/saved_views?select=id,name,module,filters&order=name.asc${filter}`,
      { method: "GET" },
      session.accessToken,
    );
    return appendRefreshCookies(
      Response.json({ ok: true, views: views.map(shape) }),
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
    const action = body.action;

    if (action === "create") {
      const moduleKey = required(body.module, "Module");
      const name = required(body.name, "Name");
      const filters = isObject(body.filters) ? body.filters : {};
      await supabaseRequest(
        "/rest/v1/saved_views",
        {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            organisation_id: session.identity.organisationId,
            profile_id: session.identity.profileId,
            module: moduleKey,
            name,
            filters,
          }),
        },
        token,
      );
      const views = await supabaseRequest<Json[]>(
        `/rest/v1/saved_views?select=id,name,module,filters&module=eq.${encodeURIComponent(moduleKey)}&order=name.asc`,
        { method: "GET" },
        token,
      );
      return appendRefreshCookies(
        Response.json({ ok: true, views: views.map(shape) }),
        session.refreshed,
        request,
      );
    }

    if (action === "delete") {
      const id = uuid(body.id, "View");
      const moduleKey = typeof body.module === "string" ? body.module : null;
      await supabaseRequest(
        `/rest/v1/saved_views?id=eq.${id}`,
        { method: "DELETE" },
        token,
      );
      const views = moduleKey
        ? await supabaseRequest<Json[]>(
            `/rest/v1/saved_views?select=id,name,module,filters&module=eq.${encodeURIComponent(moduleKey)}&order=name.asc`,
            { method: "GET" },
            token,
          )
        : [];
      return appendRefreshCookies(
        Response.json({ ok: true, views: views.map(shape) }),
        session.refreshed,
        request,
      );
    }

    throw new InputError("Unsupported saved view action.");
  } catch (error) {
    return apiError(error);
  }
}

function shape(row: Json) {
  return { id: row.id, name: row.name, filters: row.filters ?? {} };
}
function required(value: unknown, label: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!parsed) throw new InputError(`${label} is required.`);
  return parsed;
}
function uuid(value: unknown, label: string) {
  const parsed = required(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed))
    throw new InputError(`${label} is invalid.`);
  return parsed;
}
function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError)
    return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError)
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError)
    return Response.json(
      { ok: false, error: "The database rejected this saved view." },
      { status: error.status >= 400 && error.status < 500 ? error.status : 503 },
    );
  console.error(error);
  return Response.json({ ok: false, error: "The saved view could not be completed." }, { status: 500 });
}
