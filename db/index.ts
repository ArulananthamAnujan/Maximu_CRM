import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  const dbBinding = (globalThis as typeof globalThis & { __MAXIMUS_DB__?: D1Database }).__MAXIMUS_DB__;
  if (!dbBinding) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(dbBinding, { schema });
}
