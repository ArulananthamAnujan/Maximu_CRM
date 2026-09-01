/** WhatsApp Business Cloud API transport. No secret is exposed to the client. */

declare global {
  var __MAXIMUS_WHATSAPP__:
    | Partial<{
        accessToken: string;
        phoneNumberId: string;
        verifyToken: string;
        appSecret: string;
        apiVersion: string;
        apiBase: string;
      }>
    | undefined;
}

function value(runtime: keyof NonNullable<typeof globalThis.__MAXIMUS_WHATSAPP__>, env: string) {
  return String(globalThis.__MAXIMUS_WHATSAPP__?.[runtime] || process.env[env] || "").trim();
}

export function whatsappConfig() {
  return {
    accessToken: value("accessToken", "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: value("phoneNumberId", "WHATSAPP_PHONE_NUMBER_ID"),
    verifyToken: value("verifyToken", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    appSecret: value("appSecret", "WHATSAPP_APP_SECRET"),
    apiVersion: value("apiVersion", "WHATSAPP_GRAPH_API_VERSION"),
    apiBase: value("apiBase", "WHATSAPP_GRAPH_API_BASE") || "https://graph.facebook.com",
  };
}

export function whatsappConfigured(): boolean {
  const config = whatsappConfig();
  return Boolean(config.accessToken && config.phoneNumberId && config.apiVersion);
}

export function normaliseWhatsappNumber(input: string): string {
  return input.replace(/[^0-9]/g, "").replace(/^00/, "");
}

export class WhatsAppError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function sendWhatsappText(params: {
  to: string;
  body: string;
}): Promise<{ id: string }> {
  const config = whatsappConfig();
  if (!whatsappConfigured())
    throw new WhatsAppError(503, "WhatsApp Business is not configured.");
  const to = normaliseWhatsappNumber(params.to);
  if (to.length < 8 || to.length > 15)
    throw new WhatsAppError(400, "The client profile does not have a valid international mobile number.");
  const response = await fetch(
    `${config.apiBase}/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: params.body },
      }),
    },
  );
  const result = (await response.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string };
  };
  if (!response.ok || !result.messages?.[0]?.id)
    throw new WhatsAppError(
      response.status || 502,
      result.error?.message || "WhatsApp rejected the message.",
    );
  return { id: result.messages[0].id };
}
