export const CRM_ORIGIN = "https://maximus-crm-next.netlify.app";
export const AUTH_REDIRECT = "au.com.maximuseducation.crm://auth/callback";
export const WORKSPACE_REDIRECT = "au.com.maximuseducation.crm://workspace/complete";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function apiTarget(value: string, localOrigin: string): string | null {
  const url = new URL(value, localOrigin);
  const local = new URL(localOrigin);
  if (url.username || url.password) return null;
  if (url.origin !== CRM_ORIGIN && !(url.protocol === local.protocol && url.host === local.host)) return null;
  if (!url.pathname.startsWith("/api/")) return null;
  return `${CRM_ORIGIN}${url.pathname}${url.search}`;
}

export function validAuthCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}` === AUTH_REDIRECT && !url.hash &&
      !url.username && !url.password;
  } catch { return false; }
}

export function safeFilename(value: string): string {
  const clean = value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").replace(/^\.+/, "").slice(0, 140);
  return clean || "maximus-document";
}

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function createProofKey(): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}
