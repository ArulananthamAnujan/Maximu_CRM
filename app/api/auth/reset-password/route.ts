import { supabaseRequest } from "@/server/supabase";
import { publicOrigin } from "@/server/public-origin";

export const dynamic = "force-dynamic";

/**
 * "Forgot your password?" on the sign-in page. Supabase Auth emails the
 * account a one-time link that lands on /auth/google-callback?setup=1, the
 * same page a new member of staff sets their first password on. The answer
 * is the same whether or not the address has an account, so the form cannot
 * be used to find out who has one.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    return Response.json({ ok: false, error: "Enter the email address registered with your Maximus account." }, { status: 400 });
  const redirectTo = `${publicOrigin(request)}/auth/google-callback?setup=1`;
  try {
    await supabaseRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  } catch (error) {
    // A rate limit or an unknown address must read the same as success to the
    // person at the keyboard; the operator can see the cause in the logs.
    console.error("Password reset request could not be sent", error);
  }
  return Response.json({ ok: true, message: "If that address has a Maximus account, a password reset link is on its way. Check your inbox and spam folder." });
}
