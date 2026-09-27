import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import type { Company } from "../features/company/company-model";
import { findWorkspace, type FindResult } from "./navigation";

export function QuickFind({
  company,
  choose,
}: {
  company: Company;
  choose: (result: FindResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const results = findWorkspace(company, query);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    document.getElementById(`find-result-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div className="co-quick-find">
      <label className="co-find-input">
        <Search size={18} />
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="workspace-results"
          aria-activedescendant={results[active] ? `find-result-${active}` : undefined}
          aria-label="Find anything"
          placeholder="Tasks, projects, agents, or a page…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) =>
                Math.max(0, Math.min(results.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))),
              );
            }
            if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              choose(results[active]);
            }
          }}
        />
      </label>
      <p className="co-find-caption">
        {query.trim()
          ? `${results.length}${results.length === 40 ? "+" : ""} matches · refine your search to narrow them`
          : "Jump to a page or reopen a recent task"}
      </p>
      <div
        className="co-find-results"
        id="workspace-results"
        role="listbox"
        aria-label="Workspace search results"
      >
        {results.map((result, index) => (
          <div
            key={`${result.kind}:${result.id}`}
            id={`find-result-${index}`}
            role="option"
            aria-selected={active === index}
          >
            <button
              tabIndex={-1}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(result)}
            >
              <span className="co-find-kind">{result.kind}</span>
              <span>
                <strong>{result.title}</strong>
                <small>{result.detail}</small>
              </span>
              <ArrowUpRight size={14} />
            </button>
          </div>
        ))}
      </div>
      {!results.length && (
        <p className="co-find-empty">No matches. Try a name, role, office, or “MCP”.</p>
      )}
      <footer>
        ↑ ↓ to browse · Enter to open · Esc to close<span>Saved company records only</span>
      </footer>
    </div>
  );
}
