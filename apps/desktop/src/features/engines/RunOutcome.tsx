import { useState } from "react";
import { CheckCircle2, CircleSlash, FileText, FolderOpen, XCircle } from "lucide-react";
import { isActiveRun, revealRun, type LiveRun } from "./live-runtime";
import "./run-outcome.css";

const duration = (run: LiveRun) => {
  const seconds = Math.max(1, Math.round((run.updatedAt - run.createdAt) / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
};

/**
 * What a finished run produced: its outcome, the files it touched, and where they live.
 * Files are detected by modification time in the run's folder, so edits made by other tools
 * in the same folder during the run can appear too.
 */
export function RunOutcome({ run }: { run: LiveRun }) {
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (isActiveRun(run)) return null;
  const files = run.files || [];
  const shown = showAll ? files : files.slice(0, 6);
  const steps = run.results.filter((result) => result.status === "completed").length;
  async function reveal(file?: string) {
    setError("");
    try {
      await revealRun(run.request.id, file);
    } catch (cause) {
      setError(String(cause).replace(/^Error: /, ""));
    }
  }
  const Icon =
    run.status === "completed" ? CheckCircle2 : run.status === "failed" ? XCircle : CircleSlash;
  return (
    <section className="run-outcome" data-status={run.status} aria-label="Run outcome">
      <header>
        <Icon size={15} />
        <strong>
          {run.status === "completed"
            ? "Finished"
            : run.status === "failed"
              ? "Failed"
              : run.status === "canceled"
                ? "Stopped"
                : run.status}
        </strong>
        <small>
          {duration(run)}
          {run.results.length > 1 ? ` · ${steps}/${run.results.length} steps done` : ""}
          {` · ${files.length ? `${files.length} ${files.length === 1 ? "file" : "files"} changed` : "no file changes"}`}
        </small>
      </header>
      {files.length > 0 && (
        <ul>
          {shown.map((file) => (
            <li key={file}>
              <button type="button" title="Show in Finder" onClick={() => void reveal(file)}>
                <FileText size={12} />
                <span>{file}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > shown.length && (
        <button type="button" className="run-outcome-more" onClick={() => setShowAll(true)}>
          Show all {files.length} files
        </button>
      )}
      <footer>
        <code title={run.cwd}>{run.cwd}</code>
        <button type="button" className="co-button" onClick={() => void reveal()}>
          <FolderOpen size={13} />
          Open folder
        </button>
      </footer>
      {error && <p className="run-outcome-error">{error}</p>}
    </section>
  );
}
