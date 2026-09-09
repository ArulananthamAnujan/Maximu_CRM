import { appendRefreshCookies, liveSession, LiveAccessError } from "@/server/supabase-session";
import { supabaseRequest } from "@/server/supabase";
import { googleOAuthConfigured } from "@/server/google-oauth-client";
import { driveConfigured } from "@/server/google-drive";
import { aiConfigured } from "@/server/ai";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client") throw new LiveAccessError(403, "Workspace connections are available to staff only.");
    const rows = await supabaseRequest<{ provider: string; email: string; active: boolean; token_reference: string | null }[]>(`/rest/v1/mailbox_connections?select=provider,email,active,token_reference&profile_id=eq.${session.identity.profileId}&provider=in.(gmail,google_calendar)`, { method: "GET" }, session.accessToken);
    const connected = (provider: string) => rows.some(row => row.provider === provider && row.active && row.token_reference && row.email.toLowerCase() === session.identity.email.toLowerCase());
    return appendRefreshCookies(Response.json({ ok: true, email: session.identity.email, gmail: connected("gmail"), calendar: connected("google_calendar"), drive: driveConfigured(), ai: aiConfigured(), oauthConfigured: googleOAuthConfigured() }, { headers: { "Cache-Control": "private, no-store" } }), session.refreshed, request);
  } catch (error) { return Response.json({ ok: false, error: error instanceof LiveAccessError ? error.message : "Workspace connections could not be checked." }, { status: error instanceof LiveAccessError ? error.status : 503 }); }
}
