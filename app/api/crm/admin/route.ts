import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import {
  serviceRoleKey,
  SupabaseError,
  supabaseAdminRequest,
  supabaseRequest,
} from "@/server/supabase";

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

    // Adding a member of staff. A profile's id has to be the id of that
    // person's Supabase login, which does not exist yet, so there are two
    // routes and the deployment decides which is available:
    //
    //   * with a service-role key, the login and the profile are created here
    //     and a one-time password is handed back to give to them;
    //   * without one, the invitation is recorded and the profile is created
    //     by public.claim_staff_invitation the first time they sign in.
    if (action === "create_staff") {
      const displayName = required(body.displayName, "Full name");
      const address = email(body.email);
      const level = staffLevel(body.level, session.identity.role);
      const branchId = optionalUuid(body.branchId) ?? session.identity.branchId;
      const department = optional(body.department);
      const roleId = optionalUuid(body.roleId) ?? (await defaultRoleId(level, org, token));

      const existing = await get(
        `profiles?select=id&organisation_id=eq.${org}&email=eq.${encodeURIComponent(address)}&limit=1`,
        token,
      ) as Json[];
      if (existing.length)
        throw new InputError("Somebody with that email address is already on the team.");

      if (!serviceRoleKey()) {
        await insert("staff_invitations", {
          id: crypto.randomUUID(), organisation_id: org, email: address,
          role_id: roleId, branch_id: branchId, display_name: displayName,
          department, level, invited_by: session.identity.profileId,
          status: "pending",
        }, token);
        return appendRefreshCookies(Response.json({
          ok: true,
          created: "invitation",
          email: address,
          message: `${displayName} is invited. Create the Supabase login for ${address} (Authentication -> Users -> Add user), and their CRM account is set up the first time they sign in.`,
        }), session.refreshed, request);
      }

      // A password they must change, generated here and shown once.
      const temporaryPassword = temporary();
      let created: { id?: string };
      try {
        created = await supabaseAdminRequest<{ id?: string }>("/auth/v1/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: address, password: temporaryPassword, email_confirm: true,
          }),
        });
      } catch (error) {
        if (error instanceof SupabaseError && error.status === 422)
          throw new InputError("That email address already has a login. Invite them instead, or ask them to sign in so their account is linked.");
        throw error;
      }
      if (!created?.id)
        throw new InputError("The login was not created, so no staff account was made.");

      try {
        await insert("profiles", {
          id: created.id, organisation_id: org, branch_id: branchId,
          display_name: displayName, email: address, level,
          department, active: true,
        }, token);
      } catch (error) {
        // Leaving a login with no profile behind would block that person from
        // ever being added again, so it is removed with the failure.
        await supabaseAdminRequest(`/auth/v1/admin/users/${created.id}`, { method: "DELETE" })
          .catch(() => undefined);
        throw error;
      }
      if (roleId)
        await insert("profile_roles", {
          profile_id: created.id, role_id: roleId, branch_id: branchId,
        }, token, "resolution=merge-duplicates,return=minimal").catch(() => undefined);

      return appendRefreshCookies(Response.json({
        ok: true,
        created: "account",
        email: address,
        temporaryPassword,
        message: `${displayName} can sign in now. Give them this one-time password and ask them to change it.`,
      }), session.refreshed, request);
    }

    if (action === "revoke_invitation") {
      await patch("staff_invitations", uuid(body.invitationId, "Invitation"),
        { status: "revoked" }, token);
    } else if (action === "create_invitation") {
      const roleId = uuid(body.roleId, "Role");
      // Defaults to the inviter's own branch, so an invited person lands
      // somewhere rather than in no branch at all.
      const branchId = optionalUuid(body.branchId) ?? session.identity.branchId;
      await insert("staff_invitations", { id: crypto.randomUUID(), organisation_id: org, email: email(body.email), role_id: roleId, branch_id: branchId, display_name: optional(body.displayName), department: optional(body.department), level: optional(body.level), invited_by: session.identity.profileId, status: "pending" }, token);
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

// A branch manager builds their own team; only a Super Admin makes another
// administrator. The database enforces the same rule on the level column.
function staffLevel(value: unknown, actor: string) {
  const level = optional(value) ?? "staff";
  if (!["super_admin", "branch_admin", "manager", "staff", "partner", "student"].includes(level))
    throw new InputError("Account level is invalid.");
  // A client portal login is not an administrator account, so a branch manager
  // can create one for their own client.
  if (actor !== "super_admin" && !["staff", "partner", "student"].includes(level))
    throw new LiveAccessError(403, "Only a Super Admin can create an administrator account.");
  return level;
}

/** The organisation's role matching this level, so permissions are not empty. */
async function defaultRoleId(level: string, org: string, token: string) {
  const rows = await get(
    `roles?select=id&organisation_id=eq.${org}&level=eq.${encodeURIComponent(level)}&order=system_role.desc&limit=1`,
    token,
  ) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

/** A one-time password: long, random, and shown to the administrator once. */
function temporary() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
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
