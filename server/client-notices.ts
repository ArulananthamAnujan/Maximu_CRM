/**
 * Immediate delivery of a client notice the database has just queued.
 *
 * Requesting a document (or sending an agreement) writes a row to
 * public.client_notice_outbox through a trigger, which is the durable record
 * of the notice and the thing the scheduled Netlify function retries from.
 * That function runs once a minute on Netlify and nowhere else, so this
 * module drains the outbox in-process straight after the write: the client
 * hears about the request within seconds on every host, and a failure here
 * is simply left for the next scheduled attempt.
 *
 * Nothing here can fail the request it rides along with.
 */
import { deliverClientNotices } from "../netlify/lib/client-notice-delivery.mjs";
import { emailSettings } from "@/server/email";
import { caseSenders, mailPossible, sendStaffEmail } from "@/server/staff-mail";
import { serviceRoleKey, supabaseConfig } from "@/server/supabase";

type QueuedNotice = {
  id: string;
  organisation_id: string;
  case_id: string | null;
  payload: { to?: string[]; subject?: string; text?: string } | null;
};

/** Delivers one claimed notice from the case owner's or supervisor's Gmail, or the system sender. */
async function sendNotice(row: QueuedNotice): Promise<{ id: string | null }> {
  const to = row.payload?.to?.[0];
  if (!to) throw new Error("The notice has no recipient.");
  const result = await sendStaffEmail({
    organisationId: row.organisation_id,
    senders: await caseSenders(row.case_id),
    to,
    subject: row.payload?.subject ?? "A message from your Maximus case team",
    text: row.payload?.text ?? "",
  });
  return { id: result.id ?? `${result.via}:${row.id}` };
}

export async function drainClientNotices(origin: string): Promise<{ sent: number }> {
  const email = emailSettings();
  const values: Record<string, string> = {
    SUPABASE_URL: supabaseConfig().url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey(),
    RESEND_API_KEY: email.apiKey,
    RESEND_API_BASE: email.apiBase,
    RESEND_FROM_EMAIL: email.from,
  };
  if (!values.SUPABASE_SERVICE_ROLE_KEY || !mailPossible()) return { sent: 0 };
  try {
    const result = await deliverClientNotices({ env: (name: string) => values[name] ?? "", origin, send: sendNotice });
    return { sent: result.sent };
  } catch (error) {
    // The scheduled function retries from the outbox; this is best effort.
    console.error("Client notice delivery will be retried", error);
    return { sent: 0 };
  }
}
