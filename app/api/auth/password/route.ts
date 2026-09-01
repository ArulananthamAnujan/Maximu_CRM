import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    const body = (await request.json()) as { password?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 12 || !/[a-z]/i.test(password) || !/\d/.test(password))
      return Response.json({ ok: false, error: "Use at least 12 characters including a letter and number." }, { status: 400 });
    if (password.length > 256)
      return Response.json({ ok: false, error: "The password is too long." }, { status: 400 });
    await supabaseRequest("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ password }),
    }, session.accessToken);
    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) {
    const message = error instanceof SupabaseError && error.status < 500
      ? "Your session expired. Sign in again before changing your password."
      : "The password could not be changed.";
    return Response.json({ ok: false, error: message }, { status: error instanceof SupabaseError ? error.status : 500 });
  }
}
