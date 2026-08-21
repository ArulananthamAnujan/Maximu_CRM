import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client") throw new LiveAccessError(403, "Operational reporting is available to staff only.");
    const token = session.accessToken;
    const url = new URL(request.url);
    const view = url.searchParams.get("view") || "notifications";
    let data: unknown;

    if (view === "notifications") {
      data = await rest(`notifications?select=*&recipient_id=eq.${session.identity.profileId}&order=created_at.desc&limit=100`, token);
    } else if (view === "checklist") {
      const caseId = uuid(url.searchParams.get("caseId"), "Case");
      data = await rest(`case_checklist_items?select=*&case_id=eq.${caseId}&order=created_at.asc`, token);
    } else if (view === "integrations") {
      data = await rest("integration_connections?select=id,profile_id,provider,connection_scope,external_account,status,scopes,last_synced_at,last_error,updated_at&order=provider.asc", token);
    } else if (view === "report") {
      const [cases, tasks, documents, invoices] = await Promise.all([
        rest<Json[]>("cases?select=id,health,service_type,branch_id,owner_id,opened_at,closed_at", token),
        rest<Json[]>("tasks?select=id,status,priority,due_at,assigned_to", token),
        rest<Json[]>("documents?select=id,state,created_at", token),
        rest<Json[]>("invoices?select=id,state,total,paid,currency", token),
      ]);
      const now = Date.now();
      data = {
        cases: group(cases, "health"),
        services: group(cases, "service_type"),
        tasks: group(tasks, "status"),
        overdueTasks: tasks.filter(row => row.status !== "completed" && typeof row.due_at === "string" && Date.parse(row.due_at) < now).length,
        documents: group(documents, "state"),
        invoices: group(invoices, "state"),
        finance: invoices.reduce<{ total: number; paid: number }>(
          (sum, row) => ({
            total: sum.total + Number(row.total || 0),
            paid: sum.paid + Number(row.paid || 0),
          }),
          { total: 0, paid: 0 },
        ),
      };
    } else {
      throw new InputError("Unsupported operations view.");
    }
    return appendRefreshCookies(Response.json({ ok: true, data }), session.refreshed, request);
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client") throw new LiveAccessError(403, "This operation is available to staff only.");
    const body = await request.json() as Json;
    const action = required(body.action, "Action");
    const token = session.accessToken;
    const org = session.identity.organisationId;
    const actor = session.identity.profileId;

    if (action === "transition_case") {
      await supabaseRequest("/rest/v1/rpc/transition_case_stage", { method: "POST", body: JSON.stringify({ target_case: uuid(body.caseId, "Case"), target_stage: uuid(body.stageId, "Stage"), transition_reason: optional(body.reason) }) }, token);
    } else if (action === "checklist_item") {
      await insert("case_checklist_items", { id: crypto.randomUUID(), organisation_id: org, case_id: uuid(body.caseId, "Case"), stage_id: optionalUuid(body.stageId), title: required(body.title, "Checklist item"), item_type: optional(body.itemType) || "task", required: body.required !== false, assigned_to: optionalUuid(body.assignedTo), due_at: optionalDate(body.dueAt) }, token);
    } else if (action === "complete_checklist_item") {
      await patch("case_checklist_items", uuid(body.id, "Checklist item"), { status: body.waived ? "waived" : "completed", completed_by: actor, completed_at: new Date().toISOString(), evidence_document_id: optionalUuid(body.documentId) }, token);
    } else if (action === "case_note") {
      const caseId = uuid(body.caseId, "Case");
      await insert("case_notes", { id: crypto.randomUUID(), organisation_id: org, case_id: caseId, author_id: actor, body: required(body.body, "Note"), visibility: optional(body.visibility) || "case_team", mentions: Array.isArray(body.mentions) ? body.mentions : [] }, token);
    } else if (action === "notify") {
      await insert("notifications", { id: crypto.randomUUID(), organisation_id: org, recipient_id: uuid(body.recipientId, "Recipient"), case_id: optionalUuid(body.caseId), kind: optional(body.kind) || "general", title: required(body.title, "Title"), body: optional(body.body), action_url: safePath(body.actionUrl) }, token);
    } else if (action === "read_notification") {
      await patch("notifications", uuid(body.id, "Notification"), { read_at: new Date().toISOString() }, token);
    } else if (action === "record_payment") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can record payments.");
      const amount = positiveNumber(body.amount, "Amount");
      await insert("payments", { id: crypto.randomUUID(), organisation_id: org, invoice_id: uuid(body.invoiceId, "Invoice"), amount, currency: optional(body.currency) || "AUD", method: optional(body.method), reference: optional(body.reference), recorded_by: actor }, token);
    } else if (action === "link_client_account") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can link client accounts.");
      await insert("client_user_links", { profile_id: uuid(body.profileId, "Profile"), client_id: uuid(body.clientId, "Client") }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "queue_integration") {
      const provider = required(body.provider, "Provider").toLowerCase();
      if (!["google_drive", "gmail", "google_calendar", "whatsapp", "payments"].includes(provider)) throw new InputError("Unsupported integration provider.");
      const idempotencyKey = required(body.idempotencyKey, "Idempotency key");
      await insert("integration_jobs", { id: crypto.randomUUID(), organisation_id: org, connection_id: optionalUuid(body.connectionId), case_id: optionalUuid(body.caseId), provider, operation: required(body.operation, "Operation"), idempotency_key: idempotencyKey, payload: isObject(body.payload) ? body.payload : {} }, token, "resolution=ignore-duplicates,return=minimal");
    } else {
      throw new InputError("Unsupported operations action.");
    }
    return appendRefreshCookies(Response.json({ ok: true }), session.refreshed, request);
  } catch (error) { return apiError(error); }
}

async function rest<T = unknown>(query: string, token: string): Promise<T> { return supabaseRequest<T>(`/rest/v1/${query}`, { method: "GET" }, token); }
async function insert(table: string, value: Json, token: string, prefer = "return=minimal") { await supabaseRequest(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: prefer }, body: JSON.stringify(value) }, token); }
async function patch(table: string, id: string, value: Json, token: string) { await supabaseRequest(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(value) }, token); }
function group(rows: Json[], key: string) { return rows.reduce<Record<string, number>>((acc, row) => { const value = String(row[key] ?? "unknown"); acc[value] = (acc[value] ?? 0) + 1; return acc; }, {}); }
function required(value: unknown, label: string) { const parsed = optional(value); if (!parsed) throw new InputError(`${label} is required.`); return parsed; }
function optional(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function uuid(value: unknown, label: string) { const parsed = required(value, label); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new InputError(`${label} is invalid.`); return parsed; }
function optionalUuid(value: unknown) { const parsed = optional(value); return parsed ? uuid(parsed, "Identifier") : null; }
function optionalDate(value: unknown) { const parsed = optional(value); if (!parsed) return null; const date = new Date(parsed); if (Number.isNaN(date.getTime())) throw new InputError("Date is invalid."); return date.toISOString(); }
function positiveNumber(value: unknown, label: string) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed <= 0) throw new InputError(`${label} must be greater than zero.`); return parsed; }
function safePath(value: unknown) { const parsed = optional(value); return parsed?.startsWith("/") && !parsed.startsWith("//") ? parsed : null; }
function isObject(value: unknown): value is Json { return typeof value === "object" && value !== null && !Array.isArray(value); }
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this operation." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error); return Response.json({ ok: false, error: "The operation could not be completed." }, { status: 500 });
}
