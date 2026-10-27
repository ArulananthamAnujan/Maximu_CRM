import { appendRefreshCookies, liveSession, LiveAccessError } from "@/server/supabase-session";
import { supabaseRequest, SupabaseError } from "@/server/supabase";
export const dynamic = "force-dynamic";
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
function fail(error: unknown) {
  const status = error instanceof LiveAccessError ? error.status : error instanceof SupabaseError ? (error.status >= 500 ? 503 : 400) : 400;
  return Response.json({ error: error instanceof Error ? error.message : "The agreement could not be updated." }, { status });
}
export async function GET(request: Request) {
  try {
    const s = await liveSession(request);
    const query = new URL(request.url).searchParams;
    const caseId = uuid(query.get("caseId"));
    if (query.has("caseId") && !caseId) throw new Error("Invalid case.");
    const filter = caseId ? `&case_id=eq.${caseId}` : "";
    const agreements = await supabaseRequest(`/rest/v1/service_agreements?select=*&order=created_at.desc${filter}`, { method: "GET" }, s.accessToken);
    const notices = s.identity.role === "client" ? [] : await supabaseRequest(`/rest/v1/client_notice_outbox?select=id,case_id,document_id,agreement_id,kind,status,last_error,attempts,created_at,sent_at&order=created_at.desc&limit=100${filter}`, { method: "GET" }, s.accessToken);
    return appendRefreshCookies(Response.json({ ok: true, agreements, notices }, { headers: { "Cache-Control": "no-store" } }), s.refreshed, request);
  } catch (e) { return fail(e); }
}
export async function POST(request: Request) {
  try {
    const s = await liveSession(request);
    const b = await request.json();
    if (b.action === "retry_notice") {
      if (s.identity.role === "client" || !uuid(b.id)) throw new LiveAccessError(403, "Staff access is required.");
      await supabaseRequest("/rest/v1/rpc/retry_client_notice", { method: "POST", body: JSON.stringify({p_id:b.id}) }, s.accessToken);
      return appendRefreshCookies(Response.json({ok:true}),s.refreshed,request);
    }
    if (!["create","send","view","accept","decline","withdraw"].includes(b.action)) throw new Error("Unknown agreement action.");
    if (b.action === "create" ? !uuid(b.caseId) : !uuid(b.id)) throw new Error("Invalid agreement or case.");
    const agreement = await supabaseRequest("/rest/v1/rpc/agreement_action", { method: "POST", body: JSON.stringify({
      p_action:b.action,p_case:uuid(b.caseId),p_id:uuid(b.id),p_title:typeof b.title==='string'?b.title:null,
      p_terms:typeof b.terms==='string'?b.terms:null,p_version:typeof b.version==='string'?b.version:null,
      p_name:typeof b.name==='string'?b.name:null,p_consent:b.consent===true,p_hash:typeof b.hash==='string'?b.hash:null,p_note:typeof b.note==='string'?b.note:null,
    }) }, s.accessToken);
    return appendRefreshCookies(Response.json({ok:true,agreement}),s.refreshed,request);
  } catch(e) { return fail(e); }
}
