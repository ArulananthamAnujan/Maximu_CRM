"use client";
import { useEffect, useId, useRef, useState } from "react";
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

export function ComboBox({ options, name, id, value, defaultValue = "", onChange, placeholder, required, ariaLabel, allowCustom = true, disabled }: {
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
}) {
  const generated = useId();
  const inputId = id ?? `combo-${generated}`;
  const listId = `${inputId}-list`;
  const controlled = value !== undefined;
  const [own, setOwn] = useState(defaultValue);
  const text = controlled ? value : own;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [filtering, setFiltering] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  const items: ComboOption[] = options.map((o) => (typeof o === "string" ? { value: o } : o));
  const needle = text.trim().toLowerCase();
  const shown = filtering && needle ? items.filter((o) => o.value.toLowerCase().includes(needle) || (o.hint ?? "").toLowerCase().includes(needle)) : items;
  const exact = items.some((o) => o.value.toLowerCase() === needle);
  const custom = allowCustom && needle && !exact ? text.trim() : "";

  const set = (next: string) => {
    if (!controlled) setOwn(next);
    onChange?.(next);
  };
  const choose = (next: string) => {
    set(next);
    setOpen(false);
    setFiltering(false);
    setActive(-1);
  };

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setFiltering(false); } };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const rows = [...shown.map((o) => ({ kind: "option" as const, ...o })), ...(custom ? [{ kind: "custom" as const, value: custom }] : [])];

  return (
    <div className={styles.combo} ref={root}>
      <input
        id={inputId}
        name={name}
        value={text}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => { set(event.target.value); setFiltering(true); setOpen(true); setActive(-1); }}
        onFocus={() => { setFiltering(false); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(rows.length - 1, i + 1)); }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          else if (event.key === "Enter" && open && active >= 0) { event.preventDefault(); choose(rows[active].value); }
          else if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); setFiltering(false); }
          else if (event.key === "Tab") { setOpen(false); setFiltering(false); }
        }}
      />
      <button type="button" className={styles.toggle} tabIndex={-1} aria-label={open ? "Hide choices" : "Show choices"} disabled={disabled} onClick={() => { setFiltering(false); setOpen(!open); }}>
        <ChevronDown size={16} />
      </button>
      {open && rows.length > 0 && (
        <ul className={styles.list} id={listId} role="listbox">
          {rows.map((row, index) => (
            <li
              key={`${row.kind}-${row.value}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={row.value === text}
              className={`${styles.option} ${index === active ? styles.active : ""} ${row.value === text ? styles.selected : ""}`}
              onMouseDown={(event) => { event.preventDefault(); choose(row.value); }}
              onMouseEnter={() => setActive(index)}
            >
              {row.kind === "custom" ? <span>Use “{row.value}”</span> : <span>{row.value}</span>}
              {row.kind === "option" && row.hint ? <small>{row.hint}</small> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
