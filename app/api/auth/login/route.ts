import {
  isSecureRequest,
  jsonWithCookies,
  sessionCookieHeaders,
  SupabaseError,
  supabaseRequest,
  type SupabaseSession,
} from "@/server/supabase";
import { profileForUser } from "@/server/supabase-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let attemptedEmail = "";
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
    const session = await supabaseRequest<SupabaseSession>(
      "/auth/v1/token?grant_type=password",
      { method: "POST", body: JSON.stringify({ email, password }) },
    );
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
