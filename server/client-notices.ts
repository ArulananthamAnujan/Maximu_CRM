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
import { serviceRoleKey, supabaseConfig } from "@/server/supabase";

export async function drainClientNotices(origin: string): Promise<{ sent: number }> {
  const email = emailSettings();
  const values: Record<string, string> = {
    SUPABASE_URL: supabaseConfig().url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey(),
    RESEND_API_KEY: email.apiKey,
    RESEND_API_BASE: email.apiBase,
    RESEND_FROM_EMAIL: email.from,
  };
  if (!values.SUPABASE_SERVICE_ROLE_KEY || !email.configured) return { sent: 0 };
  try {
    const result = await deliverClientNotices({ env: (name: string) => values[name] ?? "", origin });
    return { sent: result.sent };
  } catch (error) {
    // The scheduled function retries from the outbox; this is best effort.
    console.error("Client notice delivery will be retried", error);
    return { sent: 0 };
  }
}
