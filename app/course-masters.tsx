"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ComboBox } from "./combo-box";
import { COUNTRIES } from "@/lib/reference-lists";
import styles from "./course-masters.module.css";

/**
 * Universities and their courses, maintained in one place: type a name to
 * find a university, pick it, then change its details, change any of its
 * courses or add a new one. A name that is not on file can be added from the
 * same box. Catalogue entries are shared across branches.
 */
type Institution = { id: string; name: string; country: string; city?: string | null; active?: boolean };
type InstitutionDetail = Institution & { website?: string | null; notes?: string | null };
type Course = {
  id: string; name: string; level?: string | null; field_of_study?: string | null;
  duration_months?: number | null; tuition_fee?: number | null; currency?: string | null;
  intake_months?: string | null; notes?: string | null; active?: boolean;
};

const STUDY_LEVELS = ["Certificate III", "Certificate IV", "Diploma", "Advanced Diploma", "Bachelor Degree", "Graduate Certificate", "Graduate Diploma", "Master Degree", "Master by Research", "PhD", "English language", "Foundation"];
const text = (value: unknown) => (value == null ? "" : String(value));

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/crm/course-finder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not save this entry.");
}

export function CourseMasters() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<InstitutionDetail | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState("");
  // Bumped after a course is added, so the form starts again empty, dropdowns included.
  const [addRound, setAddRound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadList = useCallback(async () => {
    const response = await fetch("/api/crm/course-finder?masters=1", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load universities.");
    return (result.institutions ?? []) as Institution[];
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/crm/course-finder?institutionDetail=${encodeURIComponent(id)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load this university.");
    setSelected(result.institution as InstitutionDetail);
    setCourses((result.courses ?? []) as Course[]);
  }, []);
  useEffect(() => {
    let active = true;
    void loadList().then(rows => { if (active) setInstitutions(rows); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [loadList]);

  // Picking a row opens that university; a name that is not on file starts a new one.
  const choose = (name: string) => {
    const match = institutions.find(item => item.name.toLowerCase() === name.trim().toLowerCase());
    setError(""); setNotice(""); setEditingCourse("");
    if (!match) { setSelected(null); setCourses([]); setAdding(name.trim()); return; }
    setAdding(null);
    void loadDetail(match.id).catch(reason => setError(reason.message));
  };

  const run = async (work: () => Promise<void>, done: string) => {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(done); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this entry."); return false; }
    finally { setBusy(false); }
  };
  const values = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>; };

  const createInstitution = async (event: FormEvent<HTMLFormElement>) => {
    const data = values(event);
    const ok = await run(async () => {
      await post({ ...data, action: "create_institution" });
      const rows = await loadList();
      setInstitutions(rows);
      const created = rows.find(item => item.name.toLowerCase() === data.name.trim().toLowerCase());
      if (created) { setAdding(null); setQuery(created.name); await loadDetail(created.id); }
    }, "University added. You can add its courses below.");
    if (!ok) return;
  };
  const saveInstitution = async (event: FormEvent<HTMLFormElement>) => {
    if (!selected) return;
    const data = values(event);
    await run(async () => {
      await post({ ...data, active: data.active === "on", action: "update_institution", institutionId: selected.id });
      setInstitutions(await loadList());
      setQuery(data.name.trim());
      await loadDetail(selected.id);
    }, "University details saved.");
  };
  const createCourse = async (event: FormEvent<HTMLFormElement>) => {
    if (!selected) return;
    const data = values(event);
    const ok = await run(async () => {
      await post({ ...data, action: "create_course", institutionId: selected.id });
      await loadDetail(selected.id);
    }, `Course added to ${selected.name}.`);
    if (ok) setAddRound(round => round + 1);
  };
  const saveCourse = async (event: FormEvent<HTMLFormElement>, course: Course) => {
    if (!selected) return;
    const data = values(event);
    const ok = await run(async () => {
      await post({ ...data, active: data.active === "on", action: "update_course", courseId: course.id });
      await loadDetail(selected.id);
    }, "Course saved.");
    if (ok) setEditingCourse("");
  };

  const courseFields = (course?: Course) => <>
    <label className={styles.wide}>Course name *<input name="name" required maxLength={250} defaultValue={text(course?.name)} /></label>
    <label>Study level<ComboBox name="level" defaultValue={text(course?.level)} options={STUDY_LEVELS} placeholder="Select or type" /></label>
    <label>Field of study<input name="fieldOfStudy" defaultValue={text(course?.field_of_study)} /></label>
    <label>Duration in months<input name="durationMonths" type="number" min="1" max="240" step="1" defaultValue={text(course?.duration_months)} /></label>
    <label>Tuition fee<input name="tuitionFee" type="number" min="0" step="0.01" defaultValue={text(course?.tuition_fee)} /></label>
    <label>Currency<input name="currency" defaultValue={text(course?.currency) || "AUD"} required pattern="[A-Z]{3}" maxLength={3} /></label>
    <label>Intakes<input name="intakeMonths" placeholder="February, July" defaultValue={text(course?.intake_months)} /></label>
    <label className={styles.wide}>Course notes<textarea name="notes" maxLength={4000} defaultValue={text(course?.notes)} /></label>
  </>;
  const institutionFields = (institution?: InstitutionDetail, name?: string) => <>
    <label className={styles.wide}>University / institution name *<input name="name" required maxLength={250} defaultValue={institution?.name ?? name ?? ""} /></label>
    <label>Country *<ComboBox name="country" required defaultValue={text(institution?.country)} options={COUNTRIES} placeholder="Select country" /></label>
    <label>City<input name="city" maxLength={150} defaultValue={text(institution?.city)} /></label>
    <label className={styles.wide}>Official website<input name="website" type="url" placeholder="https://" defaultValue={text(institution?.website)} /></label>
    <label className={styles.wide}>Notes<textarea name="notes" maxLength={4000} defaultValue={text(institution?.notes)} /></label>
  </>;

  return <section className="adminStack" aria-label="University and course masters">
    <article className={`panel listPanel ${styles.masters}`}>
      <div className={styles.head}>
        <h2>Universities &amp; courses</h2>
        <button type="button" className="ghostButton" onClick={() => { setSelected(null); setCourses([]); setQuery(""); setAdding(""); setError(""); setNotice(""); }}>Add a new university</button>
      </div>
      <label className={styles.finder}>Find a university
        <ComboBox value={query} onChange={setQuery} onChoose={choose} limit={50}
          options={institutions.map(item => ({ value: item.name, hint: [item.country, item.city, item.active === false ? "Hidden" : ""].filter(Boolean).join(" · ") }))}
          placeholder={institutions.length ? `Type a name or country — ${institutions.length.toLocaleString()} on file` : "Type a university name"}
          customLabel={typed => `Add “${typed}” as a new university`} ariaLabel="Find a university" />
      </label>
      {error && <p className="caseWorkError" role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {adding !== null && !selected && (
        <form key={`new-${adding}`} className={styles.form} onSubmit={event => void createInstitution(event)}>
          <h3>New university</h3>
          {institutionFields(undefined, adding)}
          <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Add university</button><button type="button" className="ghostButton" onClick={() => setAdding(null)}>Cancel</button></div>
        </form>
      )}

      {selected && <>
        <form key={`edit-${selected.id}`} className={styles.form} onSubmit={event => void saveInstitution(event)}>
          <h3>University details</h3>
          {institutionFields(selected)}
          <label className={styles.check}><input type="checkbox" name="active" defaultChecked={selected.active !== false} /> Shown in Course Finder and application forms</label>
          <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Save university</button></div>
        </form>

        <div className={styles.courses}>
          <h3>Courses at {selected.name} <span>{courses.length}</span></h3>
          {courses.length === 0 && <p className={styles.empty}>No courses recorded for this university yet. Add the first one below.</p>}
          <ul>
            {courses.map(course => <li key={course.id} className={course.active === false ? styles.hidden : ""}>
              {editingCourse === course.id ? (
                <form className={styles.form} onSubmit={event => void saveCourse(event, course)}>
                  {courseFields(course)}
                  <label className={styles.check}><input type="checkbox" name="active" defaultChecked={course.active !== false} /> Shown in Course Finder</label>
                  <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Save course</button><button type="button" className="ghostButton" onClick={() => setEditingCourse("")}>Cancel</button></div>
                </form>
              ) : (
                <div className={styles.courseRow}>
                  <div><strong>{course.name}</strong><small>{[course.level, course.field_of_study, course.duration_months ? `${course.duration_months} months` : "", course.tuition_fee != null ? `${text(course.currency) || "AUD"} ${Number(course.tuition_fee).toLocaleString()}` : "", course.intake_months, course.active === false ? "Hidden" : ""].filter(Boolean).join(" · ") || "No details recorded"}</small></div>
                  <button type="button" className="ghostButton" aria-label={`Edit ${course.name}`} onClick={() => setEditingCourse(course.id)}>Edit</button>
                </div>
              )}
            </li>)}
          </ul>
          <form key={`add-${selected.id}-${addRound}`} className={styles.form} onSubmit={event => void createCourse(event)}>
            <h3>Add a course to {selected.name}</h3>
            {courseFields()}
            <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Add course</button></div>
          </form>
        </div>
      </>}
      {!selected && adding === null && <p className={styles.empty}>Type a university name above and pick it to change its details, change its courses or add a course. If it is not on file, the same box lets you add it.</p>}
    </article>
  </section>;
}
