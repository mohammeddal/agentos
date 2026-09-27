import { useId, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";

export function HelpTip({
  label,
  children,
  align = "start",
}: {
  label: string;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const id = useId();
  return (
    <span className="co-help-tip" data-align={align}>
      <button type="button" aria-label={label} aria-describedby={id}>
        <CircleHelp size={14} />
      </button>
      <span id={id} role="tooltip">
        {children}
      </span>
    </span>
  );
}
