"use client";
import { useRef, useState } from "react";
import { accessGroups, actionPermissions, modulePermissions, permissionKeys, canUse, roleForLevel, type FunctionAccess, type PermissionKey, type ServiceMode } from "@/lib/function-access";
import {staffTimezones,type StaffDetails} from "@/lib/staff-details";
import { useOverlayFocus } from "./use-overlay-focus";
import styles from "./staff-function-access.module.css";

export function FunctionAccessFields({ level, value, onChange, disabled = false }: {
  level: string; value: FunctionAccess | null; onChange: (value: FunctionAccess | null) => void; disabled?: boolean;
}) {
  const role = roleForLevel(level);
  if (role === "super_admin") return <p className={styles.notice}>Super Admin retains access to every workspace and function.</p>;
  const identity = { role, functionAccess: value };
  const set = (key: PermissionKey, enabled: boolean) => {
    const next = { ...value, [key]: enabled };
    // A scoped choice replaces a legacy global deny without enabling the other workspace.
    if (key.includes(".")) {
      const [mode, module] = key.split(".");
      if (value?.[module as PermissionKey] === false) {
        next[`${mode === "study" ? "direct_visa" : "study"}.${module}` as PermissionKey] = false;
        delete next[module as PermissionKey];
      }
    }
    onChange(next);
  };
  const toggle = (key: PermissionKey, label: string, locked = false) => {
    const eligible = key === "action_transfer_branch" ? ["admin", "staff"].includes(role) : canUse({ role }, key);
    return <label className={styles.toggle} key={key}>
      <span>{label}{!eligible && <small>{key.endsWith("integrations") ? "Super Admin only" : "Admin accounts only"}</small>}</span>
      <input type="checkbox" role="switch" aria-label={label} checked={canUse(identity, key)}
        disabled={disabled || locked || !eligible} onChange={event => set(key, event.target.checked)} />
    </label>;
  };
  const group = (mode: ServiceMode, title: string, master: "study_access" | "direct_visa_access") => {
    const entries = modulePermissions.filter(([key]) => mode === "study" ? key !== "direct_visas" : !["students", "applications", "view_applications", "all_applications", "courseFinder"].includes(key));
    const enabled = entries.filter(([key]) => canUse(identity, key, mode)).length;
    return <fieldset className={styles.group} aria-label={title}>
      <legend>{title}<span>{enabled} enabled</span></legend>
      <p>Choose the sections this account can use in {mode === "study" ? "Study Abroad" : "Direct Visa"}.</p>
      <div className={styles.grid}>{entries.map(([key, label]) => toggle(`${mode}.${key}`, label, !canUse(identity, master)))}</div>
    </fieldset>;
  };
  return <div className={styles.permissions}>
    <div className={styles.intro}><div><h3>Account permissions</h3><p>Choose workspace access, then the sections and actions this person can use. Branch restrictions still apply.</p></div>
      <div className={styles.actions}><button type="button" disabled={disabled} onClick={() => onChange(Object.fromEntries(permissionKeys.map(key => [key, false])))}>Turn all off</button>
        <button type="button" disabled={disabled} onClick={() => onChange(null)}>Restore role defaults</button></div></div>
    <div className={styles.masters}>{accessGroups.map(([key, label]) => toggle(key, label))}</div>
    {canUse(identity,"study_access") && group("study", "Study permission", "study_access")}
    {canUse(identity,"direct_visa_access") && group("direct_visa", "Direct Visa permission", "direct_visa_access")}
    <fieldset className={styles.group} aria-label="Special permission"><legend>Special permission</legend>
      <p>Control actions separately from access to a section. Bulk delete also requires Delete.</p>
      <div className={styles.grid}>{actionPermissions.map(([key, label]) => toggle(key, label, !canUse(identity, "special_access")))}</div>
    </fieldset>
  </div>;
}
export function StaffFunctionAccess({ person, save, close }: {
  person: { id: string; display_name: string; level: string; email?: string; department?: string | null; staff_details?: StaffDetails; function_access?: FunctionAccess | null };
  save: (access: FunctionAccess | null, details: {displayName:string;department:string;staffDetails:StaffDetails}) => Promise<boolean>; close: () => void;
}) {
  const [access, setAccess] = useState(person.function_access ?? null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [name,setName]=useState(person.display_name),[department,setDepartment]=useState(person.department??""),[details,setDetails]=useState<StaffDetails>(person.staff_details??{});
  const ref = useRef<HTMLElement | null>(null);
  useOverlayFocus(true, ref, () => { if (!busy) close(); });
  return <div className={styles.backdrop}><section ref={ref} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="access-title" tabIndex={-1}>
    <header><div><small>STAFF & MASTERS · UPDATE ACCESS</small><h2 id="access-title">{person.display_name}</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close function access">×</button></header>
    <div className={styles.accountFields} style={{marginBottom:24}}>
      <label>Full name *<input required value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>
      <label>Work email<input type="email" value={person.email??""} readOnly/><small>Used for secure sign-in.</small></label>
      <label>Mobile<input type="tel" value={details.mobile??""} onChange={e=>setDetails({...details,mobile:e.target.value})} disabled={busy}/></label>
      <label>Timezone<select value={details.timezone??""} onChange={e=>setDetails({...details,timezone:e.target.value})} disabled={busy}><option value="">Organisation default</option>{staffTimezones.map(zone=><option key={zone}>{zone}</option>)}</select></label>
      <label>Team / department<input value={department} onChange={e=>setDepartment(e.target.value)} disabled={busy}/></label>
    </div>
    <FunctionAccessFields level={person.level} value={access} onChange={setAccess} disabled={busy} />
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><button disabled={busy} onClick={close}>Cancel</button><button className="primaryButton" disabled={busy} onClick={async () => {
      if(!name.trim()){setError("Enter the staff member’s full name.");return;} setBusy(true); setError(""); try { if (await save(access,{displayName:name,department,staffDetails:details})) close(); else setError("Access was not saved. Please try again."); }
      catch (reason) { setError(reason instanceof Error ? reason.message : "Access was not saved."); } finally { setBusy(false); }
    }}>{busy ? "Saving…" : "Save access"}</button></footer>
  </section></div>;
}
