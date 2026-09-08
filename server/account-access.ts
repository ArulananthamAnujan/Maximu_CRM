import { emailConfigured, sendEmail } from "@/server/email";
import { supabaseAdminRequest, supabaseRequest, SupabaseError } from "@/server/supabase";

export type AccountEmailResult = {
  emailSent: boolean;
  deliveryStatus: "accepted" | "failed";
  deliveryError?: string;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Generate and actually send setup access. Never return a credential to the inviter. */
export async function sendAccountSetup(params: {
  email: string;
  name: string;
  origin: string;
  invitation?: boolean;
}): Promise<AccountEmailResult> {
  const redirectTo = `${params.origin}/auth/google-callback?setup=1`;
  try {
    if (params.invitation) {
      // A pending CRM invitation is claimed only after this address signs in.
      await supabaseRequest(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST", body: JSON.stringify({ email: params.email, create_user: true }),
      });
    } else if (emailConfigured()) {
      const generated = await supabaseAdminRequest<{
        action_link?: string; properties?: { action_link?: string };
      }>("/auth/v1/admin/generate_link", {
        method: "POST",
        body: JSON.stringify({ type: "recovery", email: params.email, redirect_to: redirectTo }),
      });
      const setupLink = generated.action_link || generated.properties?.action_link;
      if (!setupLink) throw new Error("Account setup link was not generated.");
      await sendEmail({
        to: params.email,
        subject: "Set up your Maximus CRM account",
        text: `Hello ${params.name},\n\nYour Maximus CRM username is ${params.email}.\nSet your password using this one-time link:\n${setupLink}\n\nSign in at ${params.origin}.\nIf the link expires, ask your Maximus team to resend your account email.`,
        html: `<p>Hello ${escapeHtml(params.name)},</p><p>Your Maximus CRM username is <strong>${escapeHtml(params.email)}</strong>.</p><p><a href="${escapeHtml(setupLink)}">Set your password securely</a></p><p>Sign in at <a href="${escapeHtml(params.origin)}">Maximus CRM</a>.</p><p>If the link expires, ask your Maximus team to resend your account email.</p>`,
      });
    } else {
      // Supabase Auth's configured mail service can send account emails even
      // when the CRM's separate transactional email provider is not configured.
      await supabaseRequest(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: "POST", body: JSON.stringify({ email: params.email }),
      });
    }
    return { emailSent: true, deliveryStatus: "accepted" };
  } catch (error) {
    // Do not disclose provider responses containing addresses or setup tokens.
    const rateLimited = error instanceof SupabaseError && error.status === 429;
    return {
      emailSent: false,
      deliveryStatus: "failed",
      deliveryError: rateLimited
        ? "The email service is temporarily rate limited. Wait a minute, then resend the account email."
        : "The email service did not accept the setup email. Check the configured sending service and verified sender, then resend the account email.",
    };
  }
}

/** Auth's user list is paginated; an email query alone is not an exact lookup. */
export async function findAccountByEmail(email: string): Promise<{ id: string; email?: string } | null> {
  for (let page = 1; ; page += 1) {
    const result = await supabaseAdminRequest<{ users?: { id: string; email?: string }[] }>(
      `/auth/v1/admin/users?page=${page}&per_page=1000`,
    );
    const users = result.users ?? [];
    const match = users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (users.length < 1000) return null;
  }
}
