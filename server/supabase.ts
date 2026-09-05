export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id: string; email?: string };
};

type SupabaseRuntime = {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string;
};

declare global {
  // Populated by the Cloudflare Worker entry point at request time.
  var __MAXIMUS_SUPABASE__: SupabaseRuntime | undefined;
}

export const ACCESS_COOKIE = "maximus_access";
export const REFRESH_COOKIE = "maximus_refresh";

export function supabaseConfig(): SupabaseRuntime {
  const runtime = globalThis.__MAXIMUS_SUPABASE__;
  const url = runtime?.url || process.env.SUPABASE_URL || "";
  const publishableKey =
    runtime?.publishableKey || process.env.SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !publishableKey)
    throw new Error("Supabase runtime configuration is missing.");
  return { url: url.replace(/\/$/, ""), publishableKey };
}

/**
 * The service-role key, if this deployment has one. It bypasses row-level
 * security entirely, so it is used on exactly one path -- creating the Supabase
 * login for a member of staff an administrator is adding -- and never with any
 * value a request supplied as a filter.
 */
export function serviceRoleKey(): string {
  return (
    globalThis.__MAXIMUS_SUPABASE__?.serviceRoleKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

/** A request made with the service-role key rather than as the signed-in user. */
export async function supabaseAdminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const key = serviceRoleKey();
  if (!key) throw new SupabaseError(501, "No service-role key is configured.");
  const { url } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${url}${path}`, { ...init, headers });
  const body = await response.text();
  if (!response.ok)
    throw new SupabaseError(response.status, body || response.statusText);
  return (body.trim() ? JSON.parse(body) : undefined) as T;
}

export async function supabaseRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const { url, publishableKey } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", publishableKey);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${url}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new SupabaseError(response.status, detail || response.statusText);
  }
  if (response.status === 204) return undefined as T;
  const body = await response.text();
  // PostgREST commonly returns 200/201 with an empty body when the request
  // uses `Prefer: return=minimal`. Treat that as a successful void response.
  if (!body.trim()) return undefined as T;
  return JSON.parse(body) as T;
}

/** Read a PostgREST page together with its RLS-scoped exact total. */
export async function supabasePageRequest<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string,
): Promise<{ data: T; count: number | null }> {
  const { url, publishableKey } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", publishableKey);
  headers.set("Prefer", "count=exact");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${url}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new SupabaseError(response.status, detail || response.statusText);
  }
  const body = await response.text();
  const total = response.headers.get("content-range")?.split("/").pop();
  return {
    data: (body.trim() ? JSON.parse(body) : []) as T,
    count: total && total !== "*" ? Number(total) : null,
  };
}

export function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionCookieHeaders(
  session: SupabaseSession,
  secure = true,
): string[] {
  const accessMaxAge = Math.max(60, Number(session.expires_in) || 3600);
  return [
    cookie(ACCESS_COOKIE, session.access_token, accessMaxAge, secure),
    cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30, secure),
  ];
}

export function clearSessionCookieHeaders(secure = true): string[] {
  return [
    cookie(ACCESS_COOKIE, "", 0, secure),
    cookie(REFRESH_COOKIE, "", 0, secure),
  ];
}

// A `Secure` cookie is silently discarded by the browser on an insecure
// origin, which lets sign-in return 200 while the session never persists and
// the user is bounced straight back to the login form. Mark the cookie secure
// whenever the request really is https, and fall back to secure when the
// scheme cannot be determined.
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

/**
 * The address a request actually came from, as the edge in front of this
 * deployment reports it. Used only to slow down credential guessing, not for
 * anything that has to be tamper-proof: a spoofed header just means that one
 * attempt is bucketed under "unknown" with everyone else who sent none.
 */
export function clientIp(request: Request): string {
  const direct =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for");
  if (!direct) return "unknown";
  return direct.split(",")[0].trim() || "unknown";
}

export function jsonWithCookies(
  payload: unknown,
  status: number,
  cookies: string[],
): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  cookies.forEach((value) => headers.append("Set-Cookie", value));
  return new Response(JSON.stringify(payload), { status, headers });
}

export class SupabaseError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function cookie(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
): string {
  const flags = ["Path=/", "HttpOnly"];
  if (secure) flags.push("Secure");
  flags.push("SameSite=Lax", `Max-Age=${maxAge}`);
  return `${name}=${encodeURIComponent(value)}; ${flags.join("; ")}`;
}
