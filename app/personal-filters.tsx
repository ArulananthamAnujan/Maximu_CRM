"use client";

import { useEffect, useId, useState } from "react";
import { Plus, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import styles from "./personal-filters.module.css";

export type PersonalFilterField = {
  key: string;
  label: string;
  options?: { value: string; label: string }[];
  type?: "text" | "date";
  placeholder?: string;
};
type Values = Record<string, string>;
type SavedView = { id: string; name: string; filters: { values?: Values; visible?: string[]; query?: string } };

/** Filters are always applied by the existing, permission-scoped register. */
export function PersonalFilters({ module, label, fields, values, query, onChange, onApply }: {
  module: string; label: string; fields: PersonalFilterField[]; values: Values; query: string;
  onChange: (key: string, value: string) => void;
  onApply: (values: Values, query: string) => void;
}) {
  const id = useId();
  const [visible, setVisible] = useState<string[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const shown = fields.filter(field => visible.includes(field.key) || values[field.key]);
  const remaining = fields.filter(field => !shown.includes(field));
  const activeCount = fields.filter(field => Boolean(values[field.key])).length;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/crm/saved-views?module=" + encodeURIComponent(module), { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Saved views could not be loaded.");
        if (!controller.signal.aborted) { setViews(result.views || []); setError(""); }
      })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message || "Saved views could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [module, reload]);

  function edited() { setSelected(""); setNotice(""); }
  function apply(view: SavedView) {
    const allowed: Values = {};
    for (const field of fields) {
      const value = view.filters.values?.[field.key];
      allowed[field.key] = typeof value === "string" ? value : "";
    }
    setVisible(fields.filter(field => view.filters.visible?.includes(field.key) || allowed[field.key]).map(field => field.key));
    onApply(allowed, typeof view.filters.query === "string" ? view.filters.query : "");
    setSelected(view.id);
    setName(view.name);
    setSaving(false);
    setNotice("Applied “" + view.name + "”.");
  }
  async function mutate(action: "create" | "delete") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/crm/saved-views", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "delete" ? { action, module, id: selected } : {
          action, module, name: name.trim(),
          filters: { version: 1, values: Object.fromEntries(fields.map(field => [field.key, values[field.key] || ""])), visible: shown.map(field => field.key), query },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The saved view could not be changed.");
      setViews(result.views || []);
      setSelected(action === "delete" ? "" : (result.views || []).find((view: SavedView) => view.name === name.trim())?.id || "");
      setSaving(false);
      setNotice(action === "delete" ? "Saved view deleted. Current filters are unchanged." : "View saved to your account.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The saved view could not be changed.");
    } finally { setBusy(false); }
  }

  return <section className={styles.panel} aria-label={label + " filters"}>
    <div className={styles.toolbar}>
      <strong><SlidersHorizontal size={16} /> Filters{activeCount ? " (" + activeCount + ")" : ""}</strong>
      <label className={styles.add}><Plus size={15} /><span className={styles.srOnly}>Add filter</span>
        <select aria-label="Add filter" value="" disabled={!remaining.length} onChange={event => { setVisible([...shown.map(field => field.key), event.target.value]); edited(); }}>
          <option value="">Add filter</option>{remaining.map(field => <option key={field.key} value={field.key}>{field.label}</option>)}
        </select>
      </label>
      <label className={styles.view}><span className={styles.srOnly}>My saved views</span>
        <select aria-label="My saved views" value={selected} disabled={busy || loading} onChange={event => { const view = views.find(item => item.id === event.target.value); if (view) apply(view); else setSelected(""); }}>
          <option value="">{loading ? "Loading views…" : "My saved views"}</option>{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy} onClick={() => { setSaving(!saving); setName(selected ? views.find(view => view.id === selected)?.name || "" : ""); }}><Save size={15} /> Save view</button>
      {selected && <button type="button" disabled={busy} aria-label="Delete selected saved view" onClick={() => { if (window.confirm("Delete this saved view?")) void mutate("delete"); }}><Trash2 size={15} /></button>}
      <button type="button" disabled={busy || !(shown.length || query)} onClick={() => { setVisible([]); onApply({}, ""); edited(); setSaving(false); }}><X size={15} /> Clear filters</button>
    </div>
    {saving && <form className={styles.save} onSubmit={event => { event.preventDefault(); void mutate("create"); }}>
      <label htmlFor={id + "-name"}>View name</label>
      <input id={id + "-name"} value={name} maxLength={80} required placeholder="e.g. Australia – needs follow-up" onChange={event => setName(event.target.value)} />
      <button type="submit" disabled={busy || !name.trim()}>{busy ? "Saving…" : views.some(view => view.name === name.trim()) ? "Update saved view" : "Save to my account"}</button>
      <button type="button" disabled={busy} onClick={() => setSaving(false)}>Cancel</button>
      <small>Private to your account. Includes the current search.</small>
    </form>}
    {shown.length > 0 ? <div className={styles.grid}>{shown.map(field => {
      const value = values[field.key] || "";
      return <div key={field.key} className={styles.field}>
        <label htmlFor={id + "-" + field.key}>{field.label}</label>
        <button type="button" className={styles.remove} aria-label={"Remove " + field.label + " filter"} onClick={() => { setVisible(shown.filter(item => item.key !== field.key).map(item => item.key)); onChange(field.key, ""); edited(); }}><X size={14} /></button>
        {field.options ? <select id={id + "-" + field.key} value={value} onChange={event => { onChange(field.key, event.target.value); edited(); }}>
          <option value="">All</option>
          {value && !field.options.some(option => option.value === value) && <option value={value}>{value} (not in current options)</option>}
          {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select> : <input id={id + "-" + field.key} type={field.type || "text"} value={value} placeholder={field.placeholder} onChange={event => { onChange(field.key, event.target.value); edited(); }} />}
      </div>;
    })}</div> : <p className={styles.hint}>Choose “Add filter” to narrow this list. Combine as many fields as you need.</p>}
    {shown.length > 1 && <p className={styles.hint}>Results must match all selected filters.</p>}
    {error && <p className={styles.error} role="alert">{error} <button type="button" disabled={busy || loading} onClick={() => { setLoading(true); setReload(value => value + 1); }}>Reload saved views</button></p>}
    {notice && <p className={styles.hint} role="status">{notice}</p>}
  </section>;
}
