import { describeApproval } from "./approval-text";
import "./approval-body.css";

/** A readable approval: the question, one line of what it does, and the raw request on demand. */
export function ApprovalBody({ approval }: { approval: { title: string; detail: string } }) {
  const text = describeApproval(approval);
  return (
    <div className="ap-body">
      <strong>{text.title}</strong>
      {text.summary && (
        <p className="ap-summary" dir="auto">
          {text.summary}
        </p>
      )}
      {text.detail && text.detail !== text.summary && (
        <details>
          <summary>Details</summary>
          <pre dir="auto">{text.detail}</pre>
        </details>
      )}
    </div>
  );
}
