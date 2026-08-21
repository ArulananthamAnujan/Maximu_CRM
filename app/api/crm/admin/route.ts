import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    requireAdmin(session.identity.role);
    const token = session.accessToken;
    const [profiles, roles, permissions, invitations, branches, clientLinks] = await Promise.all([
      get("profiles?select=id,display_name,email,level,department,branch_id,active,created_at&order=display_name.asc", token),
      get("roles?select=*&order=system_role.desc,name.asc", token),
      get("permissions?select=*&order=resource.asc,action.asc", token),
      get("staff_invitations?select=*&order=created_at.desc", token),
      get("branches?select=*&order=name.asc", token),
      get("client_user_links?select=profile_id,client_id,created_at", token),
    ]);
    return appendRefreshCookies(Response.json({ ok: true, profiles, roles, permissions, invitations, branches, clientLinks }), session.refreshed, request);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    requireAdmin(session.identity.role);
    const body = await request.json() as Json;
    const action = required(body.action, "Action");
    const token = session.accessToken;
    const org = session.identity.organisationId;

    if (action === "create_invitation") {
      const roleId = uuid(body.roleId, "Role");
      await insert("staff_invitations", { id: crypto.randomUUID(), organisation_id: org, email: email(body.email), role_id: roleId, branch_id: optionalUuid(body.branchId), invited_by: session.identity.profileId, status: "pending" }, token);
    } else if (action === "update_profile") {
      const target = uuid(body.profileId, "Profile");
      if (target === session.identity.profileId && body.active === false) throw new InputError("You cannot deactivate your own account.");
      const changes: Json = {};
      if (typeof body.displayName === "string") changes.display_name = required(body.displayName, "Display name");
      if (typeof body.department === "string" || body.department === null) changes.department = optional(body.department);
      if (typeof body.branchId === "string" || body.branchId === null) changes.branch_id = optionalUuid(body.branchId);
      if (typeof body.active === "boolean") changes.active = body.active;
      if (body.level) {
        if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Only a Super Admin can change account levels.");
        const level = required(body.level, "Level");
        if (!["super_admin","branch_admin","manager","staff","partner","student"].includes(level)) throw new InputError("Account level is invalid.");
        changes.level = level;
      }
      await patch("profiles", target, changes, token);
    } else if (action === "assign_role") {
      if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Only a Super Admin can assign roles.");
      await insert("profile_roles", { profile_id: uuid(body.profileId, "Profile"), role_id: uuid(body.roleId, "Role"), branch_id: uuid(body.branchId, "Branch") }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "set_permission") {
      if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Only a Super Admin can change permissions.");
      await insert("permissions", { id: crypto.randomUUID(), role_id: uuid(body.roleId, "Role"), resource: slug(body.resource, "Resource"), action: slug(body.permissionAction, "Permission action"), field_mask: isObject(body.fieldMask) ? body.fieldMask : {} }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "create_branch") {
      await insert("branches", { id: crypto.randomUUID(), organisation_id: org, name: required(body.name, "Branch name"), code: required(body.code, "Branch code").toUpperCase(), country_code: required(body.countryCode, "Country").toUpperCase(), active: true }, token);
    } else if (action === "update_branch") {
      const changes: Json = {};
      if (body.name) changes.name = required(body.name, "Branch name");
      if (typeof body.active === "boolean") changes.active = body.active;
      await patch("branches", uuid(body.branchId, "Branch"), changes, token);
    } else {
      throw new InputError("Unsupported administration action.");
    }
    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) { return apiError(error); }
}

function requireAdmin(role: string) { if (role !== "super_admin" && role !== "admin") throw new LiveAccessError(403, "Administrator access is required."); }
async function get(query: string, token: string) { return supabaseRequest(`/rest/v1/${query}`, { method: "GET" }, token); }
async function insert(table: string, value: Json, token: string, prefer = "return=minimal") { await supabaseRequest(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(value) }, token); }
async function patch(table: string, id: string, value: Json, token: string) { await supabaseRequest(`/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(value) }, token); }
function optional(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function required(value: unknown, label: string) { const parsed = optional(value); if (!parsed) throw new InputError(`${label} is required.`); return parsed; }
function uuid(value: unknown, label: string) { const parsed = required(value, label); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new InputError(`${label} is invalid.`); return parsed; }
function optionalUuid(value: unknown) { const parsed = optional(value); return parsed ? uuid(parsed, "Identifier") : null; }
function email(value: unknown) { const parsed = required(value, "Email").toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed)) throw new InputError("Email is invalid."); return parsed; }
function slug(value: unknown, label: string) { const parsed = required(value, label).toLowerCase().replace(/[^a-z0-9_]+/g, "_"); if (!parsed) throw new InputError(`${label} is invalid.`); return parsed; }
function isObject(value: unknown): value is Json { return typeof value === "object" && value !== null && !Array.isArray(value); }
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this administration action." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error); return Response.json({ ok: false, error: "The administration action could not be completed." }, { status: 500 });
}
