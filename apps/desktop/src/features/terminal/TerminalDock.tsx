import { invoke, isTauri } from "@tauri-apps/api/core";
import { Folder, Plus, Square, SquareTerminal, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  simpleCd,
  terminalDockHeight,
  visibleTerminalText,
  type TerminalSession,
} from "./terminal-model";
import "./terminal-dock.css";

export function TerminalDock({ open, close }: { open: boolean; close: () => void }) {
  const native = isTauri();
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [command, setCommand] = useState("");
  const [cwd, setCwd] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const creating = useRef(false);
  const dockRef = useRef<HTMLElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!native) return;
    try {
      const next = await invoke<TerminalSession[]>("terminal_snapshot");
      setSessions(next);
      setSelectedId((current) =>
        next.some((session) => session.id === current) ? current : next[0]?.id || "",
      );
    } catch (reason) {
      setError(String(reason));
    }
  }, [native]);

  const create = useCallback(async () => {
    if (!native || creating.current) return;
    creating.current = true;
    try {
      const session = await invoke<TerminalSession>("terminal_create", { cwd: null });
      setSelectedId(session.id);
      setSessions((current) => [...current, session]);
      setError("");
    } catch (reason) {
      setError(String(reason));
    } finally {
      creating.current = false;
    }
  }, [native]);

  useEffect(() => {
    if (!open || !native) return;
    void refresh().then(() => {
      void invoke<TerminalSession[]>("terminal_snapshot").then((current) => {
        if (!current.length) void create();
      });
    });
    const timer = window.setInterval(() => void refresh(), 300);
    return () => window.clearInterval(timer);
  }, [create, native, open, refresh]);

  const selected = sessions.find((session) => session.id === selectedId) || sessions[0];
  const latestEntry = selected?.entries[selected.entries.length - 1];
  useEffect(() => setCwd(selected?.cwd || ""), [selected?.id, selected?.cwd]);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    });
  }, [
    latestEntry?.at,
    latestEntry?.text,
    open,
    selected?.entries.length,
    selected?.id,
    selected?.status,
  ]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, selected?.id]);
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 96)}px`;
  }, [command]);

  function resize(next: number) {
    setHeight(terminalDockHeight(next, window.innerHeight));
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    const startY = event.clientY;
    const startHeight = dockRef.current?.getBoundingClientRect().height || 320;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => resize(startHeight + startY - pointer.clientY);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  async function run() {
    if (!selected || selected.status === "running" || !command.trim()) return;
    const value = command.trim();
    setCommand("");
    setHistory((current) => [...current.filter((item) => item !== value), value].slice(-100));
    setHistoryIndex(-1);
    setError("");
    try {
      const nextDirectory = simpleCd(value);
      if (nextDirectory !== null) {
        await invoke("terminal_set_cwd", {
          sessionId: selected.id,
          cwd: nextDirectory,
        });
      } else {
        await invoke("terminal_run", { sessionId: selected.id, command: value });
      }
      await refresh();
    } catch (reason) {
      setCommand(value);
      setError(String(reason));
    }
  }

  async function changeDirectory() {
    if (!selected || cwd === selected.cwd) return;
    try {
      await invoke("terminal_set_cwd", { sessionId: selected.id, cwd });
      setError("");
      await refresh();
      inputRef.current?.focus();
    } catch (reason) {
      setCwd(selected.cwd);
      setError(String(reason));
    }
  }

  async function clear() {
    if (!selected) return;
    await invoke("terminal_clear", { sessionId: selected.id });
    setError("");
    await refresh();
  }

  async function remove(id: string) {
    try {
      await invoke("terminal_remove", { sessionId: id });
      setError("");
      await refresh();
    } catch (reason) {
      setError(String(reason));
    }
  }

  if (!open) return null;
  return (
    <section
      ref={dockRef}
      className="co-terminal"
      aria-label="Local terminal"
      style={height ? { flexBasis: height } : undefined}
    >
      <div
        className="co-terminal-resize"
        role="separator"
        aria-label="Resize terminal"
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          resize(
            (dockRef.current?.getBoundingClientRect().height || 320) +
              (event.key === "ArrowUp" ? 24 : -24),
          );
        }}
      />
      <header className="co-terminal-header">
        <div className="co-terminal-title">
          <SquareTerminal size={15} />
          <strong>Terminal</strong>
        </div>
        {native && (
          <div className="co-terminal-tabs" role="tablist" aria-label="Terminal sessions">
            {sessions.map((session) => (
              <div key={session.id} className={session.id === selected?.id ? "selected" : ""}>
                <button
                  role="tab"
                  aria-selected={session.id === selected?.id}
                  onClick={() => setSelectedId(session.id)}
                >
                  <span className={`co-terminal-state is-${session.status}`} />
                  {session.title}
                </button>
                <button
                  aria-label={`Close ${session.title}`}
                  disabled={session.status === "running"}
                  onClick={() => void remove(session.id)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              className="co-terminal-new"
              aria-label="New terminal"
              onClick={() => void create()}
            >
              <Plus size={14} />
            </button>
          </div>
        )}
        <div className="co-terminal-actions">
          {native && selected && (
            <span className={`co-terminal-status is-${selected.status}`}>
              {selected.status === "running"
                ? "Running"
                : selected.exitCode === null
                  ? "Ready"
                  : `Exit ${selected.exitCode}`}
            </span>
          )}
          {native && selected && (
            <button aria-label="Clear terminal" title="Clear terminal" onClick={() => void clear()}>
              <Trash2 size={14} />
            </button>
          )}
          <button aria-label="Close terminal" title="Close terminal · Cmd/Ctrl J" onClick={close}>
            <X size={15} />
          </button>
        </div>
      </header>
      {!native ? (
        <div className="co-terminal-unavailable">
          <SquareTerminal size={28} />
          <strong>Terminal runs in the installed Mac app</strong>
          <p>The browser preview cannot execute commands or read local folders.</p>
        </div>
      ) : selected ? (
        <>
          <div className="co-terminal-cwd">
            <Folder size={13} />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void changeDirectory();
              }}
            >
              <input
                aria-label="Terminal working directory"
                value={cwd}
                disabled={selected.status === "running"}
                onChange={(event) => setCwd(event.target.value)}
                onBlur={() => void changeDirectory()}
              />
            </form>
          </div>
          <div
            className="co-terminal-console"
            ref={outputRef}
            onMouseDown={(event) => {
              if (
                event.target === event.currentTarget ||
                event.target === event.currentTarget.firstElementChild
              ) {
                event.preventDefault();
                inputRef.current?.focus();
              }
            }}
          >
            <div className="co-terminal-output" role="log" aria-live="polite">
              {selected.entries.map((entry, index) => (
                <pre key={`${entry.at}:${index}`} className={`is-${entry.stream}`}>
                  {entry.stream === "input" && <b>› </b>}
                  {visibleTerminalText(entry.text)}
                </pre>
              ))}
              {error && (
                <div className="co-terminal-error" role="alert">
                  {error}
                </div>
              )}
            </div>
            <form
              className="co-terminal-command"
              onSubmit={(event) => {
                event.preventDefault();
                void run();
              }}
            >
              <span className="co-terminal-prompt" aria-hidden="true">
                ❯
              </span>
              <textarea
                ref={inputRef}
                rows={1}
                aria-label="Terminal command"
                placeholder={selected.status === "running" ? "Command running…" : "Type a command"}
                value={command}
                disabled={selected.status === "running"}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void run();
                  } else if (event.key === "ArrowUp" && !command.includes("\n") && history.length) {
                    event.preventDefault();
                    const next =
                      historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
                    setHistoryIndex(next);
                    setCommand(history[next] || "");
                  } else if (event.key === "ArrowDown" && historyIndex >= 0) {
                    event.preventDefault();
                    const next = historyIndex + 1;
                    setHistoryIndex(next >= history.length ? -1 : next);
                    setCommand(next >= history.length ? "" : history[next] || "");
                  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
                    event.preventDefault();
                    void clear();
                  }
                }}
              />
              {selected.status === "running" && (
                <button
                  type="button"
                  className="co-terminal-stop"
                  onClick={() => void invoke("terminal_control", { sessionId: selected.id })}
                >
                  <Square size={10} fill="currentColor" /> Stop
                </button>
              )}
            </form>
          </div>
          <footer>
            <span>Local shell</span>
            <span>Enter to run · Shift+Enter for a new line · ↑↓ history · ⌘J toggle</span>
          </footer>
        </>
      ) : (
        <div className="co-terminal-unavailable">
          <strong>Opening local terminal…</strong>
        </div>
      )}
    </section>
  );
}
