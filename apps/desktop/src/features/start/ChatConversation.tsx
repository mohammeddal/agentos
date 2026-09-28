import type { CompanyChat } from "../company/company-model";
import { useLayoutEffect, useRef, useState } from "react";
import { Archive, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { AssistantMessage } from "../../shared/AssistantMessage";
import { AttachmentList } from "../attachments/Attachments";
import { isActiveRun, useLiveRuntime } from "../engines/live-runtime";

const engineLabel = (engine: string) =>
  engine.toLowerCase() === "claude"
    ? "Claude Code"
    : engine.toLowerCase() === "codex"
      ? "Codex"
      : engine;

export function ChatConversation({
  chat,
  archive,
  remove,
}: {
  chat: CompanyChat;
  archive?: () => void;
  remove?: () => void;
}) {
  const { runs } = useLiveRuntime();
  const [copyStatus, setCopyStatus] = useState("");
  const transcript = useRef<HTMLElement>(null);
  const followsLatest = useRef(true);
  async function copyReply(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Reply copied.");
    } catch {
      setCopyStatus("Could not copy. Select the reply and copy it manually.");
    }
  }
  const matching = runs.filter((r) => r.request.key === `chat:${chat.id}`);
  const latestState = `${chat.messages.length}:${matching.map((run) => `${run.status}:${run.output.length}`).join("|")}`;
  useLayoutEffect(() => {
    if (!followsLatest.current || !transcript.current) return;
    transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [latestState]);
  return (
    <section
      ref={transcript}
      className="co-chat-conversation"
      aria-label="Conversation"
      onScroll={(event) => {
        const element = event.currentTarget;
        followsLatest.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 96;
      }}
    >
      <header>
        <span>{chat.engine}</span>
        {(archive || remove) && (
          <details className="co-chat-actions">
            <summary aria-label="Chat actions" title="Chat actions">
              <MoreHorizontal size={15} />
            </summary>
            <div>
              {archive && (
                <button type="button" onClick={archive}>
                  <Archive size={13} /> Archive chat
                </button>
              )}
              {remove && (
                <button type="button" onClick={remove}>
                  <Trash2 size={13} /> Delete chat
                </button>
              )}
            </div>
          </details>
        )}
      </header>
      {chat.messages.map((message) => {
        const run = matching.find((r) => r.request.id === message.id);
        return (
          <div className="co-chat-turn" key={message.id}>
            <article className="co-chat-user">
              <span>You</span>
              <p>{message.text}</p>
              <AttachmentList value={message.attachments || []} />
            </article>
            {run?.output && (
              <article className="co-chat-assistant">
                <header className="co-chat-answer-header">
                  <span>{engineLabel(run.engine || message.engine || chat.engine)}</span>
                  <button
                    className="co-chat-copy"
                    onClick={() => void copyReply(run.output)}
                    aria-label="Copy reply"
                  >
                    <Copy size={13} />
                    Copy
                  </button>
                </header>
                <AssistantMessage text={run.output} />
              </article>
            )}
            {run && (isActiveRun(run) || run.error) && (
              <p className="co-chat-status">
                {run.approvals.length
                  ? "Approval needed."
                  : run.error
                    ? "This run needs attention."
                    : "Working…"}
              </p>
            )}
            {run?.error && (
              <p className="co-chat-error" role="alert">
                {run.error}
              </p>
            )}
            {run && !isActiveRun(run) && !run.output && !run.error && (
              <p className="co-chat-status">The run ended without a reply.</p>
            )}
            {run && (
              <details className="co-chat-log" open={!!run.error && !run.output}>
                <summary>
                  Run log · {run.events.length} {run.events.length === 1 ? "event" : "events"}
                </summary>
                {run.events.length ? (
                  <ol>
                    {run.events.map((event, index) => (
                      <li key={index} data-kind={event.kind}>
                        <time>{new Date(event.at).toLocaleTimeString()}</time>
                        <span>{event.kind}</span>
                        <pre>{event.text}</pre>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No events were recorded for this run.</p>
                )}
              </details>
            )}
            {!run && <p className="co-chat-status">Saved prompt · No recorded reply</p>}
          </div>
        );
      })}
      {copyStatus && (
        <p className="co-chat-status" role="status">
          {copyStatus}
        </p>
      )}
    </section>
  );
}
