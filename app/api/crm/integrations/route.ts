import {
  appendRefreshCookies,
  LiveAccessError,
  liveSession,
} from "@/server/supabase-session";
import { driveProbe } from "@/server/google-drive";
import { serviceRoleKey, supabaseRequest } from "@/server/supabase";
import { protectionConfigured } from "@/server/protected-fields";

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
    const integrations = [
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
        state: "not_built",
        detail:
          "Drafts are recorded against the case. No mail provider is connected, so nothing is sent from here — send it from your own mailbox and mark the draft ready.",
        setup: [],
      },
      {
        key: "calendar",
        name: "Google Calendar",
        purpose: "Two-way sync of appointments and staff availability.",
        state: "not_built",
        detail:
          "Appointments are stored in this CRM only. They do not appear in anyone's Google Calendar.",
        setup: [],
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
        state: "not_built",
        detail:
          "Sign-in is Supabase email and password. The Google button on the sign-in page is not wired to an OAuth flow.",
        setup: [],
      },
      {
        key: "ai",
        name: "AI assistant",
        purpose: "Drafting and summarising against the case file.",
        state: "not_built",
        detail: "A placeholder screen. No provider is connected.",
        setup: [],
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
