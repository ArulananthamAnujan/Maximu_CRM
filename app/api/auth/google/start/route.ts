import { supabaseConfig } from "@/server/supabase";

export const dynamic = "force-dynamic";

/**
 * Google Workspace sign-in. Supabase Auth already speaks Google OAuth once
 * the provider is switched on in the Supabase dashboard (Authentication ->
 * Providers -> Google, using the same Google Cloud OAuth client this
 * deployment's Drive setup already has a project for); nothing here re-does
 * that exchange. This route only builds the redirect, so the Supabase
 * project URL never has to reach the browser directly -- every other call in
 * this app is proxied through the server the same way.
 */
export async function GET(request: Request) {
  try {
    const { url } = supabaseConfig();
    const origin = new URL(request.url).origin;
    const authorize = new URL(`${url}/auth/v1/authorize`);
    authorize.searchParams.set("provider", "google");
    authorize.searchParams.set("redirect_to", `${origin}/auth/google-callback`);
    return Response.redirect(authorize.toString(), 302);
  } catch {
    const origin = new URL(request.url).origin;
    const failed = new URL(`${origin}/`);
    failed.searchParams.set(
      "error",
      "Google sign-in is not available on this deployment.",
    );
    return Response.redirect(failed.toString(), 302);
  }
}
