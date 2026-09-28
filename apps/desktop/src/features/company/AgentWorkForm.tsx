import { useState } from "react";
import { Play } from "lucide-react";
import type { CompanyAgent } from "./company-model";

/** Hand one agent a piece of work straight from the map. */
export function AgentWorkForm({
  agent,
  assignWork,
}: {
  agent: CompanyAgent;
  assignWork: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await assignWork(text.trim());
      setText("");
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="map-give-work"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <span>Give {agent.name} work</span>
      <textarea
        rows={3}
        maxLength={3000}
        value={text}
        aria-label={`Work for ${agent.name}`}
        placeholder="Describe the task and what done looks like…"
        onChange={(event) => setText(event.target.value)}
      />
      <button className="co-button co-button-primary" disabled={!text.trim() || busy}>
        <Play size={13} /> {busy ? "Starting…" : "Start"}
      </button>
      {error && (
        <p className="map-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
