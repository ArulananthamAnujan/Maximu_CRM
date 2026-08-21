import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    return appendRefreshCookies(
      Response.json({ authenticated: true, identity: session.identity }),
      session.refreshed,
      request,
    );
  } catch (error) {
    if (error instanceof LiveAccessError)
      return Response.json(
        { authenticated: false, error: error.message },
        { status: error.status },
      );
    console.error(error);
    return Response.json(
      {
        authenticated: false,
        error: "The CRM session is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
