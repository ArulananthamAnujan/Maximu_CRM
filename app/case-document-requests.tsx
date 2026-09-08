"use client";

import { useState } from "react";

type Template = { key: string; category: string; title: string; guidance: string; active: boolean };

export function CaseDocumentRequests({ caseId, clientId, templates, working, onSave }: {
  caseId: string;
  clientId: string;
  templates: Template[];
  working: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"document" | "visaChecklist">("document");
  const [notice, setNotice] = useState("");
  const available = templates.filter(template => template.active);
  return <details className="caseWorkPanel caseDocumentRequests">
    <summary>Add a document request or checklist</summary>
    <div className="caseWorkPanelHead">
      <div><span className="kicker">ADD TO THIS CASE</span><h3>Request documents</h3></div>
      <div className="documentRequestModes" role="group" aria-label="Document request type">
        <button type="button" className={mode === "document" ? "active" : ""} aria-pressed={mode === "document"} onClick={() => setMode("document")}>Custom document</button>
        <button type="button" className={mode === "visaChecklist" ? "active" : ""} aria-pressed={mode === "visaChecklist"} onClick={() => setMode("visaChecklist")}>From checklist</button>
      </div>
    </div>
    <form key={mode} className="caseProfileFields" onSubmit={async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      setNotice("");
      if (await onSave({ ...values, action: mode, caseId, clientId, append: true })) {
        form.reset();
        setNotice("Document requests saved in this case. Attach received files below.");
      }
    }}>
      {mode === "document" ? <>
        <label>Document title<input name="title" required placeholder="e.g. Passport bio page" /></label>
        <label>Folder / category<input name="folder" placeholder="e.g. Identity documents" /></label>
      </> : <div className="templateRequestChoices full">
        {!available.length && <p>No templates are set up yet. Use Custom document to add a request here.</p>}
        {[...new Set(available.map(template => template.category))].map(category => <fieldset key={category}>
          <legend>{category}</legend>
          {available.filter(template => template.category === category).map(template => <label key={template.key}>
            <input type="checkbox" name={`visaDoc_${template.key}`} />
            <span><strong>{template.title}</strong>{template.guidance && <small>{template.guidance}</small>}</span>
          </label>)}
        </fieldset>)}
      </div>}
      <label>Due date<input name="due" type="date" /></label>
      <label className="full">Instructions for the client<textarea name="documentNote" rows={2} placeholder="Certification, translation or file requirements" /></label>
      <div className="formActions full">
        <button className="primaryButton" disabled={working || !clientId || (mode === "visaChecklist" && !available.length)}>{working ? "Saving…" : "Add document request"}</button>
        <span>Existing requests and uploaded files stay on the case.</span>
      </div>
      {notice && <p className="full" role="status">{notice}</p>}
    </form>
  </details>;
}
