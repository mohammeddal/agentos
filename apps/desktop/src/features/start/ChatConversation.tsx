import type { CompanyChat } from "../company/company-model";
import { useState } from "react";
import { Copy } from "lucide-react";
import { AssistantMessage } from "../../shared/AssistantMessage";
import { AttachmentList } from "../attachments/Attachments";
import { isActiveRun, useLiveRuntime } from "../engines/live-runtime";

export function ChatConversation({ chat }: { chat: CompanyChat }) {
  const { runs } = useLiveRuntime();
  const [copyStatus, setCopyStatus] = useState("");
  async function copyReply(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Reply copied.");
    } catch {
      setCopyStatus("Could not copy. Select the reply and copy it manually.");
    }
  }
  const matching = runs.filter((r) => r.request.key === `chat:${chat.id}`);
  return (
    <section className="co-chat-conversation" aria-label="Conversation">
      <header>
        <span>{chat.engine}</span>
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
                  <span>{chat.engine}</span>
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
