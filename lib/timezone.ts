/**
 * Every record in this CRM is timestamped in UTC, and PostgREST returns it
 * that way. Displaying it required converting to a timezone, and the naive
 * approach used two different wrong ones depending on where the code ran:
 *
 *   - slicing the first 10 characters of the raw UTC string read the UTC
 *     calendar date, which is a different day from the Melbourne one for
 *     roughly a third of every 24 hours;
 *   - `.toLocaleString()` with no timezone argument reads the *viewer's own
 *     device clock*, which is correct for a personal app but wrong for a
 *     shared business record: two staff members in different timezones (or
 *     a laptop simply set to the wrong one) would see two different dates
 *     for the same event.
 *
 * An agency runs on one timezone regardless of where a particular browser
 * happens to be, so every date and time a person reads is formatted in it
 * explicitly, both here and on the server. This CRM serves one organisation,
 * so the timezone is a constant rather than a setting; if that changes, this
 * is the one place it needs to.
 */
export const ORG_TIMEZONE = "Australia/Melbourne";

/** "YYYY-MM-DD" in the organisation's timezone, for a UTC timestamp or a date. */
export function orgDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  // en-CA renders as YYYY-MM-DD, matching the plain date strings this CRM
  // already stores and compares elsewhere.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE }).format(
    parsed,
  );
}

/** "HH:MM" (24-hour) in the organisation's timezone, for a UTC timestamp. */
export function orgTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ORG_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

/** A full date and time, in the organisation's timezone, for display. */
export function orgDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: ORG_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}
