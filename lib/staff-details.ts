export type StaffDetails = { mobile?: string; timezone?: string };
export const staffTimezones = ["Australia/Melbourne", "Australia/Sydney", "Australia/Brisbane", "Australia/Perth", "Asia/Dhaka", "Asia/Colombo", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Thimphu", "UTC"];
export function validatedStaffDetails(value: unknown): StaffDetails {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Enter valid staff details.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !["mobile", "timezone"].includes(key))) throw new Error("Unknown staff detail.");
  const mobile = typeof row.mobile === "string" ? row.mobile.trim() : "";
  const timezone = typeof row.timezone === "string" ? row.timezone.trim() : "";
  if (mobile && !/^[+\d\s().-]{5,40}$/.test(mobile)) throw new Error("Enter a valid mobile number with country code.");
  if (timezone) { try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new Error("Choose a valid timezone."); } }
  return { mobile, timezone };
}
