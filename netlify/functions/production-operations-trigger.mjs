const env = (name) => globalThis.Netlify?.env?.get(name) ?? "";

export default async function handler() {
  const site = env("URL") || env("PRODUCTION_URL");
  const secret = env("OPERATIONS_JOB_SECRET");
  if (!site || !secret) throw new Error("Production operations URL or secret is not configured.");
  const response = await fetch(`${site.replace(/\/$/, "")}/.netlify/functions/production-operations-background`, {
    method: "POST",
    headers: { "x-operations-secret": secret },
  });
  if (!response.ok && response.status !== 202)
    throw new Error(`Production operations background job was refused (${response.status}).`);
}

export const config = { schedule: "23 2 * * *" };
