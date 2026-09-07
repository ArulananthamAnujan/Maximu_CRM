"use client";

import { useState } from "react";

export function CaseFollowUpForm({ caseId, name, working, onSave }: {
  caseId: string;
  name: string;
  working: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [notice, setNotice] = useState("");
  return <details className="caseFollowUpForm">
    <summary>Schedule a follow-up</summary>
    <form className="caseProfileFields" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const due = new Date(String(data.get("due")));
      if (!Number.isFinite(due.getTime())) return;
      setNotice("");
      if (await onSave({ action: "task", taskType: "follow_up", caseId, title: data.get("title"), description: data.get("description"), priority: data.get("priority"), due: due.toISOString() })) {
        form.reset();
        setNotice("Follow-up scheduled in this case and your Tasks list.");
      }
    }}>
      <label className="full">Follow-up title<input name="title" defaultValue={`Follow up with ${name}`} required /></label>
      <label>Due date and time (your local time)<input name="due" type="datetime-local" required /></label>
      <label>Priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label className="full">Follow-up remarks<textarea name="description" rows={3} placeholder="What should happen at the next contact?" /></label>
      <div className="full"><button className="primaryButton" disabled={working}>{working ? "Saving…" : "Schedule follow-up"}</button></div>
      {notice && <p className="full" role="status">{notice}</p>}
    </form>
  </details>;
}
