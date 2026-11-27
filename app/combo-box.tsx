"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./combo-box.module.css";

/**
 * A text field with a proper list of choices under it: the person can pick
 * one, filter by typing, or keep what they typed. It replaces the browser's
 * datalist, which draws a bare native menu that ignores the product's look
 * and escapes the dialog it belongs to.
 *
 * Works uncontrolled (name + defaultValue inside a form) or controlled
 * (value + onChange), like an input.
 */
export type ComboOption = { value: string; hint?: string };

export function ComboBox({ options, name, id, value, defaultValue = "", onChange, placeholder, required, ariaLabel, allowCustom = true, disabled, inputStyle, customLabel, limit, onChoose, remote, minChars = 0, note }: {
  options: readonly (string | ComboOption)[];
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  ariaLabel?: string;
  /** Whether something that is not in the list is kept as typed. */
  allowCustom?: boolean;
  disabled?: boolean;
  /** The options are already the matches for what was typed (a search done elsewhere), so they are not filtered again here. */
  remote?: boolean;
  /** Suggest only once this many letters are typed. A search box should not open a list just for being clicked; the arrow still shows the list on request. */
  minChars?: number;
  /** A line shown in the list that is not a choice: "Searching…", or that nothing matched. */
  note?: string;
  /** Called only when a row is picked, not on every letter typed. */
  onChoose?: (value: string) => void;
  /** What the "keep what I typed" row says; by default, Use “…”. */
  customLabel?: (typed: string) => string;
  /** With a very long list, how many choices to draw at once; typing narrows to the rest. */
  limit?: number;
  /** For pages outside the product's stylesheet, such as the public intake. */
  inputStyle?: CSSProperties;
}) {
  const generated = useId();
  const inputId = id ?? `combo-${generated}`;
  const listId = `${inputId}-list`;
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue);
  const text = controlled ? value : own;
  const [open, setOpen] = useState(false);
  const [picked, setActive] = useState(-1);
  const [filtering, setFiltering] = useState(false);
  // Set when the arrow is pressed: the person asked to see the list.
  const [asked, setAsked] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLUListElement | null>(null);

  const items: ComboOption[] = options.map((o) => (typeof o === "string" ? { value: o } : o));
  const needle = text.trim().toLowerCase();
  const matching = remote ? items : filtering && needle ? items.filter((o) => o.value.toLowerCase().includes(needle) || (o.hint ?? "").toLowerCase().includes(needle)) : items;
  const shown = limit && matching.length > limit ? matching.slice(0, limit) : matching;
  const hidden = matching.length - shown.length;
  const exact = items.some((o) => o.value.toLowerCase() === needle);
  const custom = allowCustom && needle && !exact ? text.trim() : "";
  // With a search done elsewhere the matches arrive after the typing, so the
  // first of them is the highlighted one until the arrows move it.
  const active = picked >= 0 ? picked : remote && filtering && needle && shown.length ? 0 : -1;

  const set = (next: string) => {
    if (!controlled) setOwn(next);
    onChange?.(next);
  };
  const choose = (next: string) => {
    set(next);
    onChoose?.(next);
    setOpen(false);
    setFiltering(false);
    setAsked(false);
    setActive(-1);
  };

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setFiltering(false); setAsked(false); } };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // The list always opens under the field, where the eye already is while
  // typing. With no room there, the form scrolls just enough to show it.
  useEffect(() => {
    if (!open) return;
    list.current?.scrollIntoView({ block: "nearest" });
    root.current?.scrollIntoView({ block: "nearest" });
  }, [open]);
  // Keeps the highlighted choice in view when moving through a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const quiet = minChars > 0 && !asked && needle.length < minChars;
  const rows = quiet ? [] : [...shown.map((o) => ({ kind: "option" as const, ...o })), ...(custom ? [{ kind: "custom" as const, value: custom }] : [])];

  return (
    <div className={styles.combo} ref={root}>
      <input
        id={inputId}
        name={name}
        value={text}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        style={inputStyle}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && rows.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          const typed = event.target.value;
          set(typed);
          setFiltering(true);
          setOpen(true);
          // The first match is ready to take with Enter; with none, nothing is.
          const probe = typed.trim().toLowerCase();
          setActive(probe && (remote ? items.length > 0 : items.some((o) => o.value.toLowerCase().includes(probe) || (o.hint ?? "").toLowerCase().includes(probe))) ? 0 : -1);
        }}
        onFocus={() => { setFiltering(false); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(rows.length - 1, i + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (event.key === "Enter" && open && active >= 0 && rows[active]) { event.preventDefault(); choose(rows[active].value); }
          // Enter while choosing closes the list; it must not send the whole form.
          else if (event.key === "Enter" && open) { event.preventDefault(); setOpen(false); setFiltering(false); }
          else if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); setFiltering(false); }
          else if (event.key === "Tab") { setOpen(false); setFiltering(false); }
        }}
      />
      <button type="button" className={styles.toggle} tabIndex={-1} aria-label={open ? "Hide choices" : "Show choices"} disabled={disabled} onClick={() => { setFiltering(false); setAsked(!open); setOpen(!open); }}>
        <ChevronDown size={16} />
      </button>
      {open && (rows.length > 0 || (note && !quiet)) && (
        <ul className={styles.list} id={listId} role="listbox" ref={list}>
          {note && !quiet ? <li className={styles.more} role="presentation">{note}</li> : null}
          {rows.map((row, index) => (
            <li
              key={`${row.kind}-${row.value}`}
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={row.value === text}
              className={`${styles.option} ${index === active ? styles.active : ""} ${row.value === text ? styles.selected : ""}`}
              onMouseDown={(event) => { event.preventDefault(); choose(row.value); }}
              onMouseEnter={() => setActive(index)}
            >
              {row.kind === "custom" ? <span>{customLabel ? customLabel(row.value) : `Use “${row.value}”`}</span> : <span>{row.value}</span>}
              {row.kind === "option" && row.hint ? <small>{row.hint}</small> : null}
            </li>
          ))}
          {hidden > 0 ? <li className={styles.more} role="presentation">{hidden.toLocaleString()} more. Type a few letters to narrow the list.</li> : null}
        </ul>
      )}
    </div>
  );
}
