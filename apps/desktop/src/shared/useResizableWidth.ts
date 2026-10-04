import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * A side panel width the user can drag, remembered per panel. The handle sits on the panel's
 * left edge, so dragging left widens it.
 */
export function useResizableWidth(storageKey: string, initial: number, min = 300, max = 760) {
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      return saved ? clamp(saved) : initial;
    } catch {
      return initial;
    }
  });
  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = width;
      let latest = startWidth;
      const move = (moveEvent: PointerEvent) => {
        latest = clamp(startWidth + startX - moveEvent.clientX);
        setWidth(latest);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.style.cursor = "";
        try {
          localStorage.setItem(storageKey, String(latest));
        } catch {
          /* The width still applies for this session. */
        }
      };
      document.body.style.cursor = "col-resize";
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [width, storageKey],
  );
  const nudge = (delta: number) =>
    setWidth((current) => {
      const next = clamp(current + delta);
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        /* Session only. */
      }
      return next;
    });
  return { width, startResize, nudge };
}
