import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function CompanyDialog({
  title,
  close,
  children,
  wide,
  expanded,
}: {
  expanded?: boolean;
  title: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current!;
    const siblings = [...(dialog.closest(".company-app")?.children || [])].filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.contains(dialog),
    );
    const inertStates = siblings.map((el) => el.inert);
    siblings.forEach((el) => {
      el.inert = true;
    });
    const focusable = () =>
      [
        ...dialog.querySelectorAll<HTMLElement>(
          "button, input, select, textarea, summary, a[href], [tabindex]",
        ),
      ].filter(
        (el) => el.tabIndex >= 0 && !el.matches(":disabled") && el.getClientRects().length > 0,
      );
    const items = focusable();
    (items.find((el) => el.matches("input, textarea, select")) || items[0] || dialog).focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      siblings.forEach((el, i) => {
        el.inert = inertStates[i]!;
      });
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="co-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className={`co-dialog ${expanded ? "co-dialog-canvas" : ""} ${wide ? "co-dialog-wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="co-dialog-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="co-dialog-title">{title}</h2>
          <button aria-label="Close dialog" onClick={close}>
            <X size={19} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
