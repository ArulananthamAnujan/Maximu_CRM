/**
 * The Google Cloud OAuth client behind every per-staff Google connection --
 * Gmail sending and Calendar sync both request consent through the same
 * client, just with different scopes and callback routes, so a person
 * connecting one is not asked to set up a second Google Cloud credential for
 * the other.
 */

export type GoogleOAuthClient = {
  clientId: string;
  clientSecret: string;
};

declare global {
  // Populated by the Worker entry point at request time.
  var __MAXIMUS_GOOGLE_OAUTH__: Partial<GoogleOAuthClient> | undefined;
}

export class GoogleOAuthNotConfiguredError extends Error {
  constructor(feature: string) {
    super(
      `${feature} is not set up on this deployment. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, and add the redirect URI in the Google Cloud OAuth client.`,
    );
  }
}

export function googleOAuthClient(feature = "Connecting a Google account"): GoogleOAuthClient {
  const runtime = globalThis.__MAXIMUS_GOOGLE_OAUTH__;
  const clientId = runtime?.clientId || process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret =
    runtime?.clientSecret || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new GoogleOAuthNotConfiguredError(feature);
  return { clientId, clientSecret };
}

export function googleOAuthConfigured(): boolean {
  try {
    googleOAuthClient();
    return true;
  } catch {
    return false;
  }
}
