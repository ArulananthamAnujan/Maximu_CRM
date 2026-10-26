import { createHmac } from "node:crypto";

export function operationsSecret(env) {
  const configured = env("OPERATIONS_JOB_SECRET");
  if (configured) return configured;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return key ? createHmac("sha256", key).update("maximus-production-operations-v1").digest("hex") : "";
}
