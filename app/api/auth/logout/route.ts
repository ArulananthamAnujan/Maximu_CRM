import {
  ACCESS_COOKIE,
  clearSessionCookieHeaders,
  isSecureRequest,
  jsonWithCookies,
  readCookie,
  supabaseRequest,
} from "@/server/supabase";

export async function POST(request: Request) {
  const token = readCookie(request, ACCESS_COOKIE);
  if (token) {
    try {
      await supabaseRequest("/auth/v1/logout", { method: "POST" }, token);
    } catch {
      /* Local sign-out must still complete. */
    }
  }
  return jsonWithCookies(
    { ok: true },
    200,
    clearSessionCookieHeaders(isSecureRequest(request)),
  );
}
