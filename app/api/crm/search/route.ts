import { appendRefreshCookies, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();

function displayName(row: Row | undefined) {
  if (!row) return "";
  return text(row.preferred_name) || [text(row.first_name), text(row.last_name)].filter(Boolean).join(" ");
}

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
    const [clients, directCases] = await Promise.all([
      supabaseRequest<Row[]>(`/rest/v1/clients?select=id,crm_id,first_name,last_name,preferred_name,email,mobile,current_lifecycle,branch_id&or=(${clientFilter})&archived_at=is.null&limit=14`, { method: "GET" }, token),
      supabaseRequest<Row[]>(`/rest/v1/cases?select=id,case_number,client_id,service_type,target,next_action,health,progress,branch_id,lifecycle_stage,created_at&or=(${caseFilter})&order=created_at.desc&limit=14`, { method: "GET" }, token),
    ]);

    const matchedClientIds = clients.map(row => text(row.id)).filter(Boolean);
    const casesForClients = matchedClientIds.length
      ? await supabaseRequest<Row[]>(`/rest/v1/cases?select=id,case_number,client_id,service_type,target,next_action,health,progress,branch_id,lifecycle_stage,created_at&client_id=in.(${matchedClientIds.join(",")})&order=created_at.desc&limit=40`, { method: "GET" }, token)
      : [];
    const knownClients = new Map(clients.map(row => [text(row.id), row]));
    const missingClientIds = [...new Set(directCases.map(row => text(row.client_id)).filter(id => id && !knownClients.has(id)))];
    const relatedClients = missingClientIds.length
      ? await supabaseRequest<Row[]>(`/rest/v1/clients?select=id,crm_id,first_name,last_name,preferred_name,email,mobile,current_lifecycle,branch_id&id=in.(${missingClientIds.join(",")})&archived_at=is.null`, { method: "GET" }, token)
      : [];
    relatedClients.forEach(row => knownClients.set(text(row.id), row));

    const latestCaseByClient = new Map<string, Row>();
    casesForClients.forEach(row => {
      const clientId = text(row.client_id);
      if (clientId && !latestCaseByClient.has(clientId)) latestCaseByClient.set(clientId, row);
    });
    const clientResults = clients.map(row => {
      const linkedCase = latestCaseByClient.get(text(row.id));
      return {
        type: "client",
        id: row.id,
        clientId: row.id,
        caseId: linkedCase?.id ?? null,
        reference: linkedCase?.case_number || row.crm_id,
        title: displayName(row) || text(row.email) || "Client record",
        subtitle: row.email || row.mobile || row.current_lifecycle,
        service: linkedCase?.service_type || "",
        stage: linkedCase?.lifecycle_stage || row.current_lifecycle,
        target: linkedCase?.target || linkedCase?.next_action || "",
        branchId: linkedCase?.branch_id || row.branch_id,
      };
    });
    const clientCaseIds = new Set(clientResults.map(row => text(row.caseId)).filter(Boolean));
    const caseResults = directCases
      .filter(row => !clientCaseIds.has(text(row.id)))
      .map(row => {
        const client = knownClients.get(text(row.client_id));
        return {
          type: "case",
          id: row.id,
          clientId: row.client_id,
          caseId: row.id,
          reference: row.case_number,
          title: displayName(client) || text(row.target) || text(row.service_type) || "Case record",
          subtitle: client?.email || client?.mobile || row.next_action || row.health,
          service: row.service_type || "",
          stage: row.lifecycle_stage || "",
          target: row.target || row.next_action || "",
          branchId: row.branch_id,
        };
      });
    const results = [...clientResults, ...caseResults].slice(0, 18);
    return appendRefreshCookies(Response.json({ ok: true, results }), session.refreshed, request);
  } catch (error) {
    if (error instanceof SupabaseError) return Response.json({ ok: false, error: "Search is temporarily unavailable." }, { status: 503 });
    console.error(error); return Response.json({ ok: false, error: "Search could not be completed." }, { status: 500 });
  }
}

function escapeFilter(value: string) {
  return value.replace(/[\\%_*(),.]/g, character => `\\${character}`);
}
