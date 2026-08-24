/**
 * Pushing appointments into a member of staff's own Google Calendar.
 *
 * One direction only: an appointment scheduled in this CRM is created (and,
 * on cancellation, removed) on the calendar of whoever it is assigned to.
 * Nothing is pulled back -- an event moved or deleted directly in Google
 * Calendar is not reflected here. That is a materially smaller, and
 * materially more honest, thing to claim than "two-way sync", so Integrations
 * describes it as what it is.
 *
 * Runs on Cloudflare Workers, so the calls are made directly against
 * Google's REST endpoints rather than through the Node googleapis SDK.
 */
import { googleOAuthClient } from "@/server/google-oauth-client";

declare global {
  var __MAXIMUS_GOOGLE_HOSTS__:
    | Partial<{ apiBase: string; tokenBase: string; authBase: string }>
    | undefined;
}

export class CalendarError extends Error {
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

export const CALENDAR_SCOPE =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

export function calendarAuthorizeUrl(options: {
  redirectUri: string;
  state: string;
}): string {
  const { clientId } = googleOAuthClient("Calendar sync");
  const url = new URL(`${authBase()}/o/oauth2/v2/auth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPE);
  url.searchParams.set("access_type", "offline");
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
    throw new CalendarError(response.status, `Google refused the token request: ${await response.text()}`);
  return (await response.json()) as TokenResponse;
}

export async function calendarExchangeCode(options: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleOAuthClient("Calendar sync");
  return tokenRequest({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

export async function calendarRefreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = googleOAuthClient("Calendar sync");
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

/** The address behind the tokens, so the connection can be shown and matched. */
export async function calendarAccountEmail(accessToken: string): Promise<string> {
  const response = await fetch(`${apiBase()}/oauth2/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok)
    throw new CalendarError(response.status, `Google refused the account lookup: ${await response.text()}`);
  const info = (await response.json()) as { email?: string };
  if (!info.email) throw new CalendarError(502, "Google did not return an email address.");
  return info.email;
}

export async function createCalendarEvent(options: {
  accessToken: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
}): Promise<{ id: string }> {
  const response = await fetch(`${apiBase()}/calendar/v3/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: options.title,
      description: options.description,
      start: { dateTime: options.startsAt },
      end: { dateTime: options.endsAt },
    }),
  });
  if (!response.ok)
    throw new CalendarError(response.status, `Google Calendar refused the event: ${await response.text()}`);
  return (await response.json()) as { id: string };
}

/** A 404/410 means the event is already gone, which is the outcome wanted. */
export async function deleteCalendarEvent(options: {
  accessToken: string;
  eventId: string;
}): Promise<void> {
  const response = await fetch(
    `${apiBase()}/calendar/v3/calendars/primary/events/${encodeURIComponent(options.eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${options.accessToken}` } },
  );
  if (!response.ok && response.status !== 404 && response.status !== 410)
    throw new CalendarError(response.status, `Google Calendar refused to cancel the event: ${await response.text()}`);
}
