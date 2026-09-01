import { appendRefreshCookies, LiveAccessError, liveSession } from "@/server/supabase-session";
import { sendEmail, EmailProviderError, renderTemplate } from "@/server/email";
import { SupabaseError, supabaseRequest } from "@/server/supabase";
import { sendWhatsappText, WhatsAppError } from "@/server/whatsapp";
import { sendSmsText, SmsError } from "@/server/sms";

export const dynamic = "force-dynamic";
type Json = Record<string, unknown>;

export async function POST(request: Request) {
  try {
    const session = await liveSession(request);
    if (session.identity.role === "client")
      throw new LiveAccessError(403, "Campaigns are available to staff only.");
    const body = (await request.json()) as Json;
    const action = required(body.action, "Action");
    const token = session.accessToken;
    if (action === "create") {
      const ids = uniqueUuids(body.caseIds, "Case");
      if (!ids.length || ids.length > 200)
        throw new InputError("Select between 1 and 200 accessible cases.");
      const channel = required(body.channel, "Channel").toLowerCase();
      if (!['email', 'whatsapp', 'sms'].includes(channel)) throw new InputError("Campaign channel is invalid.");
      const subject = optional(body.subject) ?? "";
      if (channel === "email" && !subject) throw new InputError("Email subject is required.");
      const cases = await rest<Json[]>(
        `cases?select=id,case_number,client_id,branch_id,clients!inner(first_name,last_name,email,mobile)&id=in.(${ids.join(",")})`,
        token,
      );
      if (cases.length !== ids.length)
        throw new LiveAccessError(403, "One or more selected cases are not available to you.");
      const campaignId = crypto.randomUUID();
      const campaignBody = required(body.body, "Message");
      await insert("communication_campaigns", {
        id: campaignId,
        organisation_id: session.identity.organisationId,
        branch_id: session.identity.role === "super_admin" ? optionalUuid(body.branchId) : session.identity.branchId,
        created_by: session.identity.profileId,
        name: required(body.name, "Campaign name"),
        channel,
        subject: subject || null,
        body: campaignBody,
        audience_filter: { case_ids: ids },
        status: "draft",
        recipient_count: cases.length,
      }, token);
      const recipients = cases.map((row) => {
        const client = (row.clients as Json | null) ?? {};
        const clientName = [client.first_name, client.last_name].filter(Boolean).join(" ");
        const variables = { client_name: clientName, case_number: String(row.case_number ?? "") };
        const destination = channel === "email" ? String(client.email ?? "") : String(client.mobile ?? "");
        if (!destination.trim()) throw new InputError(`${clientName || row.case_number} has no ${channel === "email" ? "email address" : "mobile number"}.`);
        return {
          id: crypto.randomUUID(), organisation_id: session.identity.organisationId,
          campaign_id: campaignId, case_id: row.id, client_id: row.client_id,
          destination, rendered_subject: subject ? renderTemplate(subject, variables) : null,
          rendered_body: renderTemplate(campaignBody, variables), status: "queued",
        };
      });
      await insert("campaign_recipients", recipients, token);
      return appendRefreshCookies(Response.json({ ok: true, campaignId, recipients: recipients.length }), session.refreshed, request);
    }
    if (action === "launch") {
      const campaignId = uuid(body.campaignId, "Campaign");
      const [campaign] = await rest<Json[]>(`communication_campaigns?select=*&id=eq.${campaignId}&limit=1`, token);
      if (!campaign) throw new LiveAccessError(403, "That campaign is not available to you.");
      if (!["draft", "failed"].includes(String(campaign.status)))
        throw new InputError("Only a draft or failed campaign can be launched.");
      const recipients = await rest<Json[]>(`campaign_recipients?select=*&campaign_id=eq.${campaignId}&status=in.(queued,failed)&order=created_at.asc&limit=200`, token);
      await patch("communication_campaigns", campaignId, { status: "running", launched_at: new Date().toISOString(), approved_by: session.identity.profileId }, token);
      let sent = 0;
      let failed = 0;
      for (const recipient of recipients) {
        try {
          let providerMessageId: string | null = null;
          if (campaign.channel === "whatsapp") {
            providerMessageId = (await sendWhatsappText({ to: String(recipient.destination), body: String(recipient.rendered_body) })).id;
          } else if (campaign.channel === "sms") {
            providerMessageId = (await sendSmsText({ to: String(recipient.destination), body: String(recipient.rendered_body) })).id;
          } else {
            await sendEmail({
              to: String(recipient.destination), subject: String(recipient.rendered_subject || campaign.subject || campaign.name),
              text: String(recipient.rendered_body), html: escapeHtml(String(recipient.rendered_body)).replace(/\n/g, "<br>"),
            });
          }
          await patch("campaign_recipients", String(recipient.id), { status: "sent", provider_message_id: providerMessageId, provider_error: null, sent_at: new Date().toISOString() }, token);
          sent += 1;
        } catch (error) {
          await patch("campaign_recipients", String(recipient.id), { status: "failed", provider_error: error instanceof Error ? error.message.slice(0, 1000) : "Provider failure" }, token).catch(() => undefined);
          failed += 1;
        }
      }
      await patch("communication_campaigns", campaignId, { status: failed ? "failed" : "completed", sent_count: Number(campaign.sent_count ?? 0) + sent, failed_count: failed, completed_at: new Date().toISOString() }, token);
      await insert("audit_events", {
        organisation_id: session.identity.organisationId, actor_id: session.identity.profileId,
        action: "campaign.launched", resource_type: "communication_campaign", resource_id: campaignId,
        summary: `Launched ${campaign.channel} campaign: ${sent} sent, ${failed} failed`, after_data: { sent, failed },
      }, token);
      return appendRefreshCookies(Response.json({ ok: true, sent, failed }), session.refreshed, request);
    }
    throw new InputError("Unsupported campaign action.");
  } catch (error) {
    return apiError(error);
  }
}

async function rest<T>(query: string, token: string): Promise<T> { return supabaseRequest<T>(`/rest/v1/${query}`, { method: "GET" }, token); }
async function insert(table: string, value: Json | Json[], token: string) { await supabaseRequest(`/rest/v1/${table}`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(value) }, token); }
async function patch(table: string, id: string, value: Json, token: string) { await supabaseRequest(`/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(value) }, token); }
function optional(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function required(value: unknown, label: string) { const parsed = optional(value); if (!parsed) throw new InputError(`${label} is required.`); return parsed; }
function uuid(value: unknown, label: string) { const parsed = required(value, label); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new InputError(`${label} is invalid.`); return parsed; }
function optionalUuid(value: unknown) { const parsed = optional(value); return parsed ? uuid(parsed, "Branch") : null; }
function uniqueUuids(value: unknown, label: string) { return [...new Set((Array.isArray(value) ? value : []).map((item) => uuid(item, label)))]; }
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char); }
class InputError extends Error {}
function apiError(error: unknown): Response {
  if (error instanceof InputError) return Response.json({ ok: false, error: error.message }, { status: 400 });
  if (error instanceof LiveAccessError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  if (error instanceof EmailProviderError || error instanceof WhatsAppError || error instanceof SmsError) return Response.json({ ok: false, error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 503 });
  if (error instanceof SupabaseError) return Response.json({ ok: false, error: "The database rejected this campaign action." }, { status: error.status >= 400 && error.status < 500 ? error.status : 503 });
  console.error(error); return Response.json({ ok: false, error: "The campaign action could not be completed." }, { status: 500 });
}
