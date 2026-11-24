/**
 * Immediate delivery of the task emails the database has just queued.
 *
 * Assigning, editing, reopening, completing or commenting on a task writes a
 * row to public.task_email_outbox through a trigger. Until now only the
 * scheduled Netlify function sent those, and only through the system sender,
 * so a deployment that relies on staff Gmail sent no task email at all. This
 * drains the queue in-process straight after the change, from a connected
 * Gmail: the person who made the change, then the case owner and supervisor,
 * then the recipient's own mailbox. The system sender remains the fallback.
 *
 * Nothing here can fail the request it rides along with.
 */
import { deliverTaskEmails } from "../netlify/lib/task-email-delivery.mjs";
import { emailSettings } from "@/server/email";
import { caseSenders, mailPossible, sendStaffEmail } from "@/server/staff-mail";
import { serviceRoleKey, supabaseAdminRequest, supabaseConfig } from "@/server/supabase";

type QueuedTaskEmail = {
  id: string;
  organisation_id: string;
  task_id: string;
  recipient_id: string;
  payload: { to?: string[]; subject?: string; text?: string } | null;
};

export async function drainTaskEmails(origin: string, actingProfileId?: string | null): Promise<{ sent: number }> {
  const email = emailSettings();
  const values: Record<string, string> = {
    SUPABASE_URL: supabaseConfig().url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey(),
    RESEND_API_KEY: email.apiKey,
    RESEND_FROM_EMAIL: email.from,
  };
  if (!values.SUPABASE_SERVICE_ROLE_KEY || !mailPossible()) return { sent: 0 };
  const send = async (row: QueuedTaskEmail): Promise<{ id: string | null }> => {
    const to = row.payload?.to?.[0];
    if (!to) throw new Error("The task email has no recipient.");
    let caseId: string | null = null;
    try {
      const [task] = await supabaseAdminRequest<{ case_id: string | null }[]>(
        `/rest/v1/tasks?select=case_id&id=eq.${encodeURIComponent(row.task_id)}&limit=1`,
      );
      caseId = task?.case_id ?? null;
    } catch {
      // The acting officer and the recipient can still send.
    }
    const senders = await caseSenders(caseId, actingProfileId);
    if (!senders.includes(row.recipient_id)) senders.push(row.recipient_id);
    const result = await sendStaffEmail({
      organisationId: row.organisation_id,
      senders,
      to,
      subject: row.payload?.subject ?? "A task was updated in Maximus CRM",
      text: row.payload?.text ?? "",
    });
    return { id: result.id ?? `${result.via}:${row.id}` };
  };
  try {
    const result = await deliverTaskEmails({ env: (name: string) => values[name] ?? "", origin, send });
    return { sent: result.sent };
  } catch (error) {
    // Whatever is still queued goes out on the next task change or scheduled run.
    console.error("Task email delivery will be retried", error);
    return { sent: 0 };
  }
}
