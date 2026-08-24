import {
  clientIp,
  isSecureRequest,
  jsonWithCookies,
  sessionCookieHeaders,
  SupabaseError,
  supabaseRequest,
  type SupabaseSession,
} from "@/server/supabase";
import { profileForUser } from "@/server/supabase-session";

export const dynamic = "force-dynamic";

type LockStatus = { locked: boolean; retry_after_seconds: number };
const OPEN: LockStatus = { locked: false, retry_after_seconds: 0 };

// Slowing down guessing is a defence-in-depth measure, not the thing that
// makes sign-in correct: if the rate-limit RPC itself cannot be reached --
// migration 0023 not yet applied, a transient Supabase hiccup -- sign-in
// must still work. So a failure here is logged and treated as "not locked"
// rather than allowed to take sign-in down with it.
async function lockStatus(identifier: string): Promise<LockStatus> {
  try {
    const [status] = await supabaseRequest<LockStatus[]>(
      "/rest/v1/rpc/login_lock_status",
      { method: "POST", body: JSON.stringify({ p_identifier: identifier }) },
    );
    return status ?? OPEN;
  } catch (error) {
    console.error("login_lock_status unavailable", error);
    return OPEN;
  }
}

async function recordAttempt(identifier: string, success: boolean): Promise<LockStatus> {
  try {
    const [status] = await supabaseRequest<LockStatus[]>(
      "/rest/v1/rpc/record_login_attempt",
      { method: "POST", body: JSON.stringify({ p_identifier: identifier, p_success: success }) },
    );
    return status ?? OPEN;
  } catch (error) {
    console.error("record_login_attempt unavailable", error);
    return OPEN;
  }
}

const lockedResponse = (status: LockStatus) =>
  Response.json(
    {
      ok: false,
      error: `Too many attempts. Try again in ${Math.max(1, Math.ceil(status.retry_after_seconds / 60))} minute(s).`,
    },
    { status: 429, headers: { "Retry-After": String(Math.max(1, status.retry_after_seconds)) } },
  );

export async function POST(request: Request) {
  let attemptedEmail = "";
  let identifiers: string[] = [];
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 16_384)
      return Response.json({ ok: false, error: "Request is too large." }, { status: 413 });
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim().toLowerCase();
    attemptedEmail = email ?? "";
    const password = body.password ?? "";
    if (!email || !password)
      return Response.json(
        { ok: false, error: "Email and password are required." },
        { status: 400 },
      );
    if (email.length > 254 || password.length > 256)
      return Response.json(
        { ok: false, error: "The login details are invalid." },
        { status: 400 },
      );

    // Guessing is slowed down by email and by IP, so an attacker gains
    // nothing by rotating which they hammer: either one being locked stops
    // the attempt before Supabase's own auth endpoint is ever called.
    identifiers = [`email:${email}`, `ip:${clientIp(request)}`];
    for (const identifier of identifiers) {
      const status = await lockStatus(identifier);
      if (status.locked) return lockedResponse(status);
    }

    let session: SupabaseSession;
    try {
      session = await supabaseRequest<SupabaseSession>(
        "/auth/v1/token?grant_type=password",
        { method: "POST", body: JSON.stringify({ email, password }) },
      );
    } catch (error) {
      if (error instanceof SupabaseError && (error.status === 400 || error.status === 401)) {
        let latest: LockStatus = { locked: false, retry_after_seconds: 0 };
        for (const identifier of identifiers) latest = await recordAttempt(identifier, false);
        if (latest.locked) return lockedResponse(latest);
      }
      throw error;
    }
    // A password Supabase accepted is not a guess in progress, whatever this
    // login goes on to say about a CRM profile.
    for (const identifier of identifiers) await recordAttempt(identifier, true);

    // Creates the profile from an invitation if this is their first sign-in,
    // which is the only moment it can be created: a profile's id has to be the
    // id of this Supabase login.
    const profile = await profileForUser(session.access_token, session.user.id);
    if (!profile)
      return Response.json(
        {
          ok: false,
          error:
            "Your login exists, but it is not linked to a Maximus CRM account, and there is no invitation for it. Ask an administrator to add you under Staff & Masters.",
        },
        { status: 403 },
      );
    if (!profile.active)
      return Response.json(
        {
          ok: false,
          error:
            "Your Maximus CRM account has been deactivated. Contact a Maximus administrator.",
        },
        { status: 403 },
      );
    return jsonWithCookies(
      { ok: true },
      200,
      sessionCookieHeaders(session, isSecureRequest(request)),
    );
  } catch (error) {
    if (
      error instanceof SupabaseError &&
      (error.status === 400 || error.status === 401)
    ) {
      return Response.json(
        {
          ok: false,
          error: attemptedEmail.endsWith("@demo.maximuseducation.com.au")
            ? "This demo account has not been activated in Supabase yet."
            : "The email or password is incorrect.",
        },
        { status: 401 },
      );
    }
    console.error(error);
    return Response.json(
      { ok: false, error: "Sign-in is temporarily unavailable." },
      { status: 503 },
    );
  }
}
