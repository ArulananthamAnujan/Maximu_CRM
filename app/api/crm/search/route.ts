import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return Response.json({ ok: true, results: [] });
    if (query.length > 100) return Response.json({ ok: false, error: "Search is too long." }, { status: 400 });
    const token = session.accessToken;
    const needle = escapeFilter(query);
    const clientFilter = ["first_name", "last_name", "preferred_name", "email", "mobile", "crm_id", "nationality"]
      .map(field => `${field}.ilike.*${needle}*`).join(",");
    const caseFilter = ["case_number", "target", "next_action", "service_type"]
      .map(field => `${field}.ilike.*${needle}*`).join(",");
    const [clients, cases] = await Promise.all([
      supabaseRequest<Row[]>(`/rest/v1/clients?select=id,crm_id,first_name,last_name,preferred_name,email,mobile,current_lifecycle,branch_id&or=(${clientFilter})&archived_at=is.null&limit=25`, { method: "GET" }, token),
      supabaseRequest<Row[]>(`/rest/v1/cases?select=id,case_number,client_id,service_type,target,next_action,health,progress,branch_id&or=(${caseFilter})&limit=25`, { method: "GET" }, token),
    ]);
    const results = [
      ...clients.map(row => ({ type: "client", id: row.id, reference: row.crm_id, title: [row.first_name, row.last_name].filter(Boolean).join(" "), subtitle: row.email || row.mobile || row.current_lifecycle, branchId: row.branch_id })),
      ...cases.map(row => ({ type: "case", id: row.id, clientId: row.client_id, reference: row.case_number, title: row.target || row.service_type, subtitle: row.next_action || row.health, branchId: row.branch_id })),
    ].slice(0, 40);
    return appendRefreshCookies(Response.json({ ok: true, results }), session.refreshed, request);
  } catch (error) {
    if (error instanceof SupabaseError) return Response.json({ ok: false, error: "Search is temporarily unavailable." }, { status: 503 });
    console.error(error); return Response.json({ ok: false, error: "Search could not be completed." }, { status: 500 });
  }
}

function escapeFilter(value: string) {
  return value.replace(/[\\%_*(),.]/g, character => `\\${character}`);
}
