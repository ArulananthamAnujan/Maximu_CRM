/**
 * Case lists are ordered with the most recently worked case on top. The time
 * of the last activity comes from the cases_by_activity view, which a
 * migration adds; the schema is migrated separately from this code, so until
 * that migration is applied the lists fall back to the cases table and the
 * order they had before, by the day the case was opened.
 *
 * Only a positive answer is remembered for good: once the view exists it
 * stays. A missing view is re-checked after a short pause, so the new order
 * starts by itself once the migration is run.
 */
import { supabaseRequest } from "@/server/supabase";

export type CaseListSource = {
  /** The relation to read cases from. */
  table: "cases" | "cases_by_activity";
  /** Appended to a select list to bring the activity time along. */
  column: "" | ",last_activity_at";
  /** The order that puts the latest work first. */
  order: string;
};

const BY_ACTIVITY: CaseListSource = { table: "cases_by_activity", column: ",last_activity_at", order: "last_activity_at.desc.nullslast,id.asc" };
const BY_OPENING: CaseListSource = { table: "cases", column: "", order: "opened_at.desc.nullslast,id.asc" };

let viewAvailable = false;
let checkedAt = 0;

export async function caseListSource(token: string): Promise<CaseListSource> {
  if (viewAvailable) return BY_ACTIVITY;
  if (Date.now() - checkedAt < 60_000) return BY_OPENING;
  checkedAt = Date.now();
  try {
    await supabaseRequest("/rest/v1/cases_by_activity?select=id&limit=1", { method: "GET" }, token);
    viewAvailable = true;
    return BY_ACTIVITY;
  } catch {
    return BY_OPENING;
  }
}
