import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
  type LiveIdentity,
} from "@/server/supabase-session";
import {
  serviceRoleKey,
  SupabaseError,
  supabaseAdminRequest,
  supabaseRequest,
} from "@/server/supabase";
import { isRemovedStaffAccount } from "@/lib/staff-account";
import { findAccountByEmail, sendAccountSetup } from "@/server/account-access";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    requireAdmin(session.identity.role);
    const token = session.accessToken;
    const [profiles, roles, permissions, invitations, branches, clientLinks, settings] = await Promise.all([
      get("profiles?select=id,display_name,email,level,department,branch_id,active,created_at&order=display_name.asc", token),
      get("roles?select=*&order=system_role.desc,name.asc", token),
      get("permissions?select=*&order=resource.asc,action.asc", token),
      get("staff_invitations?select=*&order=created_at.desc", token),
      get("branches?select=*&order=name.asc", token),
      get("client_user_links?select=profile_id,client_id,created_at", token),
      get("organisation_settings?select=*&limit=1", token).catch(() => []),
    ]);
    return appendRefreshCookies(Response.json({ ok: true, profiles: (profiles as Json[]).filter(person => !isRemovedStaffAccount(person)), roles, permissions, invitations, branches, clientLinks, settings: (settings as Json[])[0] ?? null }), session.refreshed, request);
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

    const deliverAccess = async (address: string, name: string, resourceId: string, invitation = false) => {
      const delivery = await sendAccountSetup({ email: address, name, origin: new URL(request.url).origin, invitation });
      await insert("audit_events", {
        organisation_id: org, actor_id: session.identity.profileId,
        action: delivery.emailSent ? "account.setup_email_requested" : "account.setup_email_failed",
        resource_type: invitation ? "staff_invitation" : "profile", resource_id: resourceId,
        summary: delivery.emailSent ? `Account setup email submitted for ${name}` : `Account setup email failed for ${name}`,
        after_data: { delivery_status: delivery.deliveryStatus, branch_id: session.identity.branchId },
      }, token);
      return { ...delivery, email: address, message: delivery.emailSent
        ? `Account setup email submitted to ${address}. They can choose their password using the link in that email.`
        : `The account is ready, but the email was not sent. ${delivery.deliveryError}` };
    };

    if (action === "resend_account_email") {
      const target = uuid(body.profileId, "Account");
      const [person] = await get(`profiles?select=id,email,display_name,branch_id,level,active&organisation_id=eq.${org}&id=eq.${target}&limit=1`, token) as Json[];
      if (!person) throw new LiveAccessError(403, "That account is not available to you.");
      assertManagedBranch(session.identity, person.branch_id as string | null, "send account emails");
      staffLevel(person.level, session.identity.role);
      if (!person.active) throw new InputError("Reactivate this account before sending access.");
      return appendRefreshCookies(Response.json({ ok: true, ...await deliverAccess(email(person.email), String(person.display_name || person.email), target) }), session.refreshed, request);
    }

    // Adding a member of staff. A profile's id has to be the id of that
    // person's Supabase login, which does not exist yet, so there are two
    // routes and the deployment decides which is available:
    //
    //   * with a service-role key, the login and the profile are created here
    //     and a secure password-setup email is sent directly to them;
    //   * without one, the invitation is recorded and the profile is created
    //     by public.claim_staff_invitation the first time they sign in.
    if (action === "create_staff") {
      const displayName = required(body.displayName, "Full name");
      const address = email(body.email);
      const level = staffLevel(body.level, session.identity.role);
      const branchId = optionalUuid(body.branchId) ?? session.identity.branchId;
      assertManagedBranch(session.identity, branchId, "create staff");
      if (level !== "super_admin" && !branchId) throw new InputError("Choose the branch this account belongs to.");
      if (branchId) {
        const branches = await get(`branches?select=id&organisation_id=eq.${org}&id=eq.${branchId}&limit=1`, token) as Json[];
        if (!branches.length) throw new InputError("Choose a branch in your organisation.");
      }
      const department = optional(body.department);
      const roleId = optionalUuid(body.roleId) ?? (await defaultRoleId(level, org, token));

      const existing = await get(
        `profiles?select=id,email,active,level&organisation_id=eq.${org}&email=eq.${encodeURIComponent(address)}&limit=1`,
        token,
      ) as Json[];
      if (existing.length) return appendRefreshCookies(Response.json({
        ok: false,
        error: existing[0].active
          ? `An active ${existing[0].level === "student" ? "client login" : "staff account"} already uses this email. Manage it in ${existing[0].level === "student" ? "Client logins" : "Team"} below.`
          : "This email belongs to a deactivated account. Reactivate it, or delete the account below before creating a fresh one.",
        existingAccount: { profileId: existing[0].id, email: address, level: existing[0].level, active: existing[0].active },
      }, { status: 409 }), session.refreshed, request);

      // Records an invitation rather than a login: used both when this
      // deployment has no service-role key at all, and when it does but the
      // person already has a Supabase login -- a client demo account, most
      // often, created before anyone thought to give it a CRM profile.
      // claim_staff_invitation does not care which came first; it only needs
      // a pending invitation addressed to the email the caller signs in with.
      const recordInvitation = async () => {
        const invitationId = crypto.randomUUID();
        await insert("staff_invitations", {
          id: invitationId, organisation_id: org, email: address,
          role_id: roleId, branch_id: branchId, display_name: displayName,
          department, level, invited_by: session.identity.profileId,
          status: "pending",
        }, token);
        return appendRefreshCookies(Response.json({
          ok: true,
          created: "invitation",
          ...await deliverAccess(address, displayName, invitationId, true),
        }), session.refreshed, request);
      };

      if (!serviceRoleKey()) return await recordInvitation();

      // The random password is never disclosed. The staff member receives a
      // one-time recovery/setup link and chooses their own password.
      const temporaryPassword = temporary();
      let created: { id?: string };
      let connectedExisting = false;
      try {
        created = await supabaseAdminRequest<{ id?: string }>("/auth/v1/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: address, password: temporaryPassword, email_confirm: true,
          }),
        });
      } catch (error) {
        // That address already has a Supabase login -- exactly the shape of a
        // client demo account that was never given a CRM profile. It is
        // connected directly here rather than by recording an invitation and
        // waiting for that login to sign itself in, which never happens if
        // nobody holds its password -- exactly the dead end this replaces.
        if (!(error instanceof SupabaseError) || error.status !== 422) throw error;
        const existingId = (await findAccountByEmail(address))?.id;
        if (!existingId) return await recordInvitation();
        created = { id: existingId };
        connectedExisting = true;
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
        // ever being added again, so a login created here is removed with the
        // failure. A pre-existing login is never touched -- it is not ours to
        // delete.
        if (!connectedExisting)
          await supabaseAdminRequest(`/auth/v1/admin/users/${created.id}`, { method: "DELETE" })
            .catch(() => undefined);
        throw error;
      }
      if (roleId)
        await insert("profile_roles", {
          profile_id: created.id, role_id: roleId, branch_id: branchId,
        }, token, "resolution=merge-duplicates,return=minimal").catch(() => undefined);

      const delivery = await deliverAccess(address, displayName, created.id);
      return appendRefreshCookies(Response.json({
        ok: true, created: connectedExisting ? "connected" : "account",
        profileId: created.id, ...delivery,
      }), session.refreshed, request);
    }

    if (action === "revoke_invitation") {
      const invitationId = uuid(body.invitationId, "Invitation");
      await assertInvitationBranch(invitationId, session.identity, token);
      await patch("staff_invitations", invitationId,
        { status: "revoked" }, token);
    } else if (action === "resend_invitation") {
      // Whatever state it was in -- still pending, revoked, or expired -- a
      // resend puts it back in front of that person with a fresh week to
      // accept it.
      const invitationId = uuid(body.invitationId, "Invitation");
      await assertInvitationBranch(invitationId, session.identity, token);
      await patch("staff_invitations", invitationId, {
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, token);
      const [invitation] = await get(`staff_invitations?select=email,display_name&id=eq.${invitationId}&limit=1`, token) as Json[];
      if (!invitation) throw new InputError("That invitation no longer exists.");
      return appendRefreshCookies(Response.json({ ok: true, ...await deliverAccess(email(invitation.email), String(invitation.display_name || invitation.email), invitationId, true) }), session.refreshed, request);
    } else if (action === "create_invitation") {
      const roleId = uuid(body.roleId, "Role");
      // Defaults to the inviter's own branch, so an invited person lands
      // somewhere rather than in no branch at all.
      const branchId = optionalUuid(body.branchId) ?? session.identity.branchId;
      assertManagedBranch(session.identity, branchId, "create invitations");
      const invitationId = crypto.randomUUID();
      const address = email(body.email);
      const [role] = await get(`roles?select=id,level&organisation_id=eq.${org}&id=eq.${roleId}&limit=1`, token) as Json[];
      if (!role) throw new InputError("Choose a role in your organisation.");
      const level = staffLevel(body.level || role.level, session.identity.role);
      if (role.level !== level) throw new InputError("Choose a role matching the account level.");
      if (!branchId && level !== "super_admin") throw new InputError("Choose the account's branch.");
      await insert("staff_invitations", { id: invitationId, organisation_id: org, email: address, role_id: roleId, branch_id: branchId, display_name: optional(body.displayName), department: optional(body.department), level, invited_by: session.identity.profileId, status: "pending" }, token);
      return appendRefreshCookies(Response.json({ ok: true, ...await deliverAccess(address, optional(body.displayName) || address, invitationId, true) }), session.refreshed, request);
    } else if (action === "bulk_update_profiles") {
      const targets = uuidList(body.profileIds, "Staff accounts");
      const changes: Json = {};
      if (typeof body.branchId === "string" || body.branchId === null)
        changes.branch_id = optionalUuid(body.branchId);
      if (Object.hasOwn(changes, "branch_id"))
        assertManagedBranch(session.identity, changes.branch_id as string | null, "move staff");
      if (typeof body.active === "boolean") changes.active = body.active;
      if (Object.keys(changes).length === 0)
        throw new InputError("Choose a branch or account status to change.");
      let succeeded = 0;
      const errors: string[] = [];
      for (const target of targets) {
        try {
          if (target === session.identity.profileId)
            throw new InputError("Your own account was not changed.");
          const [person] = await get(
            `profiles?select=id,email,level,active,branch_id&id=eq.${target}&limit=1`,
            token,
          ) as { id: string; email: string; level: string; active: boolean; branch_id: string | null }[];
          if (!person || isRemovedStaffAccount(person)) throw new InputError("A selected staff account was deleted and cannot be reactivated.");
          assertManagedBranch(session.identity, person.branch_id, "manage staff");
          // Super Admin deactivation stays an individual action so the existing
          // last-administrator protection cannot be bypassed by a group edit.
          if (changes.active === false && person.level === "super_admin")
            throw new InputError("Super Admin accounts must be deactivated individually.");
          await patch("profiles", target, changes, token);
          succeeded += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "A staff account could not be changed.");
        }
      }
      return appendRefreshCookies(Response.json({
        ok: succeeded > 0,
        succeeded,
        failed: targets.length - succeeded,
        errors: Array.from(new Set(errors)).slice(0, 3),
        error: succeeded > 0 ? undefined : errors[0],
        message: `${succeeded} staff account${succeeded === 1 ? "" : "s"} updated${targets.length - succeeded ? `; ${targets.length - succeeded} could not be changed.` : "."}`,
      }, { status: succeeded > 0 ? 200 : 400 }), session.refreshed, request);
    } else if (action === "update_profile") {
      const target = uuid(body.profileId, "Profile");
      if (target === session.identity.profileId && body.active === false) throw new InputError("You cannot deactivate your own account.");
      const [managedProfile] = await get(
        `profiles?select=id,email,branch_id&id=eq.${target}&limit=1`,
        token,
      ) as { id: string; email: string; branch_id: string | null }[];
      if (!managedProfile) throw new LiveAccessError(403, "That staff account is outside your branch.");
      if (isRemovedStaffAccount(managedProfile)) throw new InputError("This account was deleted. Create a fresh account instead.");
      assertManagedBranch(session.identity, managedProfile.branch_id, "manage staff");
      const changes: Json = {};
      if (typeof body.displayName === "string") changes.display_name = required(body.displayName, "Display name");
      if (typeof body.department === "string" || body.department === null) changes.department = optional(body.department);
      if (typeof body.branchId === "string" || body.branchId === null) {
        changes.branch_id = optionalUuid(body.branchId);
        assertManagedBranch(session.identity, changes.branch_id as string | null, "move staff");
      }
      if (typeof body.active === "boolean") changes.active = body.active;
      if (body.level) {
        if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Only a Super Admin can change account levels.");
        const level = required(body.level, "Level");
        if (!["super_admin","branch_admin","manager","staff","partner","student"].includes(level)) throw new InputError("Account level is invalid.");
        changes.level = level;
      }
      // Deactivating or demoting the organisation's last active Super Admin
      // would lock everyone out of administration -- nobody left who could
      // undo it. Checked here, against the row as it stands right now, rather
      // than left to whoever notices the organisation has gone unmanageable.
      if (changes.active === false || (changes.level && changes.level !== "super_admin")) {
        const [targetRow] = await get(
          `profiles?select=level,active&id=eq.${target}&limit=1`,
          token,
        ) as { level: string; active: boolean }[];
        if (targetRow?.level === "super_admin" && targetRow.active) {
          const remaining = await get(
            `profiles?select=id&organisation_id=eq.${org}&level=eq.super_admin&active=eq.true&id=neq.${target}`,
            token,
          ) as { id: string }[];
          if (remaining.length === 0)
            throw new InputError(
              "This is the organisation's last Super Admin. Promote someone else to Super Admin first.",
            );
        }
      }
      await patch("profiles", target, changes, token);
    } else if (action === "remove_client_account") {
      if (session.identity.role !== "super_admin")
        throw new LiveAccessError(403, "Only a Super Admin can remove a client login.");
      if (!serviceRoleKey()) throw new InputError("Account removal requires the Supabase service-role connection.");
      const target = uuid(body.profileId, "Profile");
      if (target === session.identity.profileId) throw new InputError("You cannot remove your own account.");
      // Authorize through the caller's RLS scope before any elevated cleanup.
      const [person] = await get(`profiles?select=id,display_name,email,level,active,branch_id&organisation_id=eq.${org}&id=eq.${target}&limit=1`, token) as Json[];
      if (!person || person.level !== "student") throw new InputError("That client login is not available.");
      if (isRemovedStaffAccount(person)) return appendRefreshCookies(Response.json({ ok: true, removedProfileId: target, message: "This account has already been deleted." }), session.refreshed, request);
      if (person.active !== false) throw new InputError("Deactivate this client login before deleting it.");
      try {
        // Soft-delete Auth to revoke access and release the email without
        // cascading through historical profile references. Every cleanup is
        // scoped to the verified account and safe to retry. Retire the profile
        // last, so incomplete removals remain visible for an administrator.
        await supabaseAdminRequest(`/auth/v1/admin/users/${target}`, {
          method: "DELETE", body: JSON.stringify({ should_soft_delete: true }),
        });
        for (const path of [
          `client_user_links?profile_id=eq.${target}`,
          `profile_roles?profile_id=eq.${target}`,
          `mailbox_connections?organisation_id=eq.${org}&profile_id=eq.${target}`,
          `staff_invitations?organisation_id=eq.${org}&email=eq.${encodeURIComponent(String(person.email))}`,
        ]) await supabaseAdminRequest(`/rest/v1/${path}`, { method: "DELETE" });
        await insert("audit_events", {
          organisation_id: org, actor_id: session.identity.profileId,
          action: "client.account_removed", resource_type: "profile", resource_id: target,
          summary: `Removed ${String(person.display_name)}'s client login; client files and history retained.`,
          after_data: { branch_id: person.branch_id },
        }, token);
        await supabaseAdminRequest(`/rest/v1/profiles?organisation_id=eq.${org}&id=eq.${target}`, {
          method: "PATCH", body: JSON.stringify({ email: `removed+${target}@accounts.invalid`, active: false, branch_id: null, department: null }),
        });
      } catch {
        throw new InputError("The client login is deactivated, but permanent deletion did not finish. Retry Delete account to complete it; its client files and case history are safe.");
      }
      return appendRefreshCookies(Response.json({ ok: true, removedProfileId: target,
        message: `${String(person.display_name)}'s client login was deleted. You can now create a fresh account with ${String(person.email)}.`,
      }), session.refreshed, request);
    } else if (action === "remove_staff") {
      if (session.identity.role !== "super_admin")
        throw new LiveAccessError(403, "Only a Super Admin can remove a staff account.");
      if (!serviceRoleKey())
        throw new InputError("Permanent staff removal requires the Supabase service-role connection.");
      const target = uuid(body.profileId, "Profile");
      if (target === session.identity.profileId)
        throw new InputError("You cannot remove your own account.");
      const [person] = await get(
        `profiles?select=id,display_name,email,level,active,branch_id&organisation_id=eq.${org}&id=eq.${target}&limit=1`, token,
      ) as Json[];
      if (!person || person.level === "student") throw new InputError("That staff account is not available.");
      if (isRemovedStaffAccount(person)) return appendRefreshCookies(Response.json({ ok: true, removedProfileId: target, message: "This account has already been deleted." }), session.refreshed, request);
      if (person.level === "super_admin" || person.level === "platform_owner") {
        const remaining = await get(
          `profiles?select=id&organisation_id=eq.${org}&level=eq.super_admin&active=eq.true&id=neq.${target}`, token,
        ) as Json[];
        if (!remaining.length) throw new InputError("Promote another Super Admin before deleting this account.");
      }
      const replacement = optionalUuid(body.replacementProfileId);
      if (replacement) {
        const [colleague] = await get(`profiles?select=id,branch_id,active,level&organisation_id=eq.${org}&id=eq.${replacement}&limit=1`, token) as Json[];
        if (!colleague || !colleague.active || colleague.id === target || colleague.level === "student" || colleague.branch_id !== person.branch_id)
          throw new InputError("Choose an active colleague in the same branch for the handover.");
        await supabaseRequest("/rest/v1/rpc/transfer_staff_ownership", {
          method: "POST", body: JSON.stringify({ p_from: target, p_to: replacement }),
        }, token);
      }
      const assigned = await get(
        `cases?select=id&organisation_id=eq.${org}&or=(owner_id.eq.${target},supervisor_id.eq.${target})&closed_at=is.null&limit=1`, token,
      ) as Json[];
      if (assigned.length) throw new InputError("Choose a colleague to take over this staff member's open cases before deleting the account.");

      // Stop CRM access before touching Auth. If any later step fails, this
      // inactive row stays visible so the owner can retry the same deletion.
      await patch("profiles", target, { active: false }, token);
      try {
        // Supabase's irreversible soft deletion revokes sessions, removes
        // login identities and frees the address without cascading through
        // the historical profile foreign keys. A ban/rename alone does not.
        await supabaseAdminRequest(`/auth/v1/admin/users/${target}`, {
          method: "DELETE", body: JSON.stringify({ should_soft_delete: true }),
        });
        await supabaseRequest("/rest/v1/rpc/retire_staff_profile", {
          method: "POST", body: JSON.stringify({ p_profile_id: target, p_replacement_profile_id: replacement }),
        }, token);
      } catch {
        throw new InputError("The account is deactivated, but permanent deletion did not finish. Retry Delete account to complete it; its case history is safe.");
      }
      return appendRefreshCookies(Response.json({
        ok: true, removedProfileId: target,
        message: `${String(person.display_name)}'s account was deleted. You can now create a fresh account with ${String(person.email)}.`,
      }), session.refreshed, request);
    } else if (action === "update_settings") {
      if (session.identity.role !== "super_admin")
        throw new LiveAccessError(403, "Only a Super Admin can change master configuration.");
      const value = {
        organisation_id: org,
        timezone: required(body.timezone, "Timezone"),
        default_currency: currency(body.defaultCurrency),
        tax_label: required(body.taxLabel, "Tax label"),
        tax_rate: boundedNumber(body.taxRate, "Tax rate", 0, 1),
        invoice_prefix: prefix(body.invoicePrefix, "Invoice prefix"),
        receipt_prefix: prefix(body.receiptPrefix, "Receipt prefix"),
        credit_note_prefix: prefix(body.creditNotePrefix, "Credit-note prefix"),
        payment_terms_days: boundedNumber(body.paymentTermsDays, "Payment terms", 0, 365),
        overdue_reminders_enabled: body.overdueRemindersEnabled !== false,
        appointment_duration_minutes: boundedNumber(body.appointmentDurationMinutes, "Appointment duration", 15, 480),
        updated_by: session.identity.profileId,
        updated_at: new Date().toISOString(),
      };
      await supabaseRequest("/rest/v1/organisation_settings?on_conflict=organisation_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(value),
      }, token);
    } else if (action === "assign_role") {
      if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Only a Super Admin can assign roles.");
      await insert("profile_roles", { profile_id: uuid(body.profileId, "Profile"), role_id: uuid(body.roleId, "Role"), branch_id: uuid(body.branchId, "Branch") }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "set_permission") {
      if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Only a Super Admin can change permissions.");
      await insert("permissions", { id: crypto.randomUUID(), role_id: uuid(body.roleId, "Role"), resource: slug(body.resource, "Resource"), action: slug(body.permissionAction, "Permission action"), field_mask: isObject(body.fieldMask) ? body.fieldMask : {} }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "create_branch") {
      // Opening a new branch is an organisation-structural decision, not a
      // branch manager's own patch, so it stays with whoever runs the whole
      // organisation.
      if (session.identity.role !== "super_admin") throw new LiveAccessError(403, "Only a Super Admin can add a branch.");
      await insert("branches", { id: crypto.randomUUID(), organisation_id: org, name: required(body.name, "Branch name"), code: required(body.code, "Branch code").toUpperCase(), country_code: required(body.countryCode, "Country").toUpperCase(), active: true }, token);
    } else if (action === "update_branch") {
      const changes: Json = {};
      if (body.name) changes.name = required(body.name, "Branch name");
      if (typeof body.active === "boolean") changes.active = body.active;
      const branchId = uuid(body.branchId, "Branch");
      assertManagedBranch(session.identity, branchId, "change a branch");
      await patch("branches", branchId, changes, token);
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

/** An undisclosed random initial password; the recipient chooses their own. */
function temporary() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function requireAdmin(role: string) { if (role !== "super_admin" && role !== "admin") throw new LiveAccessError(403, "Administrator access is required."); }
function assertManagedBranch(identity: LiveIdentity, branchId: string | null, action: string) {
  if (identity.role === "super_admin") return;
  if (!identity.branchId || branchId !== identity.branchId)
    throw new LiveAccessError(403, `A Branch Admin can only ${action} within their own branch.`);
}
async function assertInvitationBranch(
  invitationId: string,
  identity: LiveIdentity,
  token: string,
) {
  if (identity.role === "super_admin") return;
  const [invitation] = await get(
    `staff_invitations?select=id,branch_id&id=eq.${invitationId}&limit=1`,
    token,
  ) as { id: string; branch_id: string | null }[];
  if (!invitation) throw new LiveAccessError(403, "That invitation is outside your branch.");
  assertManagedBranch(identity, invitation.branch_id, "manage invitations");
}
async function get(query: string, token: string) { return supabaseRequest(`/rest/v1/${query}`, { method: "GET" }, token); }
async function insert(table: string, value: Json, token: string, prefer = "return=minimal") { await supabaseRequest(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(value) }, token); }
// PostgREST answers 204 when row-level security hid every row the filter
// matched, so a write RLS actually refused comes back looking like success.
// Asking for the row back turns that into the refusal it always was.
async function patch(table: string, id: string, value: Json, token: string) {
  const updated = await supabaseRequest<Json[]>(
    `/rest/v1/${table}?id=eq.${id}&select=id`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(value) },
    token,
  );
  if (!Array.isArray(updated) || updated.length === 0)
    throw new LiveAccessError(403, "That record is not yours to change.");
}
function optional(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function required(value: unknown, label: string) { const parsed = optional(value); if (!parsed) throw new InputError(`${label} is required.`); return parsed; }
function uuid(value: unknown, label: string) { const parsed = required(value, label); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new InputError(`${label} is invalid.`); return parsed; }
function uuidList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0) throw new InputError(`Select at least one ${label.toLowerCase()}.`);
  if (value.length > 100) throw new InputError("Bulk actions are limited to 100 accounts at a time.");
  return Array.from(new Set(value.map((item) => uuid(item, label))));
}
function optionalUuid(value: unknown) { const parsed = optional(value); return parsed ? uuid(parsed, "Identifier") : null; }
function email(value: unknown) { const parsed = required(value, "Email").toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed) || parsed.endsWith("@accounts.invalid")) throw new InputError("Email is invalid."); return parsed; }
function currency(value: unknown) { const parsed = required(value, "Currency").toUpperCase(); if (!/^[A-Z]{3}$/.test(parsed)) throw new InputError("Currency must be a three-letter code."); return parsed; }
function prefix(value: unknown, label: string) { const parsed = required(value, label).toUpperCase(); if (!/^[A-Z0-9-]{1,12}$/.test(parsed)) throw new InputError(`${label} may contain letters, numbers and hyphens only.`); return parsed; }
function boundedNumber(value: unknown, label: string, minimum: number, maximum: number) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new InputError(`${label} must be between ${minimum} and ${maximum}.`); return parsed; }
function slug(value: unknown, label: string) { const parsed = required(value, label).toLowerCase().replace(/[^a-z0-9_]+/g, "_"); if (!parsed) throw new InputError(`${label} is invalid.`); return parsed; }
function isObject(value: unknown): value is Json { return typeof value === "object" && value !== null && !Array.isArray(value); }
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this administration action." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error); return Response.json({ ok: false, error: "The administration action could not be completed." }, { status: 500 });
}
