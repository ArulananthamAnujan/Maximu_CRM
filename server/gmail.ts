/**
 * Sending email through a member of staff's own Gmail account.
 *
 * This is deliberately not a shared organisation mailbox: each connection in
 * mailbox_connections belongs to one profile, carries that person's own
 * OAuth refresh token, and a message is only ever sent as the person who
 * composed it. The signed-in owner may read and search their own inbox; only
 * case-linked conversations are copied into the branch-shared CRM history.
 *
 * Runs on Cloudflare Workers, so token exchange and the send call are made
 * directly against Google's REST endpoints rather than through the Node
 * googleapis SDK.
 */
import {
  googleOAuthClient,
  googleOAuthConfigured,
  GoogleOAuthNotConfiguredError,
} from "@/server/google-oauth-client";

export { GoogleOAuthNotConfiguredError as GmailNotConfiguredError };
export const gmailOAuthConfigured = googleOAuthConfigured;

declare global {
  // Test-only overrides for Google's hosts, mirroring __MAXIMUS_DRIVE__.
  var __MAXIMUS_GOOGLE_HOSTS__:
    | Partial<{ apiBase: string; tokenBase: string; authBase: string }>
    | undefined;
}

export class GmailError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function authBase(): string {
  return (
    globalThis.__MAXIMUS_GOOGLE_HOSTS__?.authBase ||
    process.env.GOOGLE_AUTH_BASE ||
    "https://accounts.google.com"
  );
}
function tokenBase(): string {
  return (
    globalThis.__MAXIMUS_GOOGLE_HOSTS__?.tokenBase ||
    process.env.GOOGLE_TOKEN_BASE ||
    "https://oauth2.googleapis.com"
  );
}
function apiBase(): string {
  return (
    globalThis.__MAXIMUS_GOOGLE_HOSTS__?.apiBase ||
    process.env.GOOGLE_API_BASE ||
    "https://www.googleapis.com"
  );
}

export const GMAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";

export function gmailAuthorizeUrl(options: {
  redirectUri: string;
  state: string;
}): string {
  const { clientId } = googleOAuthClient("Gmail sending");
  const url = new URL(`${authBase()}/o/oauth2/v2/auth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPE);
  url.searchParams.set("access_type", "offline");
  // Forces Google to hand back a refresh token even if this person connected
  // before; without it a reconnect silently returns none.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", options.state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(`${tokenBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!response.ok)
    throw new GmailError(response.status, `Google refused the token request: ${await response.text()}`);
  return (await response.json()) as TokenResponse;
}

export async function gmailExchangeCode(options: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleOAuthClient("Gmail sending");
  return tokenRequest({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

export async function gmailRefreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleOAuthClient("Gmail sending");
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

/** The address behind the tokens, so the connection can be shown and matched. */
export async function gmailAccountEmail(accessToken: string): Promise<string> {
  const response = await fetch(`${apiBase()}/oauth2/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok)
    throw new GmailError(response.status, `Google refused the account lookup: ${await response.text()}`);
  const info = (await response.json()) as { email?: string };
  if (!info.email) throw new GmailError(502, "Google did not return an email address.");
  return info.email;
}

const base64url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const encodeHeaderWord = (value: string): string =>
  /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(value)))}?=`;

/** Builds an RFC 2822 message and base64url-encodes it, as Gmail's send API requires. */
export function buildRawMessage(options: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}): string {
  const lines = [
    `From: ${options.from}`,
    `To: ${options.to.join(", ")}`,
    ...(options.cc && options.cc.length ? [`Cc: ${options.cc.join(", ")}`] : []),
    `Subject: ${encodeHeaderWord(options.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    options.body,
  ];
  return base64url(new TextEncoder().encode(lines.join("\r\n")));
}

export async function gmailSend(options: {
  accessToken: string;
  raw: string;
}): Promise<{ id: string; threadId: string }> {
  const response = await fetch(`${apiBase()}/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: options.raw }),
  });
  if (!response.ok)
    throw new GmailError(response.status, `Gmail refused to send: ${await response.text()}`);
  return (await response.json()) as { id: string; threadId: string };
}

export type GmailMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: GmailMessage["payload"][];
    mimeType?: string;
  };
};

export async function gmailSearchMessages(options: {
  accessToken: string;
  query: string;
  maxResults?: number;
}): Promise<{ id: string; threadId: string }[]> {
  const url = new URL(`${apiBase()}/gmail/v1/users/me/messages`);
  url.searchParams.set("q", options.query);
  url.searchParams.set("maxResults", String(options.maxResults ?? 100));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${options.accessToken}` } });
  if (!response.ok)
    throw new GmailError(response.status, `Gmail refused the inbox search: ${await response.text()}`);
  const result = (await response.json()) as { messages?: { id: string; threadId: string }[] };
  return result.messages ?? [];
}

export async function gmailGetMessage(options: { accessToken: string; id: string }): Promise<GmailMessage> {
  const url = new URL(`${apiBase()}/gmail/v1/users/me/messages/${encodeURIComponent(options.id)}`);
  url.searchParams.set("format", "full");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${options.accessToken}` } });
  if (!response.ok)
    throw new GmailError(response.status, `Gmail refused the message lookup: ${await response.text()}`);
  return (await response.json()) as GmailMessage;
}

export function gmailHeader(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

export function gmailTextBody(payload: GmailMessage["payload"]): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    const body = gmailTextBody(part);
    if (body) return body;
  }
  return payload.body?.data ? decodeBase64Url(payload.body.data) : "";
}
