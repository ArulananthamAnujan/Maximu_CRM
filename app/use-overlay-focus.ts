"use client";

import { useEffect, useRef } from "react";

const overlayStack: HTMLElement[] = [];

/** Keep keyboard navigation within the active drawer, then return to its trigger. */
export function useOverlayFocus(
  open: boolean,
  ref: { current: HTMLElement | null },
  onClose: () => void,
) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const trigger = document.activeElement as HTMLElement | null;
    overlayStack.push(panel);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
    )).filter(element => element.getClientRects().length && !element.closest('[inert]'));
    (focusable()[0] ?? panel).focus();
    const onKey = (event: KeyboardEvent) => {
      // The top overlay owns keyboard input, including when a saving button
      // becomes disabled and the browser temporarily moves focus to the body.
      if (overlayStack.at(-1) !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); panel.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel || !panel.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = overlayStack.lastIndexOf(panel);
      if (index !== -1) overlayStack.splice(index, 1);
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open, ref]);
}
