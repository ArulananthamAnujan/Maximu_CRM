/**
 * Sending email through a member of staff's own Gmail account.
 *
 * This is deliberately not a shared organisation mailbox: each connection in
 * mailbox_connections belongs to one profile, carries that person's own
 * OAuth refresh token, and a message is only ever sent as the person who
 * composed it. Nothing here reads anyone's inbox -- the scope requested is
 * gmail.send only, so a connected account can be used to send a case-linked
 * draft and nothing else.
 *
 * Runs on Cloudflare Workers, so token exchange and the send call are made
 * directly against Google's REST endpoints rather than through the Node
 * googleapis SDK.
 */

export type GmailOAuthClient = {
  clientId: string;
  clientSecret: string;
};

declare global {
  // Populated by the Worker entry point at request time, mirroring
  // __MAXIMUS_DRIVE__.
  var __MAXIMUS_GMAIL__:
    | Partial<GmailOAuthClient & { apiBase: string; tokenBase: string; authBase: string }>
    | undefined;
}

export class GmailNotConfiguredError extends Error {
  constructor() {
    super(
      "Gmail sending is not set up on this deployment. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, and add the redirect URI in the Google Cloud OAuth client.",
    );
  }
}

export class GmailError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function gmailOAuthClient(): GmailOAuthClient {
  const runtime = globalThis.__MAXIMUS_GMAIL__;
  const clientId = runtime?.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret =
    runtime?.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new GmailNotConfiguredError();
  return { clientId, clientSecret };
}

export function gmailOAuthConfigured(): boolean {
  try {
    gmailOAuthClient();
    return true;
  } catch {
    return false;
  }
}

function authBase(): string {
  return (
    globalThis.__MAXIMUS_GMAIL__?.authBase ||
    process.env.GOOGLE_AUTH_BASE ||
    "https://accounts.google.com"
  );
}
function tokenBase(): string {
  return (
    globalThis.__MAXIMUS_GMAIL__?.tokenBase ||
    process.env.GOOGLE_TOKEN_BASE ||
    "https://oauth2.googleapis.com"
  );
}
function apiBase(): string {
  return (
    globalThis.__MAXIMUS_GMAIL__?.apiBase ||
    process.env.GOOGLE_API_BASE ||
    "https://www.googleapis.com"
  );
}

export const GMAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";

export function gmailAuthorizeUrl(options: {
  redirectUri: string;
  state: string;
}): string {
  const { clientId } = gmailOAuthClient();
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
  const { clientId, clientSecret } = gmailOAuthClient();
  return tokenRequest({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

export async function gmailRefreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = gmailOAuthClient();
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
