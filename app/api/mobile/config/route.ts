import { supabaseConfig } from "@/server/supabase";

export const dynamic = "force-dynamic";

/** Public OAuth client configuration only. Never return service-role credentials. */
export async function GET() {
  try {
    const { url, publishableKey } = supabaseConfig();
    const origin = new URL(url);
    if (origin.protocol !== "https:" || !origin.hostname.endsWith(".supabase.co")) throw new Error("Invalid OAuth host");
    return Response.json({ url: origin.origin, publishableKey }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Mobile Google sign-in is not configured." }, { status: 503 });
  }
}
