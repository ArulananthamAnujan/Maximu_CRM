type Row = Record<string, unknown>;

export function legacyDateLabel(row: Row): string {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Row : {};
  return typeof metadata.source_created_at === "string" ? metadata.source_created_at : "";
}

/** Wall-clock values are used only to sort, never presented as verified UTC. */
export function timelineOrder(entry: { at: string; dateLabel?: string }): number {
  const instant = Date.parse(entry.at);
  if (Number.isFinite(instant)) return instant;
  const match = entry.dateLabel?.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(am|pm))?/i);
  if (!match) return 0;
  const hour = match[4] ? Number(match[4]) % 12 + (match[6]?.toLowerCase() === "pm" ? 12 : 0) : 0;
  return Date.UTC(Number(match[3]), Number(match[2])-1, Number(match[1]),hour,Number(match[5] ?? 0));
}
