import {
  ACCESS_COOKIE,
  isSecureRequest,
  REFRESH_COOKIE,
  readCookie,
  sessionCookieHeaders,
  SupabaseError,
  supabaseRequest,
  type SupabaseSession,
} from "@/server/supabase";

export type LiveRole = "super_admin" | "admin" | "staff" | "client";
export type LiveIdentity = {
  profileId: string;
  organisationId: string;
  branchId: string | null;
  displayName: string;
  email: string;
  department: string | null;
  sourceLevel: string;
  role: LiveRole;
};

type ProfileRow = {
  id: string;
  organisation_id: string;
  branch_id: string | null;
  display_name: string;
  email: string;
  level: string;
  department: string | null;
  active: boolean;
};

export async function liveSession(
  request: Request,
): Promise<{
  accessToken: string;
  identity: LiveIdentity;
  refreshed?: SupabaseSession;
}> {
  let accessToken = readCookie(request, ACCESS_COOKIE);
  let refreshed: SupabaseSession | undefined;
  if (!accessToken) {
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (!refreshToken) throw new LiveAccessError(401, "Sign in is required.");
    refreshed = await refreshSession(refreshToken);
    accessToken = refreshed.access_token;
  }

  let user: { id: string; email?: string };
  try {
    user = await supabaseRequest(
      "/auth/v1/user",
      { method: "GET" },
      accessToken,
    );
  } catch (error) {
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    if (
      !(error instanceof SupabaseError) ||
      error.status !== 401 ||
      !refreshToken
    )
      throw new LiveAccessError(401, "Your session has expired.");
    refreshed = await refreshSession(refreshToken);
    accessToken = refreshed.access_token;
    user = await supabaseRequest(
      "/auth/v1/user",
      { method: "GET" },
      accessToken,
    );
  }

  // Somebody an administrator invited, signing in for the first time, has no
  // profile until now: its id has to be the id of the Supabase login they have
  // only just been given. profileForUser creates it from their invitation.
  const profile = await profileForUser(accessToken, user.id);

  if (!profile)
    throw new LiveAccessError(
      403,
      "This account is not linked to a Maximus CRM profile, and there is no invitation for it. Ask an administrator to add you under Staff & Masters.",
    );
  if (!profile.active)
    throw new LiveAccessError(
      403,
      "This Maximus CRM account has been deactivated. Ask an administrator to reactivate it.",
    );
  return { accessToken, identity: mapIdentity(profile), refreshed };
}

/**
 * The caller's CRM profile, creating it from an invitation if this is the first
 * time they have signed in. Both the sign-in route and every authenticated
 * request go through here, so an invited person is set up whichever they reach
 * first.
 */
export async function profileForUser(
  accessToken: string,
  userId: string,
): Promise<ProfileRow | undefined> {
  const rows = await supabaseRequest<ProfileRow[]>(
    `/rest/v1/profiles?select=id,organisation_id,branch_id,display_name,email,level,department,active&id=eq.${encodeURIComponent(userId)}&limit=1`,
    { method: "GET" },
    accessToken,
  );
  return rows[0] ?? (await claimInvitation(accessToken));
}

/**
 * Returns the profile created from a pending invitation, or undefined when
 * there is none. A database that has not had the migration applied yet, or any
 * other failure, is treated the same way: no profile, and the caller reports
 * that plainly rather than crashing on a sign-in.
 */
async function claimInvitation(
  accessToken: string,
): Promise<ProfileRow | undefined> {
  try {
    const claimed = await supabaseRequest<ProfileRow | ProfileRow[]>(
      "/rest/v1/rpc/claim_staff_invitation",
      { method: "POST", body: "{}" },
      accessToken,
    );
    const row = Array.isArray(claimed) ? claimed[0] : claimed;
    return row?.id ? row : undefined;
  } catch {
    return undefined;
  }
}

export function appendRefreshCookies(
  response: Response,
  refreshed?: SupabaseSession,
  request?: Request,
): Response {
  if (!refreshed) return response;
  const headers = new Headers(response.headers);
  const secure = request ? isSecureRequest(request) : true;
  sessionCookieHeaders(refreshed, secure).forEach((value) =>
    headers.append("Set-Cookie", value),
  );
  return new Response(response.body, { status: response.status, headers });
}

export class LiveAccessError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

function mapIdentity(profile: ProfileRow): LiveIdentity {
  const role: LiveRole =
    profile.level === "student"
      ? "client"
      : profile.level === "staff" || profile.level === "partner"
        ? "staff"
        : profile.level === "branch_admin" || profile.level === "manager"
          ? "admin"
          : "super_admin";
  return {
    profileId: profile.id,
    organisationId: profile.organisation_id,
    branchId: profile.branch_id,
    displayName: profile.display_name,
    email: profile.email,
    department: profile.department,
    sourceLevel: profile.level,
    role,
  };
}

async function refreshSession(refreshToken: string): Promise<SupabaseSession> {
  try {
    return await supabaseRequest<SupabaseSession>(
      "/auth/v1/token?grant_type=refresh_token",
      { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }) },
    );
  } catch {
    throw new LiveAccessError(
      401,
      "Your session has expired. Please sign in again.",
    );
  }
}
