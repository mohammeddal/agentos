import Markdown from "react-markdown";
import "./assistant-message.css";
import { stripMemoryBlocks } from "../features/memory/run-learning";

/** Provider text is untrusted. No raw HTML, embedded images, or local navigation. */
export function AssistantMessage({ text }: { text: string }) {
  return (
    <div className="co-assistant-markdown">
      <Markdown
        skipHtml
        urlTransform={(url) => (/^(https?:\/\/|mailto:)/i.test(url) ? url : "")}
        components={{
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span className="co-message-image-note">
              [Image{alt ? `: ${alt}` : ""} · not loaded automatically]
            </span>
          ),
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
        }}
      >
        {stripMemoryBlocks(text)}
      </Markdown>
    </div>
  );
}
