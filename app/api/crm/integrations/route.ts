import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { driveProbe } from "@/server/google-drive";
import { serviceRoleKey, supabaseRequest } from "@/server/supabase";
import { aiConfigured } from "@/server/ai";
import { emailConfigured } from "@/server/email";
import { protectionConfigured } from "@/server/protected-fields";
import { gmailOAuthConfigured } from "@/server/gmail";

/**
 * What is actually connected, checked rather than claimed. Drive is probed for
 * real, so configuration that is present but wrong is reported as broken
 * instead of as connected.
 *
 * Three states are reported and they mean different things:
 *   connected      - working now
 *   not_configured - built, but this deployment has not been given credentials
 *   not_built      - not implemented; no amount of configuration will turn it on
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await liveSession(request);
    const role = session.identity.role;
    if (role !== "super_admin" && role !== "admin")
      throw new LiveAccessError(403, "Administrator access is required.");

    const drive = await driveProbe();
    // Retention is a compliance obligation, not a feature: a migration seeds
    // seven-year rules, and this reports whether they are actually there.
    const retention = await supabaseRequest<
      { resource_type: string; retain_days: number }[]
    >(
      "/rest/v1/data_retention_rules?select=resource_type,retain_days",
      { method: "GET" },
      session.accessToken,
    ).catch(() => []);
    // The Google provider toggle lives in the Supabase dashboard, not in this
    // deployment's own environment, so it is read back from Supabase's own
    // public settings endpoint rather than assumed from anything set here.
    const authSettings = await supabaseRequest<{ external?: { google?: boolean } }>(
      "/auth/v1/settings",
      { method: "GET" },
    ).catch(() => null);
    const googleSignInEnabled = authSettings?.external?.google === true;
    const gmailReady = gmailOAuthConfigured();
    const [backups, drills, checks, incidents] = await Promise.all([
      supabaseRequest<{ status: string; completed_at: string | null; object_path: string | null }[]>("/rest/v1/backup_runs?select=status,completed_at,object_path&order=started_at.desc&limit=1", { method: "GET" }, session.accessToken).catch(() => []),
      supabaseRequest<{ status: string; completed_at: string | null }[]>("/rest/v1/restore_drills?select=status,completed_at&order=started_at.desc&limit=1", { method: "GET" }, session.accessToken).catch(() => []),
      supabaseRequest<{ component: string; status: string; checked_at: string; details: Record<string, unknown> }[]>("/rest/v1/operational_checks?select=component,status,checked_at,details&order=checked_at.desc&limit=50", { method: "GET" }, session.accessToken).catch(() => []),
      supabaseRequest<{ id: string }[]>("/rest/v1/operational_incidents?select=id&status=neq.resolved", { method: "GET" }, session.accessToken).catch(() => []),
    ]);
    const latestCheck = (component: string) => checks.find((row) => row.component === component);
    const backupReady = backups[0]?.status === "completed" && drills[0]?.status === "passed";
    const integrations = [
      {
        key: "backup_restore",
        name: "Database backup and restore drill",
        purpose: "Daily logical archive plus automatic checksum and relationship validation.",
        state: backupReady ? "connected" : "not_configured",
        detail: backupReady
          ? `Latest backup and restore drill passed ${drills[0]?.completed_at ?? backups[0]?.completed_at}.`
          : "No successful production backup and restore drill is recorded yet. The scheduled production-operations function must complete once after migration 0031.",
        setup: ["SUPABASE_SERVICE_ROLE_KEY"],
      },
      {
        key: "monitoring",
        name: "Monitoring and incident alerts",
        purpose: "Checks database, deployment headers, Gmail, Drive, backups and retry queues every day.",
        state: latestCheck("database")?.status === "healthy" && incidents.length === 0 ? "connected" : "not_configured",
        detail: `${incidents.length} open incident${incidents.length === 1 ? "" : "s"}. Latest database check: ${latestCheck("database")?.checked_at ?? "not run"}.`,
        setup: ["INCIDENT_ALERT_WEBHOOK_URL"],
      },
      {
        key: "security_headers",
        name: "Production security headers",
        purpose: "Verifies the public deployment sends CSP, HSTS, clickjacking and content-type protections.",
        state: latestCheck("security_headers")?.status === "healthy" ? "connected" : "not_configured",
        detail: latestCheck("security_headers")?.status === "healthy"
          ? `Verified ${latestCheck("security_headers")?.checked_at}.`
          : "The repository config is present, but the scheduled live response check has not passed yet.",
        setup: [],
      },
      {
        key: "drive",
        name: "Google Shared Drive",
        purpose: "Client folders and every uploaded document.",
        state: drive.connected ? "connected" : "not_configured",
        detail: drive.detail,
        setup: [
          "GOOGLE_SERVICE_ACCOUNT_EMAIL",
          "GOOGLE_PRIVATE_KEY",
          "GOOGLE_SHARED_DRIVE_ID",
        ],
      },
      {
        key: "field_encryption",
        name: "Passport encryption",
        purpose:
          "Passport numbers are encrypted before storage and shown masked.",
        state: protectionConfigured() ? "connected" : "not_configured",
        detail: protectionConfigured()
          ? "Passport numbers are encrypted with the configured key."
          : "FIELD_ENCRYPTION_KEY is not set, so passport numbers cannot be stored. Generate one with: openssl rand -base64 32",
        setup: ["FIELD_ENCRYPTION_KEY"],
      },
      {
        key: "retention",
        name: "Record retention",
        purpose: "How long each kind of record is kept before review.",
        state: retention.length > 0 ? "connected" : "not_configured",
        detail:
          retention.length > 0
            ? retention
                .map(
                  (rule) =>
                    `${rule.resource_type.replace(/_/g, " ")}: ${Math.round(
                      rule.retain_days / 365,
                    )} years`,
                )
                .join(" · ")
            : "No retention rules are recorded. Apply supabase/migrations/0010_case_file.sql, which seeds seven-year rules for client files, case notes, communications and invoices.",
        setup: [],
      },
      {
        key: "staff_logins",
        name: "Creating staff logins",
        purpose: "Adding a member of staff from inside the CRM.",
        state: serviceRoleKey() ? "connected" : "not_configured",
        detail: serviceRoleKey()
          ? "Staff & Masters creates the login and the CRM account together, and hands you a one-time password."
          : "Staff & Masters records the invitation instead. Create the Supabase login for that address yourself (Authentication -> Users -> Add user); their CRM account is set up the first time they sign in.",
        setup: ["SUPABASE_SERVICE_ROLE_KEY"],
      },
      {
        key: "gmail",
        name: "Gmail sending",
        purpose: "Send case-linked email from the CRM.",
        state: gmailReady ? "connected" : "not_configured",
        detail: gmailReady
          ? "Each member of staff connects their own Gmail account from Messages and sends drafts as themselves."
          : "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are not set, so nobody can connect a Gmail account yet. Drafts are still recorded against the case — send from your own mailbox and mark the draft ready until this is configured.",
        setup: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
      },
      {
        key: "calendar",
        name: "Google Calendar",
        purpose: "Push appointments onto a member of staff's own calendar.",
        state: gmailReady ? "connected" : "not_configured",
        detail: gmailReady
          ? "Each member of staff connects their own Google Calendar from Calendar. One direction only: a CRM appointment is created and, on cancellation, removed on their calendar -- nothing is read back the other way."
          : "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are not set, so nobody can connect a calendar yet. Appointments are still stored in this CRM only until this is configured.",
        setup: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
      },
      {
        key: "whatsapp",
        name: "WhatsApp",
        purpose: "Client messaging over WhatsApp Business.",
        state: "not_built",
        detail: "Not implemented.",
        setup: [],
      },
      {
        key: "google_signin",
        name: "Google sign-in",
        purpose: "Staff sign in with their Maximus Google account.",
        state: googleSignInEnabled ? "connected" : "not_configured",
        detail: googleSignInEnabled
          ? "The Google button on the sign-in page redirects through Supabase's Google provider, checked the same way an actual sign-in would."
          : "The Google button on the sign-in page is wired up, but the Google provider is not yet switched on for this Supabase project (Authentication -> Providers -> Google).",
        setup: [],
      },
      {
        key: "email",
        name: "Client email notices",
        purpose: "Emails a client when a document or invoice is requested, and when their portal access is sent.",
        state: emailConfigured() ? "connected" : "not_configured",
        detail: emailConfigured()
          ? "Sent through Resend. Wording is editable per organisation under Templates."
          : "RESEND_API_KEY and RESEND_FROM_EMAIL are not set, so these emails are not sent -- the underlying request or invoice is still recorded either way.",
        setup: ["RESEND_API_KEY", "RESEND_FROM_EMAIL"],
      },
      {
        key: "ai",
        name: "AI assistant",
        purpose: "Drafting and summarising against the case file.",
        state: aiConfigured() ? "connected" : "not_configured",
        detail: aiConfigured()
          ? "Drafts and summarises against one case at a time, using only that case's own facts. Nothing it writes is saved until a person chooses to."
          : "ANTHROPIC_API_KEY is not set, so the assistant screen has nothing to call.",
        setup: ["ANTHROPIC_API_KEY"],
      },
    ];

    return appendRefreshCookies(
      Response.json(
        { ok: true, integrations, checkedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
      ),
      session.refreshed,
      request,
    );
  } catch (error) {
    if (error instanceof LiveAccessError)
      return Response.json(
        { ok: false, error: error.message },
        { status: error.status },
      );
    console.error(error);
    return Response.json(
      { ok: false, error: "The integration status could not be read." },
      { status: 500 },
    );
  }
}
