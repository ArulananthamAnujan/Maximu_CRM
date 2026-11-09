"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./case-forms-panel.module.css";

/**
 * Client forms: the questionnaire an officer sends before a visa application
 * (Student 500, Temporary Graduate 485, Visitor 600, or one the agency adds).
 *
 * The same panel serves three places. On a case it lists the forms sent to
 * that client, lets the officer change the questions, prefill or correct
 * answers, send, and read the answers back as a record. In the client portal
 * it is the screen where the client answers and sends the form back. Under
 * Templates (FormTemplatesPanel below) a manager keeps the master copies.
 */

export type FormFieldType = "text" | "textarea" | "date" | "number" | "select" | "yesno" | "table";
export type FormColumn = { key: string; label: string; type: "text" | "date" | "number" | "select" | "yesno"; options?: string[] };
export type FormField = {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  help?: string;
  section?: string;
  options?: string[];
  columns?: FormColumn[];
};
type Answers = Record<string, unknown>;
export type CaseForm = {
  id: string;
  case_id: string;
  client_id: string;
  template_id: string | null;
  title: string;
  visa_subclass: string | null;
  description: string | null;
  fields: FormField[];
  answers: Answers;
  status: "draft" | "sent" | "submitted" | "reviewed" | "withdrawn";
  sent_at: string | null;
  viewed_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  client_note: string | null;
  created_at: string;
  updated_at: string;
};
export type FormTemplate = {
  id: string;
  title: string;
  visa_subclass: string | null;
  description: string | null;
  fields: FormField[];
  active: boolean;
  updated_at: string;
};
type Notice = { id: string; form_id: string | null; status: string; last_error: string | null; created_at: string; sent_at: string | null };

const STATUS_LABEL: Record<CaseForm["status"], string> = {
  draft: "Draft, not sent",
  sent: "With the client",
  submitted: "Answers received",
  reviewed: "Reviewed",
  withdrawn: "Withdrawn",
};
const TYPE_LABEL: Record<FormFieldType, string> = {
  text: "Short answer",
  textarea: "Long answer",
  date: "Date",
  number: "Number",
  select: "Choose one",
  yesno: "Yes / No",
  table: "Table (several rows)",
};
const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "");
const slug = (label: string, taken: string[]) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "question";
  let key = base;
  let n = 2;
  while (taken.includes(key)) key = `${base}_${n++}`;
  return key;
};
const sectionsOf = (fields: FormField[]) => {
  const names: string[] = [];
  for (const f of fields) {
    const name = f.section?.trim() || "Questions";
    if (!names.includes(name)) names.push(name);
  }
  return names;
};
const isEmpty = (value: unknown) =>
  value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && value.length === 0);

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/crm/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "That could not be saved.");
  return data as { form?: CaseForm; template?: FormTemplate };
}

/* ----------------------------------------------------------------- *
 * Answering a form: one control per question, a small table for a
 * repeating group such as family members or addresses.
 * ----------------------------------------------------------------- */
function FormFiller({ fields, answers, onChange, disabled = false }: { fields: FormField[]; answers: Answers; onChange: (next: Answers) => void; disabled?: boolean }) {
  const set = (key: string, value: unknown) => onChange({ ...answers, [key]: value });
  const control = (field: FormField) => {
    const value = answers[field.key];
    const id = `q_${field.key}`;
    if (field.type === "textarea") return <textarea id={id} rows={4} value={String(value ?? "")} disabled={disabled} onChange={(e) => set(field.key, e.target.value)} />;
    if (field.type === "select")
      return (
        <select id={id} value={String(value ?? "")} disabled={disabled} onChange={(e) => set(field.key, e.target.value)}>
          <option value="">Choose…</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    if (field.type === "yesno")
      return (
        <div className={styles.yesno} role="radiogroup" aria-labelledby={`${id}_label`}>
          {["Yes", "No"].map((o) => (
            <label key={o}><input type="radio" name={id} value={o} checked={value === o} disabled={disabled} onChange={() => set(field.key, o)} />{o}</label>
          ))}
        </div>
      );
    if (field.type === "table") {
      const rows = Array.isArray(value) ? (value as Record<string, string>[]) : [];
      const columns = field.columns ?? [];
      const update = (index: number, column: string, cell: string) => set(field.key, rows.map((row, i) => (i === index ? { ...row, [column]: cell } : row)));
      return (
        <div className={styles.tableWrap}>
          <table className={styles.answerTable}>
            <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{!disabled && <th aria-label="Remove" />}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      {c.type === "select" ? (
                        <select value={row[c.key] ?? ""} disabled={disabled} aria-label={c.label} onChange={(e) => update(index, c.key, e.target.value)}>
                          <option value="">Choose…</option>
                          {(c.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : c.type === "yesno" ? (
                        <select value={row[c.key] ?? ""} disabled={disabled} aria-label={c.label} onChange={(e) => update(index, c.key, e.target.value)}>
                          <option value="">Choose…</option><option>Yes</option><option>No</option>
                        </select>
                      ) : (
                        <input type={c.type === "number" ? "number" : c.type} value={row[c.key] ?? ""} disabled={disabled} aria-label={c.label} onChange={(e) => update(index, c.key, e.target.value)} />
                      )}
                    </td>
                  ))}
                  {!disabled && <td><button type="button" className="ghostButton" onClick={() => set(field.key, rows.filter((_, i) => i !== index))} aria-label={`Remove row ${index + 1}`}>Remove</button></td>}
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={columns.length + 1} className={styles.emptyRow}>No rows yet.</td></tr>}
            </tbody>
          </table>
          {!disabled && <button type="button" className="ghostButton" onClick={() => set(field.key, [...rows, {}])}>+ Add a row</button>}
        </div>
      );
    }
    return <input id={id} type={field.type === "number" ? "number" : field.type} value={String(value ?? "")} disabled={disabled} onChange={(e) => set(field.key, e.target.value)} />;
  };
  return (
    <div className={styles.filler}>
      {sectionsOf(fields).map((section) => (
        <fieldset key={section} className={styles.section}>
          <legend>{section}</legend>
          {fields.filter((f) => (f.section?.trim() || "Questions") === section).map((field) => (
            <div key={field.key} className={`${styles.question} ${field.type === "table" || field.type === "textarea" ? styles.wide : ""}`}>
              <label htmlFor={`q_${field.key}`} id={`q_${field.key}_label`}>
                {field.label}{field.required && <span className={styles.required} aria-hidden="true"> *</span>}
              </label>
              {field.help && <small>{field.help}</small>}
              {control(field)}
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** The answers as a record a person reads: question, answer, in the form's order. */
function FormRecord({ form }: { form: CaseForm }) {
  return (
    <div className={styles.record}>
      {sectionsOf(form.fields).map((section) => (
        <section key={section}>
          <h4>{section}</h4>
          <dl>
            {form.fields.filter((f) => (f.section?.trim() || "Questions") === section).map((field) => {
              const value = form.answers[field.key];
              return (
                <div key={field.key} className={field.type === "table" ? styles.wide : ""}>
                  <dt>{field.label}</dt>
                  <dd>
                    {isEmpty(value) ? <em>Not answered</em> : field.type === "table" && Array.isArray(value) ? (
                      <table className={styles.answerTable}>
                        <thead><tr>{(field.columns ?? []).map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                        <tbody>{(value as Record<string, string>[]).map((row, i) => <tr key={i}>{(field.columns ?? []).map((c) => <td key={c.key}>{row[c.key] || "—"}</td>)}</tr>)}</tbody>
                      </table>
                    ) : String(value)}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
      {form.client_note && <p className={styles.clientNote}><strong>Note from the client:</strong> {form.client_note}</p>}
    </div>
  );
}

function formAsText(form: CaseForm) {
  const lines = [form.title, form.visa_subclass ? `Visa subclass ${form.visa_subclass}` : "", `Status: ${STATUS_LABEL[form.status]}`, form.submitted_at ? `Submitted ${when(form.submitted_at)}` : "", ""];
  for (const section of sectionsOf(form.fields)) {
    lines.push(section.toUpperCase());
    for (const field of form.fields.filter((f) => (f.section?.trim() || "Questions") === section)) {
      const value = form.answers[field.key];
      if (field.type === "table" && Array.isArray(value)) {
        lines.push(`${field.label}:`);
        for (const row of value as Record<string, string>[]) lines.push("  - " + (field.columns ?? []).map((c) => `${c.label}: ${row[c.key] || "—"}`).join("; "));
      } else lines.push(`${field.label}: ${isEmpty(value) ? "Not answered" : String(value)}`);
    }
    lines.push("");
  }
  if (form.client_note) lines.push(`Note from the client: ${form.client_note}`);
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}

/* ----------------------------------------------------------------- *
 * Editing the questions themselves.
 * ----------------------------------------------------------------- */
function FieldEditor({ fields, onChange }: { fields: FormField[]; onChange: (next: FormField[]) => void }) {
  const update = (index: number, patch: Partial<FormField>) => onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const move = (index: number, delta: number) => {
    const next = [...fields];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => onChange([...fields, { key: slug("New question", fields.map((f) => f.key)), label: "New question", type: "text", section: fields[fields.length - 1]?.section }]);
  return (
    <div className={styles.fieldEditor}>
      {fields.map((field, index) => (
        <article key={field.key} className={styles.fieldRow}>
          <div className={styles.fieldMain}>
            <label>Question
              <input value={field.label} maxLength={300} onChange={(e) => update(index, { label: e.target.value })} />
            </label>
            <label>Answer type
              <select value={field.type} onChange={(e) => {
                const type = e.target.value as FormFieldType;
                update(index, { type, options: type === "select" ? field.options ?? ["Option 1", "Option 2"] : undefined, columns: type === "table" ? field.columns ?? [{ key: "detail", label: "Detail", type: "text" }] : undefined });
              }}>
                {(Object.keys(TYPE_LABEL) as FormFieldType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label>Section
              <input value={field.section ?? ""} maxLength={80} placeholder="e.g. Your family" onChange={(e) => update(index, { section: e.target.value })} />
            </label>
            <label className={styles.check}><input type="checkbox" checked={Boolean(field.required)} onChange={(e) => update(index, { required: e.target.checked })} />Required</label>
          </div>
          <label className={styles.wide}>Help text shown under the question
            <input value={field.help ?? ""} maxLength={300} onChange={(e) => update(index, { help: e.target.value })} />
          </label>
          {field.type === "select" && (
            <label className={styles.wide}>Choices, one per line
              <textarea rows={3} value={(field.options ?? []).join("\n")} onChange={(e) => update(index, { options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })} />
            </label>
          )}
          {field.type === "table" && (
            <div className={styles.columns}>
              <span>Columns</span>
              {(field.columns ?? []).map((column, ci) => (
                <div key={column.key} className={styles.columnRow}>
                  <input value={column.label} maxLength={120} aria-label={`Column ${ci + 1} label`} onChange={(e) => update(index, { columns: (field.columns ?? []).map((c, i) => (i === ci ? { ...c, label: e.target.value } : c)) })} />
                  <select value={column.type} aria-label={`Column ${ci + 1} type`} onChange={(e) => update(index, { columns: (field.columns ?? []).map((c, i) => (i === ci ? { ...c, type: e.target.value as FormColumn["type"], options: e.target.value === "select" ? c.options ?? ["Option 1"] : undefined } : c)) })}>
                    <option value="text">Short answer</option><option value="date">Date</option><option value="number">Number</option><option value="select">Choose one</option><option value="yesno">Yes / No</option>
                  </select>
                  {column.type === "select" && <input value={(column.options ?? []).join(", ")} aria-label={`Column ${ci + 1} choices`} placeholder="Choices, comma separated" onChange={(e) => update(index, { columns: (field.columns ?? []).map((c, i) => (i === ci ? { ...c, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) } : c)) })} />}
                  <button type="button" className="ghostButton" onClick={() => update(index, { columns: (field.columns ?? []).filter((_, i) => i !== ci) })} aria-label={`Remove column ${ci + 1}`}>Remove</button>
                </div>
              ))}
              <button type="button" className="ghostButton" onClick={() => update(index, { columns: [...(field.columns ?? []), { key: slug("Column", (field.columns ?? []).map((c) => c.key)), label: "New column", type: "text" }] })}>+ Add a column</button>
            </div>
          )}
          <div className={styles.fieldTools}>
            <button type="button" className="ghostButton" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move question ${index + 1} up`}>↑ Up</button>
            <button type="button" className="ghostButton" onClick={() => move(index, 1)} disabled={index === fields.length - 1} aria-label={`Move question ${index + 1} down`}>↓ Down</button>
            <button type="button" className="ghostButton dangerAction" onClick={() => onChange(fields.filter((_, i) => i !== index))}>Remove question</button>
          </div>
        </article>
      ))}
      <button type="button" className="primaryButton" onClick={add}>+ Add a question</button>
    </div>
  );
}

type Draft = { title: string; visaSubclass: string; description: string; fields: FormField[]; answers: Answers };

function FormEditor({ initial, withAnswers, busy, onSave, onCancel, saveLabel = "Save" }: {
  initial: Draft; withAnswers: boolean; busy: boolean; onSave: (draft: Draft) => Promise<void> | void; onCancel: () => void; saveLabel?: string;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [view, setView] = useState<"questions" | "answers">("questions");
  return (
    <form className={styles.editor} onSubmit={(e) => { e.preventDefault(); void onSave(draft); }}>
      <div className={styles.editorHead}>
        <label>Form title<input value={draft.title} required maxLength={200} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label>Visa subclass<input value={draft.visaSubclass} maxLength={40} placeholder="500, 485, 600…" onChange={(e) => setDraft({ ...draft, visaSubclass: e.target.value })} /></label>
        <label className={styles.wide}>Introduction the client reads first
          <textarea rows={2} value={draft.description} maxLength={4000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </label>
      </div>
      {withAnswers && (
        <div className={styles.editorTabs} role="tablist" aria-label="Edit">
          <button type="button" role="tab" aria-selected={view === "questions"} className={view === "questions" ? styles.activeTab : ""} onClick={() => setView("questions")}>Questions ({draft.fields.length})</button>
          <button type="button" role="tab" aria-selected={view === "answers"} className={view === "answers" ? styles.activeTab : ""} onClick={() => setView("answers")}>Answers</button>
        </div>
      )}
      {view === "questions" ? (
        <FieldEditor fields={draft.fields} onChange={(fields) => setDraft({ ...draft, fields })} />
      ) : (
        <FormFiller fields={draft.fields} answers={draft.answers} onChange={(answers) => setDraft({ ...draft, answers })} />
      )}
      <div className={styles.editorActions}>
        <button className="primaryButton" disabled={busy || !draft.fields.length}>{saveLabel}</button>
        <button type="button" className="ghostButton" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- *
 * The panel on a case and in the portal.
 * ----------------------------------------------------------------- */
export function CaseFormsPanel({ caseId, student = false, onChanged }: { caseId?: string; student?: boolean; onChanged?: () => void | Promise<void> }) {
  const [forms, setForms] = useState<CaseForm[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState("");
  const [editing, setEditing] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [templateChoice, setTemplateChoice] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [clientNote, setClientNote] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/crm/forms" + (caseId ? `?caseId=${caseId}` : ""), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Forms could not be loaded.");
    setForms(data.forms ?? []);
    setTemplates(data.templates ?? []);
    setNotices(data.notices ?? []);
    setReady(true);
  }, [caseId]);
  useEffect(() => {
    const refresh = () => { void load().catch((e: Error) => setError(e.message)); };
    refresh();
  }, [load]);

  const act = async (body: Record<string, unknown>, success?: string) => {
    setBusy(String(body.action));
    setError("");
    setMessage("");
    try {
      const result = await post(body);
      await load();
      await onChanged?.();
      if (success) setMessage(success);
      return result.form ?? null;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy("");
    }
  };

  const openForm = (form: CaseForm) => {
    setOpen(open === form.id ? "" : form.id);
    setEditing("");
    setAnswers(form.answers ?? {});
    setClientNote(form.client_note ?? "");
    if (student && form.status === "sent" && !form.viewed_at) void post({ action: "view", id: form.id }).catch(() => undefined);
  };
  const startForm = async () => {
    const created = await act({ action: "create", caseId, templateId: templateChoice || undefined, ...(templateChoice ? {} : { title: "New form", fields: [{ key: "full_name", label: "Your full name", type: "text", required: true }] }) });
    if (created) { setChoosing(false); setOpen(created.id); setEditing(created.id); }
  };

  const kicker = student ? "Your forms" : "Client forms";
  const heading = student ? "Forms your case team has asked you to complete" : "Forms";
  const visible = student ? forms.filter((f) => f.status !== "withdrawn") : forms;

  return (
    <section className={`panel ${styles.panel}`} id="case-forms">
      <div className="panelHead">
        <div><span className="kicker">{kicker}</span><h2>{heading}</h2></div>
        {!student && caseId && (
          <button className="primaryButton" onClick={() => setChoosing(!choosing)} disabled={Boolean(busy)}>Send a form</button>
        )}
      </div>
      {error && <p role="alert" className="caseWorkError">{error}</p>}
      {message && <p role="status" className={styles.status}>{message}</p>}
      {!ready && !error && <p>Loading…</p>}

      {choosing && !student && (
        <div className={styles.chooser}>
          <label>Which form?
            <select value={templateChoice} onChange={(e) => setTemplateChoice(e.target.value)}>
              <option value="">A blank form I will write now</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
          <p>A copy is placed on this case as a draft. Change any question, add more, prefill what you already know, then send it to the client.</p>
          <div className={styles.editorActions}>
            <button className="primaryButton" onClick={() => void startForm()} disabled={Boolean(busy)}>Prepare the form</button>
            <button className="ghostButton" onClick={() => setChoosing(false)}>Cancel</button>
          </div>
        </div>
      )}

      {ready && !visible.length && (
        <p className={styles.empty}>{student ? "Nothing to complete right now." : "No forms have been sent on this case. Use “Send a form” to start from a template."}</p>
      )}

      {visible.map((form) => {
        const answered = form.fields.filter((f) => !isEmpty(form.answers[f.key])).length;
        const formNotices = notices.filter((n) => n.form_id === form.id);
        const latestNotice = formNotices[0];
        return (
          <article key={form.id} className={styles.form}>
            <div className={styles.formHead}>
              <div>
                <h3>{form.title}</h3>
                <small>
                  {form.visa_subclass ? `Subclass ${form.visa_subclass} · ` : ""}{answered} of {form.fields.length} answered
                  {form.sent_at ? ` · Sent ${when(form.sent_at)}` : ""}{form.submitted_at ? ` · Submitted ${when(form.submitted_at)}` : ""}
                </small>
              </div>
              <strong className={`${styles.badge} ${styles[`status_${form.status}`]}`}>{STATUS_LABEL[form.status]}</strong>
            </div>
            <div className={styles.actions}>
              <button className="ghostButton" onClick={() => openForm(form)}>{open === form.id ? "Close" : student ? (form.status === "sent" ? "Answer the questions" : "View my answers") : "Open"}</button>
              {!student && form.status !== "withdrawn" && <button className="ghostButton" onClick={() => { setOpen(form.id); setEditing(editing === form.id ? "" : form.id); }}>{editing === form.id ? "Stop editing" : "Edit questions & answers"}</button>}
              {!student && ["draft"].includes(form.status) && <button className="primaryButton" disabled={Boolean(busy)} onClick={() => void act({ action: "send", id: form.id }, "Form sent. The client has it in their portal and by email.")}>Send to client</button>}
              {!student && ["sent", "submitted", "reviewed"].includes(form.status) && <button className="ghostButton" disabled={Boolean(busy)} onClick={() => void act({ action: "send", id: form.id }, "The form was sent again.")}>{form.status === "sent" ? "Send a reminder" : "Send again for more answers"}</button>}
              {!student && form.status === "submitted" && <button className="primaryButton" disabled={Boolean(busy)} onClick={() => void act({ action: "review", id: form.id }, "Marked as reviewed.")}>Mark reviewed</button>}
              {!student && ["draft", "sent", "submitted"].includes(form.status) && <button className="ghostButton" disabled={Boolean(busy)} onClick={() => { if (confirm("Withdraw this form? The client will no longer see it.")) void act({ action: "withdraw", id: form.id }); }}>Withdraw</button>}
              {!student && <button className="ghostButton dangerAction" disabled={Boolean(busy)} onClick={() => { if (confirm(["submitted", "reviewed"].includes(form.status) ? "The client has answered this form. Delete it and its answers? Only an administrator can do this." : "Delete this form from the case? This cannot be undone.")) void act({ action: "delete", id: form.id }, "Form deleted."); }}>Delete</button>}
              {!student && <button className="ghostButton" onClick={() => { const blob = new Blob([formAsText(form)], { type: "text/plain" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `${form.title.replace(/[^a-z0-9]+/gi, "-")}.txt`; a.click(); URL.revokeObjectURL(url); }}>Download</button>}
            </div>
            {!student && latestNotice && (
              <p className={styles.noticeLine}>
                Email: {latestNotice.status === "sent" ? `sent ${when(latestNotice.sent_at)}` : latestNotice.status === "queued" || latestNotice.status === "sending" ? "sending…" : `${latestNotice.status}${latestNotice.last_error ? ` — ${latestNotice.last_error}` : ""}`}
              </p>
            )}
            {open === form.id && (
              editing === form.id && !student ? (
                <FormEditor
                  initial={{ title: form.title, visaSubclass: form.visa_subclass ?? "", description: form.description ?? "", fields: form.fields, answers: form.answers ?? {} }}
                  withAnswers
                  busy={Boolean(busy)}
                  saveLabel="Save changes"
                  onCancel={() => setEditing("")}
                  onSave={async (draft) => {
                    const saved = await act({ action: "update", id: form.id, title: draft.title, visaSubclass: draft.visaSubclass, description: draft.description, fields: draft.fields, answers: draft.answers }, "Saved.");
                    if (saved) setEditing("");
                  }}
                />
              ) : student && form.status === "sent" ? (
                <form className={styles.studentForm} onSubmit={(e) => { e.preventDefault(); void act({ action: "submit", id: form.id, answers, note: clientNote }, "Thank you. Your answers have been sent to your case team."); }}>
                  {form.description && <p className={styles.intro}>{form.description}</p>}
                  <FormFiller fields={form.fields} answers={answers} onChange={setAnswers} />
                  <label className={styles.noteField}>Anything else you want your case team to know?
                    <textarea rows={3} value={clientNote} maxLength={2000} onChange={(e) => setClientNote(e.target.value)} />
                  </label>
                  <div className={styles.editorActions}>
                    <button type="button" className="ghostButton" disabled={Boolean(busy)} onClick={() => void act({ action: "save", id: form.id, answers, note: clientNote }, "Progress saved. You can come back and finish later.")}>Save progress</button>
                    <button className="primaryButton" disabled={Boolean(busy)}>Send my answers</button>
                  </div>
                </form>
              ) : (
                <>
                  {form.description && <p className={styles.intro}>{form.description}</p>}
                  <FormRecord form={form} />
                </>
              )
            )}
          </article>
        );
      })}
    </section>
  );
}

/* ----------------------------------------------------------------- *
 * Templates, kept under Templates > Client forms.
 * ----------------------------------------------------------------- */
export function FormTemplatesPanel({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<"" | "new" | string>("");
  const [previewing, setPreviewing] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/crm/forms?templates=all", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Form templates could not be loaded.");
    setTemplates(data.templates ?? []);
    setReady(true);
  }, []);
  useEffect(() => {
    const refresh = () => { void load().catch((e: Error) => setError(e.message)); };
    refresh();
  }, [load]);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try { await post(body); await load(); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  };
  const blank: Draft = { title: "", visaSubclass: "", description: "", fields: [{ key: "full_name", label: "Your full name", type: "text", required: true }], answers: {} };
  return (
    <article className={`panel listPanel ${styles.panel}`}>
      <div className="panelHead">
        <div><span className="kicker">Client forms</span><h2>Questionnaires sent before an application</h2></div>
        {canManage && <button className="primaryButton" onClick={() => setEditing(editing === "new" ? "" : "new")}>New form template</button>}
      </div>
      <p className={styles.intro}>Each visa has its own set of questions. An officer sends a copy from a case, can change it for that client, and the answers come back onto the case file.</p>
      {error && <p role="alert" className="caseWorkError">{error}</p>}
      {!ready && !error && <p>Loading…</p>}
      {editing === "new" && (
        <FormEditor initial={blank} withAnswers={false} busy={busy} saveLabel="Create template" onCancel={() => setEditing("")}
          onSave={async (d) => { if (await send({ action: "template_create", title: d.title, visaSubclass: d.visaSubclass, description: d.description, fields: d.fields })) setEditing(""); }} />
      )}
      {templates.map((t) => (
        <article key={t.id} className={styles.form}>
          <div className={styles.formHead}>
            <div>
              <h3>{t.title}</h3>
              <small>{t.visa_subclass ? `Subclass ${t.visa_subclass} · ` : ""}{t.fields.length} questions · Updated {when(t.updated_at)}{t.active ? "" : " · Retired"}</small>
            </div>
          </div>
          <div className={styles.actions}>
            <button className="ghostButton" onClick={() => setPreviewing(previewing === t.id ? "" : t.id)}>{previewing === t.id ? "Close preview" : "Preview"}</button>
            {canManage && <button className="ghostButton" onClick={() => setEditing(editing === t.id ? "" : t.id)}>{editing === t.id ? "Stop editing" : "Edit"}</button>}
            {canManage && <button className="ghostButton" disabled={busy} onClick={() => void send({ action: "template_update", templateId: t.id, active: !t.active })}>{t.active ? "Retire" : "Restore"}</button>}
            {canManage && <button className="ghostButton dangerAction" disabled={busy} onClick={() => { if (confirm(`Delete the template “${t.title}”? Forms already sent on cases keep their own copy.`)) void send({ action: "template_delete", templateId: t.id }); }}>Delete</button>}
          </div>
          {editing === t.id && canManage && (
            <FormEditor initial={{ title: t.title, visaSubclass: t.visa_subclass ?? "", description: t.description ?? "", fields: t.fields, answers: {} }} withAnswers={false} busy={busy} saveLabel="Save template" onCancel={() => setEditing("")}
              onSave={async (d) => { if (await send({ action: "template_update", templateId: t.id, title: d.title, visaSubclass: d.visaSubclass, description: d.description, fields: d.fields })) setEditing(""); }} />
          )}
          {previewing === t.id && (
            <div className={styles.preview}>
              {t.description && <p className={styles.intro}>{t.description}</p>}
              <FormFiller fields={t.fields} answers={{}} onChange={() => undefined} disabled />
            </div>
          )}
        </article>
      ))}
    </article>
  );
}
