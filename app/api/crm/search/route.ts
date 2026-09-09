import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();

function displayName(row: Row | undefined) {
  if (!row) return "";
  return text(row.preferred_name) || [text(row.first_name), text(row.last_name)].filter(Boolean).join(" ");
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const session = await liveSession(request);
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.trim() ?? "";
    if (params.get("scope") === "cases") {
      if (session.identity.role === "client") throw new LiveAccessError(403, "Case search is available to staff only.");
      if (query.length > 100) return Response.json({ ok: false, error: "Search is too long." }, { status: 400 });
      const results = await findCases(query, session.accessToken, request.signal);
      return appendRefreshCookies(Response.json({ ok: true, results }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `search;dur=${(performance.now() - startedAt).toFixed(1)}` } }), session.refreshed, request);
    }
    if (query.length < 2) return Response.json({ ok: true, results: [] });
    if (query.length > 100) return Response.json({ ok: false, error: "Search is too long." }, { status: 400 });
    const token = session.accessToken;
    const needle = quotedPattern(query);
    const clientFilter = ["first_name", "last_name", "preferred_name", "email", "mobile", "crm_id", "nationality"]
      .map(field => `${field}.ilike.${needle}`).join(",");
    // First and last names are separate columns: a full name must match
    // across those columns, not require the entire phrase in either one.
    const nameParts = query.split(/\s+/).filter(Boolean).slice(0, 6);
    const fullNameFilter = nameParts.length > 1
      ? `,and(${nameParts.map(part => `or(first_name.ilike.${quotedPattern(part)},last_name.ilike.${quotedPattern(part)},preferred_name.ilike.${quotedPattern(part)})`).join(",")})`
      : "";
    const caseFilter = ["case_number", "target", "next_action", "service_type"]
      .map(field => `${field}.ilike.${needle}`).join(",");
    const [clients, directCases] = await Promise.all([
      supabaseRequest<Row[]>(`/rest/v1/clients?select=id,crm_id,first_name,last_name,preferred_name,email,mobile,current_lifecycle,branch_id&or=${encodeURIComponent(`(${clientFilter}${fullNameFilter})`)}&archived_at=is.null&order=first_name.asc,id.asc&limit=14`, { method: "GET" }, token),
      supabaseRequest<Row[]>(`/rest/v1/cases?select=id,case_number,client_id,service_type,target,next_action,health,progress,branch_id,lifecycle_stage,opened_at&or=${encodeURIComponent(`(${caseFilter})`)}&order=opened_at.desc,id.asc&limit=14`, { method: "GET" }, token),
    ]);

    const matchedClientIds = clients.map(row => text(row.id)).filter(Boolean);
    const casesForClients = matchedClientIds.length
      ? await supabaseRequest<Row[]>(`/rest/v1/cases?select=id,case_number,client_id,service_type,target,next_action,health,progress,branch_id,lifecycle_stage,opened_at&client_id=in.(${matchedClientIds.join(",")})&order=opened_at.desc,id.asc&limit=40`, { method: "GET" }, token)
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
    return appendRefreshCookies(Response.json({ ok: true, results }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `search;dur=${(performance.now() - startedAt).toFixed(1)}` } }), session.refreshed, request);
  } catch (error) {
    if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
    if (error instanceof SupabaseError) return Response.json({ ok: false, error: "Search is temporarily unavailable." }, { status: 503 });
    console.error(error); return Response.json({ ok: false, error: "Search could not be completed." }, { status: 500 });
  }
}

function quotedPattern(value: string) {
  return `"*${value.replace(/[\\"%_*]/g, character => `\\${character}`)}*"`;
}

// Case picker: join each permitted case to its visible client in the database.
// Two bounded reads run together; no serial client/case enrichment or counts.
async function findCases(query: string, token: string, signal: AbortSignal) {
  const select = "id,case_number,client_id,lifecycle_stage,service_type,opened_at,clients!inner(first_name,last_name,preferred_name,email,mobile,crm_id)";
  const base = `/rest/v1/cases?select=${select}&clients.archived_at=is.null&order=opened_at.desc,id.asc&limit=12`;
  const read = (filter = "") => supabaseRequest<Row[]>(base + filter, { method: "GET", signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) }, token);
  let rows: Row[];
  if (!query) rows = await read();
  else {
    if (query.length < 2) return [];
    const needle = quotedPattern(query);
    const fields = ["first_name", "last_name", "preferred_name", "email", "mobile", "crm_id"].map(field => `${field}.ilike.${needle}`);
    const parts = query.split(/\s+/).filter(Boolean).slice(0, 6);
    if (parts.length > 1) fields.push(`and(${parts.map(part => `or(first_name.ilike.${quotedPattern(part)},last_name.ilike.${quotedPattern(part)},preferred_name.ilike.${quotedPattern(part)})`).join(",")})`);
    const groups = await Promise.all([
      read(`&clients.or=${encodeURIComponent(`(${fields.join(",")})`)}`),
      read(`&or=${encodeURIComponent(`(case_number.ilike.${needle})`)}`),
    ]);
    rows = groups.flat();
  }
  return [...new Map(rows.map(row => [text(row.id), row])).values()].slice(0, 18).map(row => {
    const client = row.clients as Row | null;
    return { caseId: row.id, title: displayName(client ?? undefined) || "Client record", reference: row.case_number, subtitle: client?.email || client?.mobile || "", stage: row.lifecycle_stage, service: row.service_type };
  });
}
