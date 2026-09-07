import { supabaseRequest, SupabaseError } from "./supabase";

type Json = Record<string, unknown>;
export class FinanceInputError extends Error {}

export function financeRequestId(body: Json): string {
  const id = body.requestId ?? crypto.randomUUID();
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
    throw new FinanceInputError("The transaction request ID is invalid.");
  return id;
}

export async function financeRpc(name: "invoice_ledger_action" | "create_case_invoice" | "reconcile_invoice_payments", body: Json, token: string): Promise<Json> {
  try {
    return await supabaseRequest<Json>(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) }, token);
  } catch (error) {
    if (error instanceof SupabaseError) {
      let detail: { code?: string; message?: string } = {};
      try { detail = JSON.parse(error.message); } catch { /* Preserve unknown provider failures. */ }
      if (detail.code === "22023") throw new FinanceInputError(detail.message || "The transaction details are invalid.");
    }
    throw error;
  }
}

export function recordInvoiceAction(body: Json, action: string, invoiceId: string, token: string) {
  return financeRpc("invoice_ledger_action", {
    p_invoice: invoiceId, p_action: action, p_amount: body.amount === undefined ? null : Number(body.amount),
    p_currency: typeof body.currency === "string" ? body.currency.toUpperCase() : null,
    p_method: body.method ?? null, p_reference: body.reason ?? body.reference ?? null,
    p_external_reference: body.externalReference ?? null, p_request: financeRequestId(body),
  }, token);
}
