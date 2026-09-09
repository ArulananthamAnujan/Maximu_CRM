"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CopilotPanel, type CopilotContext } from "./copilot-panel";

const empty: CopilotContext = { key: "general", label: "General writing" };
const Context = createContext<{
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  reset: () => void;
  setContext: (context: CopilotContext) => void;
}>({ isOpen: false, toggle() {}, open() {}, reset() {}, setContext() {} });
export const useCopilot = () => useContext(Context);

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [activated, setActivated] = useState(false);
  const [context, setContext] = useState<CopilotContext>(empty);
  const open = useCallback(() => { setActivated(true); setOpen(true); }, []);
  const toggle = useCallback(() => { setActivated(true); setOpen(value => !value); }, []);
  const reset = useCallback(() => { setOpen(false); setActivated(false); setContext(empty); }, []);
  const state = useMemo(() => ({ isOpen, open, toggle, reset, setContext }), [isOpen, open, toggle, reset]);
  useEffect(() => {
    document.body.classList.toggle("copilotIsOpen", isOpen);
    return () => document.body.classList.remove("copilotIsOpen");
  }, [isOpen]);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.copilotTrigger')?.focus());
  };
  return <Context.Provider value={state}>{children}<aside className="copilotDock" id="crm-copilot" aria-label="Copilot" hidden={!isOpen} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
    {activated && <CopilotPanel key={context.key} context={context} onClose={close} onChooseCase={match => window.dispatchEvent(new CustomEvent("maximus:copilot-case", { detail: match }))} />}
  </aside></Context.Provider>;
}
