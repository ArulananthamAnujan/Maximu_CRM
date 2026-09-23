"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import styles from "./course-masters.module.css";

type Institution = { id: string; name: string; country: string; city?: string };

export function CourseMasters() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [institutionId, setInstitutionId] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/crm/course-finder?limit=1");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load universities.");
    return (result.institutions ?? []) as Institution[];
  }, []);
  useEffect(() => {
    let active = true;
    void load().then(rows => { if (active) setInstitutions(rows); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [load]);
  const submit = async (event: FormEvent<HTMLFormElement>, action: string) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true); setError(""); setNotice("");
    try {
      const values = Object.fromEntries(new FormData(form));
      const response = await fetch("/api/crm/course-finder", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this entry.");
      form.reset();
      setNotice(`${action === "create_institution" ? "University / institution" : "Course"} saved. It is available in Course Finder and application selection.`);
      try { setInstitutions(await load()); } catch { setNotice("Saved successfully. Refresh this page to reload the university list."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this entry."); }
    finally { setBusy(false); }
  };
  const choices = institutions.filter(item => item.id === institutionId || `${item.name} ${item.country}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="adminStack" aria-label="University and course masters">
    <article className="panel listPanel">
      <div className="panelHead"><div><span className="kicker">MASTER LISTS</span><h2>Universities &amp; courses</h2><p>Add missing study options for your team. Catalogue entries are shared across branches.</p></div></div>
      {error && <p className="caseWorkError" role="alert">{error}</p>}
      {notice && <p className="handoverPanel" role="status">{notice}</p>}
      <form className={styles.form} onSubmit={event => void submit(event, "create_institution")}>
        <h3>Add university / institution</h3>
        <label>Institution name *<input name="name" required maxLength={250} /></label>
        <label>Country *<input name="country" required maxLength={100} /></label>
        <label>City<input name="city" maxLength={150} /></label>
        <label>Official website<input name="website" type="url" placeholder="https://" /></label>
        <label>Institution notes<textarea name="notes" maxLength={4000} /></label>
        <button className="primaryButton" disabled={busy} type="submit">Add institution</button>
      </form>
    </article>
    <article className="panel listPanel">
      <form className={styles.form} onSubmit={event => void submit(event, "create_course")}>
        <h3>Add course</h3>
        <label>Find institution<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or country" /></label>
        <label>Institution *<select name="institutionId" required value={institutionId} onChange={event => setInstitutionId(event.target.value)}><option value="">Choose an institution</option>{choices.map(item => <option key={item.id} value={item.id}>{item.name} — {item.country}</option>)}</select></label>
        <label>Course name *<input name="name" required maxLength={250} /></label>
        <label>Study level<input name="level" placeholder="Bachelor, Master, Diploma…" /></label>
        <label>Field of study<input name="fieldOfStudy" /></label>
        <label>Duration in months<input name="durationMonths" type="number" min="1" max="240" step="1" /></label>
        <label>Tuition fee<input name="tuitionFee" type="number" min="0" step="0.01" /></label>
        <label>Currency<input name="currency" defaultValue="AUD" required pattern="[A-Z]{3}" maxLength={3} /></label>
        <label>Intakes<input name="intakeMonths" placeholder="February, July" /></label>
        <label>Course notes<textarea name="notes" maxLength={4000} /></label>
        <button className="primaryButton" disabled={busy || !institutionId} type="submit">Add course</button>
      </form>
    </article>
  </section>;
}
