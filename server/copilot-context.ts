import { supabaseRequest } from "@/server/supabase";
import { LiveAccessError } from "@/server/supabase-session";

type Row = Record<string, unknown>;
export type CopilotSource = { id: string; label: string; href: string; facts: Row };
export async function copilotContext(caseId: string, token: string) {
  const get = (query: string) => supabaseRequest<Row[]>(`/rest/v1/${query}`, { method: "GET" }, token);
  const [record] = await get(`cases?select=id,case_number,matter_type,lifecycle_stage,target,next_action,visa_expiry_on,client_id&id=eq.${caseId}&limit=1`);
  if (!record) throw new LiveAccessError(403, "That case is not available to you.");
  const [client] = await get(`clients?select=id,first_name,last_name,email&id=eq.${record.client_id}&limit=1`);
  if (!client) throw new LiveAccessError(403, "That client is not available to you.");
  const sources: CopilotSource[] = [{ id: "case", label: `Case ${record.case_number}`, href: `/?case=${caseId}`, facts: record }];
  const warnings: string[] = [];
  const groups = [
    ["application", "Applications", `education_applications?select=id,institution,course,status&case_id=eq.${caseId}&archived_at=is.null&order=created_at.desc&limit=31`, 30],
    ["visa", "Visa matter", `visa_matters?select=id,visa_subclass,status,information_due_at&case_id=eq.${caseId}&limit=11`, 10],
    ["note", "Case notes", `case_notes?select=id,body,visibility,created_at&case_id=eq.${caseId}&order=created_at.desc&limit=61`, 60],
    ["history", "Imported case history", `legacy_activity_events?select=id,event_type,subject,body,occurred_at&case_id=eq.${caseId}&order=occurred_at.desc.nullslast&limit=61`, 60],
    ["document", "Documents", `documents?select=id,display_name,document_type,state,expires_on&case_id=eq.${caseId}&order=created_at.desc&limit=61`, 60],
    ["checklist", "Document and task checklist", `case_checklist_items?select=id,title,item_type,status,required,due_at&case_id=eq.${caseId}&order=created_at.asc&limit=61`, 60],
    ["task", "Tasks and follow-ups", `tasks?select=id,title,description,status,due_at&case_id=eq.${caseId}&order=due_at.asc.nullslast&limit=41`, 40],
    ["email", "Shared email history", `email_messages?select=id,direction,body_preview,sent_at,created_at,delivery_state,email_threads!inner(case_id,subject)&email_threads.case_id=eq.${caseId}&order=created_at.desc&limit=31`, 30],
  ] as const;
  const results = await Promise.allSettled(groups.map(group => get(group[2])));
  results.forEach((result, index) => {
    const [prefix, label, , limit] = groups[index];
    if (result.status === "rejected") { warnings.push(`${label} could not be loaded; do not assume there are none.`); return; }
    if (result.value.length > limit) warnings.push(`${label}: only ${limit} records included; older or additional records may exist.`);
    result.value.slice(0, limit).forEach((row, i) => {
      const facts = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" && value.length > 2400 ? value.slice(0, 2400) + " [excerpt truncated]" : value]));
      sources.push({ id: `${prefix}-${i + 1}`, label: `${label} ${i + 1}`, href: `/?case=${caseId}`, facts });
    });
  });
  warnings.push("Document contents are not read. Email context includes CRM-linked excerpts, not the entire mailbox. Internal notes must not be disclosed in client drafts.");
  let used = 0;
  const bounded = sources.filter(source => { used += JSON.stringify(source).length; return used <= 65000; });
  if (bounded.length < sources.length) warnings.push("Some records were omitted to fit the context limit.");
  return { client: { id: String(client.id), name: `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim(), email: String(client.email ?? "") }, sources: bounded, warnings };
}
