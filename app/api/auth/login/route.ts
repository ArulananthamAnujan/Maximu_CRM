import {
  jsonWithCookies,
  sessionCookieHeaders,
  SupabaseError,
  supabaseRequest,
  type SupabaseSession,
} from "@/server/supabase";

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
    const profiles = await supabaseRequest<Array<{ active: boolean }>>(
      `/rest/v1/profiles?select=active&id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
      { method: "GET" },
      session.access_token,
    );
    if (!profiles[0]?.active)
      return Response.json(
        {
          ok: false,
          error:
            "Your login exists, but it is not linked to an active CRM account. Contact a Maximus administrator.",
        },
        { status: 403 },
      );
    return jsonWithCookies({ ok: true }, 200, sessionCookieHeaders(session));
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
