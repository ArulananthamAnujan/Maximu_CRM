export type SupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: { id: string; email?: string };
};

type SupabaseRuntime = { url: string; publishableKey: string };

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

export function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionCookieHeaders(session: SupabaseSession): string[] {
  const accessMaxAge = Math.max(60, Number(session.expires_in) || 3600);
  return [
    cookie(ACCESS_COOKIE, session.access_token, accessMaxAge),
    cookie(REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30),
  ];
}

export function clearSessionCookieHeaders(): string[] {
  return [cookie(ACCESS_COOKIE, "", 0), cookie(REFRESH_COOKIE, "", 0)];
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

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
