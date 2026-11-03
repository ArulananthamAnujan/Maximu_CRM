// Some server adapters expose the internal worker URL as localhost even when
// the browser is on the public Netlify site. Client emails and Supabase action
// links must always return to the address the client can actually open.
export function publicOrigin(request: Request): string {
  for (const configured of [process.env.NEXT_PUBLIC_APP_URL, process.env.URL]) {
    if (!configured) continue;
    try {
      return new URL(configured).origin;
    } catch {
      // Continue to the proxy headers when an optional value is malformed.
    }
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (host) return `${forwardedProtocol || "https"}://${host}`;
  return new URL(request.url).origin;
}
