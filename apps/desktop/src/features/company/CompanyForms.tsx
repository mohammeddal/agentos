import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Check, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  domainTemplates,
  officeColors,
  type AgentSkillReference,
  type CompanyAgent,
  type Office,
} from "./company-model";
import { discoverEngine, type Capability, type Engine } from "../engines/engine-inventory";
import { HelpTip } from "../../shared/HelpTip";
export function DomainForm({ domains, save }: { domains: string[]; save: (name: string) => void }) {
  const [name, setName] = useState("");
  const duplicate = domains.some((d) => d.toLowerCase() === name.trim().toLowerCase());
  return (
    <form
      className="co-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && !duplicate) save(name.trim());
      }}
    >
      <label>
        Domain name
        <input
          required
          autoFocus
          maxLength={48}
          placeholder="e.g. Customer Success"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={duplicate}
          aria-describedby={duplicate ? "domain-name-error" : undefined}
        />
      </label>
      {duplicate && (
        <p className="co-form-error" id="domain-name-error" role="alert">
          This domain already exists. Choose a different name.
        </p>
      )}
      <button className="co-button co-button-primary" disabled={!name.trim() || duplicate}>
        Create domain
        <ArrowRight size={15} />
      </button>
    </form>
  );
}

export function OfficeForm({
  existing,
  domains,
  initialDomain,
  save,
  remove,
}: {
  existing: Office | undefined;
  domains: string[];
  initialDomain: string | undefined;
  save: (office: Office) => void;
  remove?: (() => void) | undefined;
}) {
  const [name, setName] = useState(existing?.name || "");
  const [domain, setDomain] = useState(existing?.domain || initialDomain || "Data & Analytics");
  const [color, setColor] = useState(existing?.color || "sage");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    save({
      id: existing?.id || crypto.randomUUID(),
      name: name.trim(),
      domain,
      color,
      agents: existing?.agents || [],
    });
  };
  return (
    <form className="co-form" onSubmit={submit}>
      <label>
        Office name
        <input
          autoFocus
          required
          maxLength={48}
          placeholder="e.g. Growth studio"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Domain
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          {domains.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Office color</legend>
        <div className="co-color-options">
          {officeColors.map((c) => (
            <button
              type="button"
              key={c}
              className={`tone-${c} ${color === c ? "chosen" : ""}`}
              aria-label={`${c} color`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            >
              {color === c && <Check size={15} />}
            </button>
          ))}
        </div>
      </fieldset>
      {existing && (
        <div className="co-form-note">
          {existing.agents.length} agents will stay in this office.
        </div>
      )}
      <button className="co-button co-button-primary" type="submit" disabled={!name.trim()}>
        {existing ? "Save office" : "Create office"}
        <ArrowRight size={15} />
      </button>
      {existing && remove && (
        <button className="co-button co-button-danger" type="button" onClick={remove}>
          <Trash2 size={14} />
          Delete office
        </button>
      )}
    </form>
  );
}
export function AgentForm({
  offices,
  officeId,
  existing,
  save,
  remove,
}: {
  offices: Office[];
  officeId: string;
  existing: CompanyAgent | undefined;
  save: (officeId: string, agent: CompanyAgent) => void;
  remove?: (() => void) | undefined;
}) {
  const [office, setOffice] = useState(officeId);
  const [name, setName] = useState(existing?.name || "");
  const [role, setRole] = useState(existing?.role || "");
  const [engine, setEngine] = useState(existing?.engine || "Codex");
  const [prompt, setPrompt] = useState(existing?.prompt || "");
  const [skills, setSkills] = useState<AgentSkillReference[]>(existing?.skills || []);
  const [inventory, setInventory] = useState<Capability[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillError, setSkillError] = useState("");
  const [skillNotice, setSkillNotice] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const domain = offices.find((o) => o.id === office)?.domain || "Custom";
  const inventoryEngine: Engine | null =
    engine === "Codex" ? "codex" : engine === "Claude Code" ? "claude" : null;
  async function refreshSkills(target: Engine) {
    setDiscovering(true);
    setSkillError("");
    try {
      const result = await discoverEngine(target);
      setInventory(result.entries.filter((entry) => entry.kind === "skill"));
    } catch (error) {
      setInventory([]);
      setSkillError(error instanceof Error ? error.message : "Skill discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }
  useEffect(() => {
    let active = true;
    if (!inventoryEngine) {
      setInventory([]);
      setSkillError("");
      setDiscovering(false);
      return;
    }
    setDiscovering(true);
    setSkillError("");
    void discoverEngine(inventoryEngine)
      .then((result) => {
        if (active) setInventory(result.entries.filter((entry) => entry.kind === "skill"));
      })
      .catch((error) => {
        if (active)
          setSkillError(error instanceof Error ? error.message : "Skill discovery failed.");
      })
      .finally(() => {
        if (active) setDiscovering(false);
      });
    return () => {
      active = false;
    };
  }, [inventoryEngine]);
  const availableSkills = inventory.filter((skill) =>
    `${skill.name} ${skill.description} ${skill.scope}`
      .toLowerCase()
      .includes(skillQuery.toLowerCase()),
  );
  function toggleSkill(skill: Capability) {
    if (
      !inventoryEngine ||
      inventoryEngine === "gemini" ||
      ["disabled", "cached"].includes(skill.status)
    )
      return;
    const selectedEngine: AgentSkillReference["engine"] = inventoryEngine;
    setSkills((current) =>
      current.some((item) => item.id === skill.id)
        ? current.filter((item) => item.id !== skill.id)
        : current.length >= 24
          ? current
          : [
              ...current,
              {
                id: skill.id,
                name: skill.name,
                engine: selectedEngine,
                source: skill.source,
                scope: skill.scope,
              },
            ],
    );
  }
  return (
    <form
      className="co-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && role.trim())
          save(office, {
            id: existing?.id || crypto.randomUUID(),
            name: name.trim(),
            role: role.trim(),
            engine,
            ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
            ...(skills.length ? { skills } : {}),
          });
      }}
    >
      <label>
        Office
        <select value={office} onChange={(e) => setOffice(e.target.value)}>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      {!existing && (
        <div className="co-suggestions">
          <span>START WITH A ROLE</span>
          <div>
            {(
              (Object.hasOwn(domainTemplates, domain)
                ? domainTemplates[domain]
                : domainTemplates.Custom) || []
            ).map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => {
                  setName(r);
                  setRole(r);
                }}
              >
                {r}
                <Plus size={11} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="co-form-pair">
        <label>
          Agent name
          <input
            required
            maxLength={48}
            placeholder="e.g. Research Analyst"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Preferred engine
          <select
            value={engine}
            onChange={(e) => {
              const next = e.target.value;
              setEngine(next);
              setSkillQuery("");
              if (skills.length) {
                setSkills([]);
                setSkillNotice("Skill selection was cleared because skills belong to an engine.");
              }
            }}
          >
            {["Codex", "Claude Code", "Gemini", "Choose later"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Responsibility
        <input
          required
          maxLength={100}
          placeholder="What should this agent be responsible for?"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
      </label>
      <section className="co-agent-instructions" aria-labelledby="agent-instructions-title">
        <div className="co-agent-form-heading">
          <strong id="agent-instructions-title">Instructions & skills</strong>
          <HelpTip label="About agent instructions" align="end">
            These instructions and selected skills are requested whenever this agent performs or
            reviews a task.
          </HelpTip>
        </div>
        <label>
          Custom agent prompt <span className="co-optional">optional</span>
          <textarea
            maxLength={6000}
            rows={5}
            placeholder="How should this agent work? Add its process, standards, tone, and boundaries."
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <small>{prompt.length.toLocaleString()} / 6,000 characters</small>
        </label>
        <div className="co-skill-picker">
          <div className="co-skill-picker-heading">
            <div className="co-heading-with-help">
              <strong>Existing skills</strong>
              <HelpTip label="About existing skills">
                Skills are discovered from {inventoryEngine === "claude" ? "Claude Code" : "Codex"}
                on this Mac. Selection requests them at runtime; AgentOS does not install, copy, or
                enable them.
              </HelpTip>
            </div>
            {inventoryEngine && (
              <button
                className="co-button"
                type="button"
                disabled={discovering}
                onClick={() => void refreshSkills(inventoryEngine)}
              >
                <RefreshCw size={13} /> {discovering ? "Scanning…" : "Refresh"}
              </button>
            )}
          </div>
          {skills.length > 0 && (
            <div className="co-selected-skills" aria-label="Selected skills">
              {skills.map((skill) => (
                <span key={skill.id}>
                  <BookOpen size={12} />
                  {skill.name}
                  <small>{skill.scope}</small>
                  <button
                    type="button"
                    aria-label={`Remove ${skill.name} skill`}
                    onClick={() =>
                      setSkills((current) => current.filter((item) => item.id !== skill.id))
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {inventoryEngine ? (
            <>
              <input
                aria-label="Search existing skills"
                placeholder="Search skills…"
                value={skillQuery}
                onChange={(event) => setSkillQuery(event.target.value)}
              />
              {skillError ? (
                <p className="co-form-error" role="alert">
                  {skillError} Try Refresh or check Library → Engine capabilities.
                </p>
              ) : discovering ? (
                <p role="status">Discovering local skills…</p>
              ) : availableSkills.length ? (
                <div className="co-skill-options">
                  {availableSkills.slice(0, 40).map((skill) => {
                    const selected = skills.some((item) => item.id === skill.id);
                    const unavailable = ["disabled", "cached"].includes(skill.status);
                    return (
                      <label key={skill.id} className={unavailable ? "is-unavailable" : ""}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={unavailable || (!selected && skills.length >= 24)}
                          onChange={() => toggleSkill(skill)}
                        />
                        <span>
                          <strong>{skill.name}</strong>
                          <small>
                            {skill.description || `${skill.scope} skill`} · {skill.scope}
                            {unavailable
                              ? ` · ${skill.status === "disabled" ? "disabled" : "cached, not verified"}`
                              : ""}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p>No matching local skills were found for this engine.</p>
              )}
            </>
          ) : (
            <p>Choose Codex or Claude Code to discover its local skills.</p>
          )}
          {skillNotice && <p role="status">{skillNotice}</p>}
        </div>
      </section>
      <button
        className="co-button co-button-primary"
        type="submit"
        disabled={!name.trim() || !role.trim()}
      >
        {existing ? "Save agent" : "Add to office"}
        <ArrowRight size={15} />
      </button>
      {existing && remove && (
        <button className="co-button co-button-danger" type="button" onClick={remove}>
          <Trash2 size={14} />
          Delete agent
        </button>
      )}
    </form>
  );
}
export function RenameForm({
  name: initial,
  save,
}: {
  name: string;
  save: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="co-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) save(name.trim());
      }}
    >
      <label>
        Company name
        <input
          autoFocus
          required
          maxLength={48}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit" className="co-button co-button-primary" disabled={!name.trim()}>
        Save name
        <Check size={15} />
      </button>
    </form>
  );
}
