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
 *
 * A university's courses are shown by sector (the field of study), so a
 * university with hundreds of courses is still a short list to start from.
 * Course Finder opens the same view when a university's name is clicked;
 * people who may not change the catalogue see it without the forms.
 */
type Institution = { id: string; name: string; country: string; city?: string | null; active?: boolean };
type InstitutionDetail = Institution & { website?: string | null; notes?: string | null };
type Course = {
  id: string; name: string; level?: string | null; field_of_study?: string | null;
  duration_months?: number | null; tuition_fee?: number | null; currency?: string | null;
  intake_months?: string | null; notes?: string | null; active?: boolean;
};

const COMMON_SECTORS = ["Accounting", "Architecture & Building", "Arts & Humanities", "Business & Management", "Design & Creative Arts", "Education & Teaching", "Engineering", "English language", "Health", "Hospitality & Tourism", "Information Technology", "Law", "Nursing", "Science", "Social Work & Community", "Trades"];
const NO_SECTOR = "No sector recorded";
const STUDY_LEVELS = ["Certificate III", "Certificate IV", "Diploma", "Advanced Diploma", "Bachelor Degree", "Graduate Certificate", "Graduate Diploma", "Master Degree", "Master by Research", "PhD", "English language", "Foundation"];
const text = (value: unknown) => (value == null ? "" : String(value));

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/crm/course-finder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Could not save this entry.");
}

export function CourseMasters({ institutionId, canManage = true, onClose }: {
  /** Open straight on this university, as Course Finder does. */
  institutionId?: string;
  /** Without it the university and its courses are shown but cannot be changed. */
  canManage?: boolean;
  /** Shown as a way back when the view was opened from somewhere else. */
  onClose?: () => void;
} = {}) {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<InstitutionDetail | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState("");
  // Bumped after a course is added, so the form starts again empty, dropdowns included.
  const [addRound, setAddRound] = useState(0);
  const [addSector, setAddSector] = useState("");
  const [openSectors, setOpenSectors] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadList = useCallback(async () => {
    const response = await fetch("/api/crm/course-finder?masters=1", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load universities.");
    return (result.institutions ?? []) as Institution[];
  }, []);
  const fetchDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/crm/course-finder?institutionDetail=${encodeURIComponent(id)}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load this university.");
    return { institution: result.institution as InstitutionDetail, courses: (result.courses ?? []) as Course[] };
  }, []);
  const show = (detail: { institution: InstitutionDetail; courses: Course[] }) => {
    setSelected(detail.institution);
    setCourses(detail.courses);
    setQuery(text(detail.institution.name));
  };
  const loadDetail = async (id: string) => show(await fetchDetail(id));
  useEffect(() => {
    let active = true;
    void loadList().then(rows => { if (active) setInstitutions(rows); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [loadList]);
  useEffect(() => {
    if (!institutionId) return;
    let active = true;
    void fetchDetail(institutionId).then(detail => { if (active) show(detail); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [institutionId, fetchDetail]);

  // Courses under their sector, sectors in alphabetical order with the unsorted ones last.
  const bySector = new Map<string, Course[]>();
  for (const course of courses) {
    const sector = text(course.field_of_study).trim() || NO_SECTOR;
    bySector.set(sector, [...(bySector.get(sector) ?? []), course]);
  }
  const sectors = [...bySector.keys()].sort((a, b) => (a === NO_SECTOR ? 1 : b === NO_SECTOR ? -1 : a.localeCompare(b)));
  const sectorChoices = [...new Set([...sectors.filter(name => name !== NO_SECTOR), ...COMMON_SECTORS])].sort((a, b) => a.localeCompare(b));
  // A short catalogue is shown open; a long one starts as a list of sectors to pick from.
  const isOpen = (sector: string) => openSectors ? openSectors.has(sector) : sectors.length <= 3 || courses.length <= 12;
  const toggleSector = (sector: string) => setOpenSectors(current => {
    const next = new Set(current ?? sectors.filter(isOpen));
    if (next.has(sector)) next.delete(sector); else next.add(sector);
    return next;
  });

  // Picking a row opens that university; a name that is not on file starts a new one.
  const choose = (name: string) => {
    const match = institutions.find(item => item.name.toLowerCase() === name.trim().toLowerCase());
    setError(""); setNotice(""); setEditingCourse(""); setOpenSectors(null); setAddSector("");
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
    if (ok) {
      const sector = text(data.fieldOfStudy).trim() || NO_SECTOR;
      setOpenSectors(current => new Set([...(current ?? sectors.filter(isOpen)), sector]));
      setAddRound(round => round + 1);
    }
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
    <label>Sector / field of study<ComboBox name="fieldOfStudy" defaultValue={course ? text(course.field_of_study) : addSector} options={sectorChoices} placeholder="Select or type" /></label>
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
        <div className={styles.actions}>
          {onClose && <button type="button" className="ghostButton" onClick={onClose}>Back to Course Finder</button>}
          {canManage && <button type="button" className="ghostButton" onClick={() => { setSelected(null); setCourses([]); setQuery(""); setAdding(""); setError(""); setNotice(""); }}>Add a new university</button>}
        </div>
      </div>
      <label className={styles.finder}>Find a university
        <ComboBox value={query} onChange={setQuery} onChoose={choose} limit={50}
          options={institutions.map(item => ({ value: item.name, hint: [item.country, item.city, item.active === false ? "Hidden" : ""].filter(Boolean).join(" · ") }))}
          placeholder={institutions.length ? `Type a name or country — ${institutions.length.toLocaleString()} on file` : "Type a university name"}
          allowCustom={canManage} customLabel={typed => `Add “${typed}” as a new university`} ariaLabel="Find a university" />
      </label>
      {error && <p className="caseWorkError" role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {canManage && adding !== null && !selected && (
        <form key={`new-${adding}`} className={styles.form} onSubmit={event => void createInstitution(event)}>
          <h3>New university</h3>
          {institutionFields(undefined, adding)}
          <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Add university</button><button type="button" className="ghostButton" onClick={() => setAdding(null)}>Cancel</button></div>
        </form>
      )}

      {selected && <>
        {canManage ? <form key={`edit-${selected.id}`} className={styles.form} onSubmit={event => void saveInstitution(event)}>
            <h3>University details</h3>
            {institutionFields(selected)}
            <label className={styles.check}><input type="checkbox" name="active" defaultChecked={selected.active !== false} /> Shown in Course Finder and application forms</label>
            <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Save university</button></div>
          </form> : (
          <dl className={styles.facts}>
            <div><dt>University</dt><dd>{selected.name}</dd></div>
            <div><dt>Country</dt><dd>{[selected.country, selected.city].filter(Boolean).join(" · ")}</dd></div>
            {selected.website ? <div><dt>Website</dt><dd><a href={selected.website} target="_blank" rel="noreferrer">{selected.website}</a></dd></div> : null}
            {selected.notes ? <div><dt>Notes</dt><dd>{selected.notes}</dd></div> : null}
          </dl>
        )}

        <div className={styles.courses}>
          <h3>Courses at {selected.name} by sector <span>{courses.length}</span></h3>
          {courses.length === 0 && <p className={styles.empty}>{canManage ? "No courses recorded for this university yet. Add the first one below." : "No courses are recorded for this university yet."}</p>}
          {sectors.map(sector => {
            const list = bySector.get(sector) ?? [];
            const open = isOpen(sector);
            return <section key={sector} className={styles.sector}>
              <div className={styles.sectorHead}>
                <button type="button" className={styles.sectorToggle} aria-expanded={open} onClick={() => toggleSector(sector)}>
                  <span aria-hidden="true">{open ? "−" : "+"}</span><strong>{sector}</strong><small>{list.length} {list.length === 1 ? "course" : "courses"}</small>
                </button>
                {canManage && sector !== NO_SECTOR && <button type="button" className="ghostButton" aria-label={`Add a course in ${sector}`} onClick={() => { setAddSector(sector); setAddRound(round => round + 1); document.getElementById("add-course-form")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Add course here</button>}
              </div>
              {open && <ul>
                {list.map(course => <li key={course.id} className={course.active === false ? styles.hidden : ""}>
                  {editingCourse === course.id ? (
                    <form className={styles.form} onSubmit={event => void saveCourse(event, course)}>
                      {courseFields(course)}
                      <label className={styles.check}><input type="checkbox" name="active" defaultChecked={course.active !== false} /> Shown in Course Finder</label>
                      <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Save course</button><button type="button" className="ghostButton" onClick={() => setEditingCourse("")}>Cancel</button></div>
                    </form>
                  ) : (
                    <div className={styles.courseRow}>
                      <div><strong>{course.name}</strong><small>{[course.level, course.duration_months ? `${course.duration_months} months` : "", course.tuition_fee != null ? `${text(course.currency) || "AUD"} ${Number(course.tuition_fee).toLocaleString()}` : "", course.intake_months, course.active === false ? "Hidden" : ""].filter(Boolean).join(" · ") || "No details recorded"}</small></div>
                      {canManage && <button type="button" className="ghostButton" aria-label={`Edit ${course.name}`} onClick={() => setEditingCourse(course.id)}>Edit</button>}
                    </div>
                  )}
                </li>)}
              </ul>}
            </section>;
          })}
          {canManage && <form id="add-course-form" key={`add-${selected.id}-${addRound}`} className={styles.form} onSubmit={event => void createCourse(event)}>
            <h3>Add a course to {selected.name}</h3>
            {courseFields()}
            <div className={styles.actions}><button className="primaryButton" disabled={busy} type="submit">Add course</button></div>
          </form>}
        </div>
      </>}
      {!selected && adding === null && <p className={styles.empty}>{canManage ? "Type a university name above and pick it to see its courses by sector, change its details, change its courses or add a course. If it is not on file, the same box lets you add it." : "Type a university name above and pick it to see its courses by sector."}</p>}
    </article>
  </section>;
}
