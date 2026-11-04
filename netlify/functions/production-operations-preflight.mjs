import { operationsSecret } from "../lib/operations-auth.mjs";
import { runtimeEnv as env } from "../lib/runtime-env.mjs";

export default async function handler(request) {
  const secret = operationsSecret(env);
  if (!secret || request.headers.get("x-operations-secret") !== secret)
    return Response.json({ error: "Operations worker credentials do not match the CRM server. Check Functions scopes and redeploy." }, { status: 401 });
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(name => !env(name));
  return Response.json(missing.length ? { error: `Operations worker is missing: ${missing.join(", ")}` } : { ok: true }, { status: missing.length ? 503 : 200 });
}
