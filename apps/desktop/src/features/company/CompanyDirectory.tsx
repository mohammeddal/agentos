import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  Blocks,
  ChevronRight,
  Code2,
  Database,
  FlaskConical,
  Layers3,
  Megaphone,
  MoreHorizontal,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import type { Office } from "./company-model";
const domainIcons: Record<string, typeof Database> = {
  "Data & Analytics": Database,
  "Software Engineering": Code2,
  Marketing: Megaphone,
  Finance: Wallet,
  Research: FlaskConical,
  Operations: Layers3,
  Custom: Blocks,
};
function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
}
export function OfficeCard({
  office,
  index,
  onOpen,
  onAdd,
  onEdit,
}: {
  office: Office;
  index: number;
  onOpen: () => void;
  onAdd: () => void;
  onEdit: () => void;
}) {
  const Icon = Object.hasOwn(domainIcons, office.domain) ? domainIcons[office.domain]! : Blocks;
  return (
    <article className={`co-office-card tone-${office.color}`}>
      <div className="co-office-card-top">
        <span className="co-office-number">OFFICE {String(index + 1).padStart(2, "0")}</span>
        <button aria-label={`Edit ${office.name}`} onClick={onEdit}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      <button className="co-office-card-heading" onClick={onOpen}>
        <span className="co-domain-icon">
          <Icon size={23} />
        </span>
        <span>
          <h3>{office.name}</h3>
        </span>
        <ArrowUpRight size={17} />
      </button>
      <div className="co-card-divider" />
      <div className="co-card-team-label">
        <span>THE TEAM</span>
        <span>
          {office.agents.length} {office.agents.length === 1 ? "agent" : "agents"}
        </span>
      </div>
      <div className="co-card-team">
        {office.agents.slice(0, 3).map((a, i) => (
          <button key={a.id} onClick={onOpen}>
            <span
              className="co-agent-initial"
              style={{ "--avatar-rotation": `${i * 20}deg` } as CSSProperties}
            >
              {initials(a.name)}
            </span>
            <span>
              <strong>{a.name}</strong>
              <small>{a.role}</small>
            </span>
            <span className="co-rest-dot" title="Not connected" />
          </button>
        ))}
        {office.agents.length === 0 && (
          <div className="co-empty-team">
            <span>
              <Users size={21} />
            </span>
            <strong>A fresh start.</strong>
            <p>Your office is ready for its first agent.</p>
          </div>
        )}
        {office.agents.length > 3 && (
          <button className="co-more-agents" onClick={onOpen}>
            +{office.agents.length - 3} more teammates <ChevronRight size={12} />
          </button>
        )}
      </div>
      <footer>
        <button onClick={onAdd}>
          <Plus size={14} /> Add agent
        </button>
      </footer>
    </article>
  );
}
