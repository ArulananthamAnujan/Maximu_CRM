type Row = Record<string, unknown>;
const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

/** Use selected values, never the text of every option in a legacy dropdown. */
export function legacyDestination(row: Row): string | null {
  let dynamic: unknown = row.legacy_dynamic_json;
  if (typeof dynamic === "string") {
    try { dynamic = JSON.parse(dynamic); } catch { dynamic = null; }
  }
  const profile = dynamic && typeof dynamic === "object" ? (dynamic as Row).profile : null;
  if (profile && typeof profile === "object" && "interestedCountryID" in profile) {
    const data = profile as Row;
    const ids = (text(data.interestedCountryID) ?? "").split(",").map(id => id.trim()).filter(Boolean);
    if (!ids.length) return null;
    const labels = new Map<string, string>();
    const html = text(data.interestedCountry) ?? "";
    for (const match of html.matchAll(/<option\b[^>]*\bvalue=["']([^"']+)["'][^>]*>([^<]+)<\/option>/gi)) {
      labels.set(match[1], match[2].trim());
    }
    // An unknown id is a validation error, not permission to import the menu.
    if (ids.some(id => !labels.has(id))) throw new Error("A selected legacy destination has no matching country label.");
    return [...new Set(ids.map(id => labels.get(id)!))].join(" | ");
  }
  const value = [row.target,row.interested_country,row.destination_country,row.countries,row.int_country,row.country].map(text).find(Boolean) ?? null;
  if (value && /<option\b/i.test(value)) throw new Error("Export selected destination values, not dropdown HTML.");
  // Known faulty export: an unselected menu was flattened into all 19 choices.
  const menu = "Canada|Australia|USA|Dubai|New Zealand|Ireland|Malta|Poland|France|UK|Singapore|Georgia|Bangladesh|Sri Lanka|Malaysia|South Korea|Sweden|China|Finland";
  if (value?.split("|").map(part => part.trim()).join("|") === menu) throw new Error("Destination contains the entire legacy country menu. Re-export the selected countries.");
  return value;
}
