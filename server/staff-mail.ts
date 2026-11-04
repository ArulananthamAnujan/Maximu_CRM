/**
 * Email the CRM sends about a case goes from a staff member's own connected
 * Gmail: the client sees the officer's real address and a reply lands in the
 * officer's inbox, on the same thread the Messages screen already reads. The
 * agency pays nothing beyond the Google Workspace accounts it already has.
 *
 * The order of preference is the person pressing send, then the case owner,
 * then the supervisor. The system sender in server/email.ts (Resend) is only
 * the fallback for when nobody involved has connected Gmail, and a
 * deployment without it still sends every case email this way.
 */
import { EmailProviderError, emailConfigured, emailSettings, sendEmail } from "@/server/email";
import { buildRawMessage, GmailError, gmailRefreshAccessToken, gmailSend } from "@/server/gmail";
import { googleOAuthConfigured } from "@/server/google-oauth-client";
import { protect, reveal } from "@/server/protected-fields";
import { serviceRoleKey, supabaseAdminRequest } from "@/server/supabase";

type Connection = {
  id: string;
  email: string;
  token_reference: string | null;
  active: boolean;
};

/** Whether any route can deliver email at all: a Google OAuth client for staff Gmail, or the system sender. */
export function mailPossible(): boolean {
  return emailConfigured() || (googleOAuthConfigured() && Boolean(serviceRoleKey()));
}

/**
 * The people who speak for a case, in order: the acting officer, then the
 * case owner, then the supervisor. Any of them with Gmail connected can send.
 */
export async function caseSenders(
  caseId: string | null | undefined,
  actingProfileId?: string | null,
): Promise<string[]> {
  const ids = actingProfileId ? [actingProfileId] : [];
  if (caseId && serviceRoleKey()) {
    try {
      const [row] = await supabaseAdminRequest<{ owner_id: string | null; supervisor_id: string | null }[]>(
        `/rest/v1/cases?select=owner_id,supervisor_id&id=eq.${encodeURIComponent(caseId)}&limit=1`,
      );
      for (const id of [row?.owner_id, row?.supervisor_id])
        if (id && !ids.includes(id)) ids.push(id);
    } catch {
      // Whoever is already listed still gets the chance to send.
    }
  }
  return ids;
}

async function connectionFor(profileId: string, organisationId: string): Promise<Connection | null> {
  const rows = await supabaseAdminRequest<Connection[]>(
    `/rest/v1/mailbox_connections?select=id,email,token_reference,active&profile_id=eq.${encodeURIComponent(profileId)}&organisation_id=eq.${encodeURIComponent(organisationId)}&provider=eq.gmail&active=is.true&limit=1`,
  );
  const row = rows[0];
  return row?.token_reference ? row : null;
}

async function senderName(profileId: string): Promise<string> {
  try {
    const [row] = await supabaseAdminRequest<{ display_name: string | null }[]>(
      `/rest/v1/profiles?select=display_name&id=eq.${encodeURIComponent(profileId)}&limit=1`,
    );
    return String(row?.display_name ?? "").trim();
  } catch {
    return "";
  }
}

export type StaffMailResult = { via: "gmail" | "system"; from: string; id: string | null };

/**
 * Sends one email from the first listed staff member whose Gmail is
 * connected, falling back to the system sender when none is. Throws an
 * EmailProviderError when neither route can deliver; callers that must not
 * fail the write they ride along with catch and log, as they do already.
 */
export async function sendStaffEmail(params: {
  organisationId: string;
  senders: string[];
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<StaffMailResult> {
  const reasons: string[] = [];
  if (googleOAuthConfigured() && serviceRoleKey()) {
    for (const profileId of params.senders) {
      let connection: Connection | null = null;
      try {
        connection = await connectionFor(profileId, params.organisationId);
      } catch {
        reasons.push("the mailbox connection could not be read");
        continue;
      }
      if (!connection?.token_reference) continue;
      try {
        const refreshToken = await reveal(connection.token_reference);
        const fresh = await gmailRefreshAccessToken(refreshToken);
        const name = await senderName(profileId);
        const raw = buildRawMessage({
          from: name ? `${name.replace(/[<>"]/g, "")} <${connection.email}>` : connection.email,
          to: [params.to],
          subject: params.subject,
          body: params.text,
        });
        const sent = await gmailSend({ accessToken: fresh.access_token, raw });
        // Google may hand back a new refresh token on rotation; keep it if so.
        if (fresh.refresh_token)
          await supabaseAdminRequest(`/rest/v1/mailbox_connections?id=eq.${encodeURIComponent(connection.id)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ token_reference: await protect(fresh.refresh_token) }),
          }).catch(() => undefined);
        return { via: "gmail", from: connection.email, id: sent.id };
      } catch (error) {
        // Never repeat a provider body: it can carry addresses. The status is enough to act on.
        reasons.push(
          error instanceof GmailError
            ? `Gmail refused for ${connection.email} (HTTP ${error.status})`
            : `the Gmail connection for ${connection.email} could not be used`,
        );
      }
    }
  }
  if (emailConfigured()) {
    await sendEmail({
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html ?? escapeHtml(params.text).replace(/\n/g, "<br>"),
    });
    return { via: "system", from: emailSettings().from, id: null };
  }
  throw new EmailProviderError(
    503,
    reasons.length
      ? `This email could not be sent: ${reasons.join("; ")}. Reconnect Gmail under Integrations and try again.`
      : "Connect your Gmail account under Integrations to send email from the CRM.",
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}
