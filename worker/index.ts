/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  GOOGLE_SHARED_DRIVE_ID?: string;
  FIELD_ENCRYPTION_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_API_BASE?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    (
      globalThis as typeof globalThis & { __MAXIMUS_DB__?: D1Database }
    ).__MAXIMUS_DB__ = env.DB;
    (
      globalThis as typeof globalThis & {
        __MAXIMUS_SUPABASE__?: {
          url: string;
          publishableKey: string;
          serviceRoleKey: string;
        };
      }
    ).__MAXIMUS_SUPABASE__ = {
      url: env.SUPABASE_URL ?? "",
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? "",
      // Optional. Present only so an administrator can create a staff login
      // from inside the CRM; it is used on that one path and nowhere else.
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    };
    // Documents live in the organisation's Shared Drive; the service account
    // credentials never leave the Worker.
    (
      globalThis as typeof globalThis & {
        __MAXIMUS_DRIVE__?: {
          clientEmail: string;
          privateKey: string;
          sharedDriveId: string;
        };
      }
    ).__MAXIMUS_DRIVE__ = {
      clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "",
      privateKey: env.GOOGLE_PRIVATE_KEY ?? "",
      sharedDriveId: env.GOOGLE_SHARED_DRIVE_ID ?? "",
    };
    // Passport numbers are encrypted with a key held by the application, never
    // by the database.
    (
      globalThis as typeof globalThis & { __MAXIMUS_FIELD_KEY__?: string }
    ).__MAXIMUS_FIELD_KEY__ = env.FIELD_ENCRYPTION_KEY ?? "";
    // The case-file assistant. Absent an API key it stays exactly what
    // Integrations calls it: not configured.
    (
      globalThis as typeof globalThis & {
        __MAXIMUS_AI__?: { apiKey?: string; model?: string; apiBase?: string };
      }
    ).__MAXIMUS_AI__ = {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
      apiBase: env.ANTHROPIC_API_BASE,
    };
    // A member of staff's own Gmail connection, for sending case-linked mail
    // as themselves. Absent a client id and secret, Integrations reports
    // Gmail sending as not configured and Messages has nothing to connect to.
    (
      globalThis as typeof globalThis & {
        __MAXIMUS_GMAIL__?: { clientId?: string; clientSecret?: string };
      }
    ).__MAXIMUS_GMAIL__ = {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    };
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (url.pathname.startsWith("/api/")) {
      headers.set("Cache-Control", "no-store, max-age=0");
      headers.set("X-Request-Id", request.headers.get("cf-ray") || crypto.randomUUID());
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default worker;
