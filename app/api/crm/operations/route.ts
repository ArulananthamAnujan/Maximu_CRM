import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { EmailProviderError, sendEmail } from "@/server/email";

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
    } else if (view === "notes") {
      const caseId = uuid(url.searchParams.get("caseId"), "Case");
      data = await rest(`case_notes?select=*&case_id=eq.${caseId}&order=created_at.desc&limit=100`, token);
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
    } else if (action === "appointment_response") {
      const status = required(body.status, "Response").toLowerCase();
      if (!["scheduled", "declined", "cancelled"].includes(status)) throw new InputError("Appointment response is invalid.");
      const date = optional(body.date);
      const time = optional(body.time);
      const startsAt = date && time ? new Date(`${date}T${time}:00`) : null;
      if (startsAt && Number.isNaN(startsAt.getTime())) throw new InputError("Appointment time is invalid.");
      const duration = Math.min(480, Math.max(15, Number(body.durationMinutes ?? 30)));
      await supabaseRequest("/rest/v1/rpc/respond_to_appointment", {
        method: "POST",
        body: JSON.stringify({
          p_appointment_id: uuid(body.appointmentId, "Appointment"),
          p_status: status,
          p_starts_at: startsAt?.toISOString() ?? null,
          p_ends_at: startsAt ? new Date(startsAt.getTime() + duration * 60000).toISOString() : null,
          p_note: optional(body.note),
        }),
      }, token);
    } else if (action === "record_payment") {
      const amount = positiveNumber(body.amount, "Amount");
      const invoiceId = uuid(body.invoiceId, "Invoice");
      const [invoice] = await rest<Json[]>(`invoices?select=id,total,paid,currency,state,client_id,case_id&id=eq.${invoiceId}&limit=1`, token);
      if (!invoice) throw new InputError("Invoice was not found.");
      const outstanding = Math.max(0, Number(invoice.total ?? 0) - Number(invoice.paid ?? 0));
      if (amount > outstanding + 0.001) throw new InputError(`Payment exceeds the outstanding balance of ${outstanding.toFixed(2)}.`);
      const paymentId = crypto.randomUUID();
      const receiptId = crypto.randomUUID();
      const receiptNumber = `RCT-${new Date().getUTCFullYear()}-${receiptId.slice(0, 8).toUpperCase()}`;
      await insert("payments", { id: paymentId, organisation_id: org, invoice_id: invoiceId, amount, currency: optional(body.currency) || invoice.currency || "AUD", method: optional(body.method), reference: optional(body.reference), external_reference: optional(body.externalReference), transaction_type: "payment", recorded_by: actor }, token);
      await insert("payment_receipts", { id: receiptId, organisation_id: org, payment_id: paymentId, receipt_number: receiptNumber, issued_by: actor }, token);
      const paid = Math.round((Number(invoice.paid ?? 0) + amount) * 100) / 100;
      await patch("invoices", invoiceId, { paid, state: paid + 0.001 >= Number(invoice.total ?? 0) ? "paid" : "part_paid" }, token);
      await insert("audit_events", { organisation_id: org, actor_id: actor, action: "payment.recorded", resource_type: "payment", resource_id: paymentId, case_id: invoice.case_id ?? null, summary: `Recorded payment and issued ${receiptNumber}`, after_data: { invoice_id: invoiceId, amount, receipt_number: receiptNumber } }, token);
      return appendRefreshCookies(Response.json({ ok: true, paymentId, receiptId, receiptNumber, paid }), session.refreshed, request);
    } else if (action === "record_refund") {
      const amount = positiveNumber(body.amount, "Refund amount");
      const invoiceId = uuid(body.invoiceId, "Invoice");
      const [invoice] = await rest<Json[]>(`invoices?select=id,total,paid,currency,case_id&id=eq.${invoiceId}&limit=1`, token);
      if (!invoice) throw new InputError("Invoice was not found.");
      if (amount > Number(invoice.paid ?? 0) + 0.001) throw new InputError("Refund cannot exceed payments received.");
      const paymentId = crypto.randomUUID();
      await insert("payments", { id: paymentId, organisation_id: org, invoice_id: invoiceId, amount: -amount, currency: optional(body.currency) || invoice.currency || "AUD", method: optional(body.method), reference: optional(body.reason) || "Refund", external_reference: optional(body.externalReference), transaction_type: "refund", recorded_by: actor }, token);
      const paid = Math.max(0, Math.round((Number(invoice.paid ?? 0) - amount) * 100) / 100);
      await patch("invoices", invoiceId, { paid, state: paid <= 0 ? "refunded" : "part_paid" }, token);
      await insert("audit_events", { organisation_id: org, actor_id: actor, action: "refund.recorded", resource_type: "payment", resource_id: paymentId, case_id: invoice.case_id ?? null, summary: `Recorded refund of ${amount.toFixed(2)}`, after_data: { invoice_id: invoiceId, amount, reason: optional(body.reason) } }, token);
      return appendRefreshCookies(Response.json({ ok: true, refundId: paymentId, paid }), session.refreshed, request);
    } else if (action === "start_reconciliation") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can reconcile payments.");
      const id = crypto.randomUUID();
      await insert("reconciliation_runs", { id, organisation_id: org, source: required(body.source, "Source"), statement_reference: optional(body.statementReference), currency: optional(body.currency) || "AUD", statement_total: positiveNumber(body.statementTotal, "Statement total"), started_by: actor }, token);
      return appendRefreshCookies(Response.json({ ok: true, reconciliationId: id }), session.refreshed, request);
    } else if (action === "reconcile_payments") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can reconcile payments.");
      const reconciliationId = uuid(body.reconciliationId, "Reconciliation");
      const paymentIds = Array.isArray(body.paymentIds) ? body.paymentIds.map((id) => uuid(id, "Payment")) : [];
      if (!paymentIds.length || paymentIds.length > 500) throw new InputError("Select between 1 and 500 payments.");
      const payments = await rest<Json[]>(`payments?select=id,amount&organisation_id=eq.${org}&id=in.(${paymentIds.join(",")})`, token);
      const matched = Math.round(payments.reduce((sum, row) => sum + Number(row.amount ?? 0), 0) * 100) / 100;
      for (const payment of payments) await patch("payments", String(payment.id), { reconciliation_id: reconciliationId, reconciled_at: new Date().toISOString() }, token);
      const [run] = await rest<Json[]>(`reconciliation_runs?select=statement_total&id=eq.${reconciliationId}&limit=1`, token);
      const balanced = Math.abs(Number(run?.statement_total ?? 0) - matched) < 0.01;
      await patch("reconciliation_runs", reconciliationId, { matched_total: matched, status: balanced ? "balanced" : "exception", completed_at: new Date().toISOString() }, token);
      return appendRefreshCookies(Response.json({ ok: true, matchedTotal: matched, balanced }), session.refreshed, request);
    } else if (action === "queue_overdue_reminder") {
      await insert("invoice_reminders", { id: crypto.randomUUID(), organisation_id: org, invoice_id: uuid(body.invoiceId, "Invoice"), reminder_type: optional(body.reminderType) || "manual", delivery_channel: "email", status: "queued", sent_by: actor }, token);
    } else if (action === "create_commission_claim") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can raise a commission claim.");
      const counterpartyType = (optional(body.counterpartyType) || "partner").toLowerCase();
      if (!["partner", "university"].includes(counterpartyType)) throw new InputError("Commission counterparty must be a partner or university.");
      const caseIds = Array.isArray(body.caseIds) ? [...new Set(body.caseIds.map((id) => uuid(id, "Case")))] : [];
      if (caseIds.length > 500) throw new InputError("Select no more than 500 students per commission invoice.");
      if (caseIds.length) {
        const accessible = await rest<Json[]>(`cases?select=id&id=in.(${caseIds.join(",")})`, token);
        if (accessible.length !== caseIds.length) throw new LiveAccessError(403, "One or more selected students are outside your branch access.");
      }
      const netAmount = positiveNumber(body.netAmount ?? body.expectedAmount, "Net commission");
      const taxRate = nonNegativeNumber(body.taxRate ?? 0, "Tax rate");
      if (taxRate > 100) throw new InputError("Tax rate cannot exceed 100%.");
      const taxAmount = Math.round(netAmount * taxRate) / 100;
      const total = Math.round((netAmount + taxAmount) * 100) / 100;
      const claimId = crypto.randomUUID();
      const invoiceNumber = `COM-${new Date().getUTCFullYear()}-${claimId.slice(0, 8).toUpperCase()}`;
      await insert("commission_claims", {
        id: claimId,
        organisation_id: org,
        branch_id: session.identity.branchId,
        application_id: optionalUuid(body.applicationId),
        partner_name: required(body.partnerName, counterpartyType === "university" ? "University" : "Partner"),
        institution: optional(body.institution),
        counterparty_type: counterpartyType,
        counterparty_email: optional(body.counterpartyEmail),
        invoice_number: invoiceNumber,
        currency: optional(body.currency) || "AUD",
        net_amount: netAmount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        expected_amount: total,
        issued_on: optionalDate(body.issuedOn) || new Date().toISOString(),
        due_on: optionalDate(body.dueOn),
        student_count: caseIds.length,
        case_ids: caseIds,
        details: { case_ids: caseIds },
      }, token);
      await insert("audit_events", { organisation_id: org, actor_id: actor, action: "commission.invoice_created", resource_type: "commission_claim", resource_id: claimId, summary: `Raised ${invoiceNumber} for ${total.toFixed(2)}`, after_data: { invoice_number: invoiceNumber, counterparty_type: counterpartyType, net_amount: netAmount, tax_rate: taxRate, tax_amount: taxAmount, total, case_ids: caseIds } }, token);
      return appendRefreshCookies(Response.json({ ok: true, claimId, invoiceNumber, total }), session.refreshed, request);
    } else if (action === "record_commission_received") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can record a commission receipt.");
      const amount = positiveNumber(body.receivedAmount, "Received amount");
      const claimId = uuid(body.claimId, "Commission claim");
      const [claim] = await rest<Json[]>(`commission_claims?select=id,invoice_number,expected_amount,received_amount,currency&id=eq.${claimId}&limit=1`, token);
      if (!claim) throw new InputError("Commission invoice was not found.");
      const pending = Math.max(0, Number(claim.expected_amount ?? 0) - Number(claim.received_amount ?? 0));
      if (amount > pending + 0.001) throw new InputError(`Payment exceeds the pending commission of ${pending.toFixed(2)}.`);
      const paymentId = crypto.randomUUID();
      const receiptId = crypto.randomUUID();
      const receiptNumber = `CR-${new Date().getUTCFullYear()}-${receiptId.slice(0, 8).toUpperCase()}`;
      await insert("commission_payments", { id: paymentId, organisation_id: org, claim_id: claimId, amount, currency: optional(body.currency) || claim.currency || "AUD", payment_reference: optional(body.reference), paid_at: optionalDate(body.paidAt) || new Date().toISOString(), recorded_by: actor }, token);
      await insert("commission_receipts", { id: receiptId, organisation_id: org, payment_id: paymentId, receipt_number: receiptNumber, issued_by: actor }, token);
      const receivedAmount = Math.round((Number(claim.received_amount ?? 0) + amount) * 100) / 100;
      await patch("commission_claims", claimId, { received_amount: receivedAmount, status: receivedAmount + 0.001 >= Number(claim.expected_amount ?? 0) ? "received" : "part_received" }, token);
      await insert("audit_events", { organisation_id: org, actor_id: actor, action: "commission.payment_recorded", resource_type: "commission_payment", resource_id: paymentId, summary: `Recorded commission payment and issued ${receiptNumber}`, after_data: { claim_id: claimId, invoice_number: claim.invoice_number, amount, receipt_number: receiptNumber } }, token);
      return appendRefreshCookies(Response.json({ ok: true, paymentId, receiptId, receiptNumber, receivedAmount }), session.refreshed, request);
    } else if (action === "send_commission_invoice" || action === "send_commission_receipt") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can send commission accounts.");
      const claimId = uuid(body.claimId, "Commission claim");
      const [claim] = await rest<Json[]>(`commission_claims?select=*&id=eq.${claimId}&limit=1`, token);
      if (!claim) throw new InputError("Commission invoice was not found.");
      const recipient = required(body.recipient || claim.counterparty_email, "Counterparty email");
      if (!/^\S+@\S+\.\S+$/.test(recipient)) throw new InputError("Counterparty email is invalid.");
      const name = String(claim.partner_name || claim.institution || "Accounts team");
      const invoiceNumber = String(claim.invoice_number || "Commission invoice");
      const total = Number(claim.expected_amount ?? 0);
      const received = Number(claim.received_amount ?? 0);
      let subject = `${invoiceNumber} from Maximus Education`;
      let text = `Dear ${name},\n\nCommission invoice ${invoiceNumber}\nNet commission: ${claim.currency || "AUD"} ${Number(claim.net_amount ?? total).toFixed(2)}\nTax (${Number(claim.tax_rate ?? 0).toFixed(2)}%): ${claim.currency || "AUD"} ${Number(claim.tax_amount ?? 0).toFixed(2)}\nTotal: ${claim.currency || "AUD"} ${total.toFixed(2)}\nDue: ${claim.due_on || "On receipt"}\nStudents: ${Number(claim.student_count ?? 0)}\n\nRegards,\nMaximus Education`;
      if (action === "send_commission_receipt") {
        const payments = await rest<Json[]>(`commission_payments?select=id,amount,paid_at&claim_id=eq.${claimId}&order=paid_at.desc&limit=1`, token);
        if (!payments[0]) throw new InputError("Record a payment before sending a receipt.");
        const receipts = await rest<Json[]>(`commission_receipts?select=receipt_number,issued_at&payment_id=eq.${payments[0].id}&limit=1`, token);
        subject = `Receipt ${receipts[0]?.receipt_number || ""} for ${invoiceNumber}`.trim();
        text = `Dear ${name},\n\nReceipt: ${receipts[0]?.receipt_number || "Recorded receipt"}\nCommission invoice: ${invoiceNumber}\nPayment received: ${claim.currency || "AUD"} ${Number(payments[0].amount).toFixed(2)}\nTotal received: ${claim.currency || "AUD"} ${received.toFixed(2)}\nPending: ${claim.currency || "AUD"} ${Math.max(0, total - received).toFixed(2)}\n\nRegards,\nMaximus Education`;
      }
      await sendEmail({ to: recipient, subject, text, html: escapeHtml(text).replace(/\n/g, "<br>") });
      await insert("audit_events", { organisation_id: org, actor_id: actor, action: action === "send_commission_invoice" ? "commission.invoice_sent" : "commission.receipt_sent", resource_type: "commission_claim", resource_id: claimId, summary: `${subject} sent to ${recipient}`, after_data: { recipient } }, token);
      return appendRefreshCookies(Response.json({ ok: true, recipient }), session.refreshed, request);
    } else if (action === "link_client_account") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can link client accounts.");
      await insert("client_user_links", { profile_id: uuid(body.profileId, "Profile"), client_id: uuid(body.clientId, "Client") }, token, "resolution=merge-duplicates,return=minimal");
    } else if (action === "unlink_client_account") {
      if (session.identity.role === "staff") throw new LiveAccessError(403, "Only administrators can unlink client accounts.");
      await remove("client_user_links", `profile_id=eq.${uuid(body.profileId, "Profile")}`, token);
    } else if (action === "record_export") {
      // Exporting client records is a disclosure. It is recorded against the
      // person who did it, with what they took, before the file is produced.
      const scope = optional(body.scope) || "unknown";
      const count = Number(body.count ?? 0);
      await insert("audit_events", { organisation_id: org, actor_id: actor, action: "records.exported", resource_type: "export", resource_id: scope, summary: `Exported ${Number.isFinite(count) ? count : 0} case records (${scope})`, after_data: { scope, count: Number.isFinite(count) ? count : 0 } }, token);
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
async function remove(table: string, filter: string, token: string) { await supabaseRequest(`/rest/v1/${table}?${filter}`, { method: "DELETE" }, token); }
function group(rows: Json[], key: string) { return rows.reduce<Record<string, number>>((acc, row) => { const value = String(row[key] ?? "unknown"); acc[value] = (acc[value] ?? 0) + 1; return acc; }, {}); }
function required(value: unknown, label: string) { const parsed = optional(value); if (!parsed) throw new InputError(`${label} is required.`); return parsed; }
function optional(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function uuid(value: unknown, label: string) { const parsed = required(value, label); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new InputError(`${label} is invalid.`); return parsed; }
function optionalUuid(value: unknown) { const parsed = optional(value); return parsed ? uuid(parsed, "Identifier") : null; }
function optionalDate(value: unknown) { const parsed = optional(value); if (!parsed) return null; const date = new Date(parsed); if (Number.isNaN(date.getTime())) throw new InputError("Date is invalid."); return date.toISOString(); }
function positiveNumber(value: unknown, label: string) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed <= 0) throw new InputError(`${label} must be greater than zero.`); return parsed; }
function nonNegativeNumber(value: unknown, label: string) { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new InputError(`${label} cannot be negative.`); return parsed; }
function safePath(value: unknown) { const parsed = optional(value); return parsed?.startsWith("/") && !parsed.startsWith("//") ? parsed : null; }
function isObject(value: unknown): value is Json { return typeof value === "object" && value !== null && !Array.isArray(value); }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character); }
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof EmailProviderError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this operation." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error); return Response.json({ ok: false, error: "The operation could not be completed." }, { status: 500 });
}
