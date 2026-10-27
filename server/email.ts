/**
 * System email -- the CRM notifying a client itself, distinct from a staff
 * member's own connected Gmail (server/gmail.ts) sending as themselves. Used
 * for document and invoice requests and for a new portal login. The key
 * lives with the application, the same pattern as server/ai.ts and
 * server/google-drive.ts, so it works unchanged on Cloudflare Workers.
 */

declare global {
  // Populated by the Worker entry point at request time.
  var __MAXIMUS_EMAIL__:
    | { apiKey?: string; apiBase?: string; from?: string }
    | undefined;
}

function apiKey(): string {
  return (
    globalThis.__MAXIMUS_EMAIL__?.apiKey || process.env.RESEND_API_KEY || ""
  );
}

function apiBase(): string {
  return (
    globalThis.__MAXIMUS_EMAIL__?.apiBase ||
    process.env.RESEND_API_BASE ||
    "https://api.resend.com"
  );
}

// The address a client sees mail arrive from. Resend requires a domain
// verified against the account the API key belongs to; the default is
// unlikely to be deliverable and exists only so a deployment without one
// configured fails obviously rather than silently.
function fromAddress(): string {
  return (
    globalThis.__MAXIMUS_EMAIL__?.from ||
    process.env.RESEND_FROM_EMAIL ||
    "Maximus CRM <notifications@example.invalid>"
  );
}

export function emailConfigured(): boolean {
  // An API key alone is not enough to actually deliver anything: Resend
  // requires a verified sending address, and the fallback above is a
  // placeholder that exists only to fail obviously rather than silently.
  return apiKey().length > 0 && fromAddress() !== "Maximus CRM <notifications@example.invalid>";
}

export class EmailProviderError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Sends one email through Resend. Callers that trigger this alongside a
 * write a client is waiting on (a document request, an invoice) should
 * catch and log rather than let a delivery failure fail the write itself --
 * the record exists whether or not the notice about it does.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const key = apiKey();
  if (!key) throw new EmailProviderError(503, "Email is not configured.");
  const response = await fetch(`${apiBase()}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new EmailProviderError(
      response.status,
      detail || `Resend rejected the email (${response.status}).`,
    );
  }
}

/** {{token}} substitution. Unknown tokens are left as-is rather than blanked, so a typo in a template is visible instead of silently disappearing. */
export function renderTemplate(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

/** Read-only sender diagnostics. Never returns the API key or provider response body. */
export async function emailSenderDiagnostics(): Promise<string> {
  if (!emailConfigured()) return "Email sender or API key is missing.";
  const address = fromAddress().match(/<([^>]+)>/)?.[1] || fromAddress();
  const domain = address.split("@")[1]?.toLowerCase();
  if (!domain) return "The configured sender email address is invalid.";
  try {
    const response = await fetch(`${apiBase()}/domains`, { headers: { Authorization: `Bearer ${apiKey()}` }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return `Sender verification could not be inspected (HTTP ${response.status}). A sending-only API key may not allow domain inspection. Check sender-domain verification in Resend.`;
    const result = await response.json() as {data?:{name:string;status:string}[]};
    const sender = result.data?.find(row=>row.name.toLowerCase()===domain);
    const verified = (result.data || []).filter(row=>row.status === "verified").map(row=>row.name).join(", ");
    if (domain === "resend.dev") return `The CRM is using the Resend test sender, which is restricted to the provider account owner. Configure a sender on your own verified domain. Verified domains available: ${verified || "none"}.`;
    return sender ? `Sender domain ${domain}: ${sender.status}.` : `Sender domain ${domain} is not listed in this email-provider account. Verify it in Resend or configure a sender on an already verified domain.`;
  } catch { return "The email provider could not be reached for sender verification."; }
}
