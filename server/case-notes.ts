import { supabaseRequest } from "@/server/supabase";

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const label = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** Keep the original author and displayed date separate from the import actor. */
export async function noteProvenance(notes: Json[], token: string): Promise<Map<string, Json>> {
  const ids = [...new Set(notes.map(note => String(note.id ?? "")).filter(id => /^[0-9a-f-]{36}$/i.test(id)))];
  const result = new Map<string, Json>();
  for (let offset = 0; offset < ids.length; offset += 120) {
    const rows = await supabaseRequest<Json[]>(
      `/rest/v1/legacy_external_keys?select=target_id,source_key,metadata&entity_type=eq.notes&target_table=eq.case_notes&target_id=in.(${ids.slice(offset, offset + 120).join(",")})`,
      {}, token,
    );
    for (const row of rows) {
      const original = object(object(row.metadata).legacy_data);
      result.set(String(row.target_id), {
        sourceKey: row.source_key,
        authorName: label(original.author ?? original.created_by ?? original.added_by) || "Legacy staff member",
        // A wall-clock date without a verified source timezone must not be
        // presented as if it were an exact timestamp in the new office's zone.
        dateLabel: label(original.source_created_at),
      });
    }
  }
  return result;
}
