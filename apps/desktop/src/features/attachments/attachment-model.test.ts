import { describe, expect, it } from "vitest";
import {
  attachmentError,
  validAttachments,
  MAX_FILE_BYTES,
  type Attachment,
} from "./attachment-model";
import { emptyPrompt, parsePromptDraft, taskFromPrompt } from "../start/prompt-composer";
import { starterCompany, isCompanyChat, isCompanyTask } from "../company/company-model";
const file: Attachment = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "notes.md",
  size: 12,
  kind: "text",
  mime: "text/plain",
};
describe("attachment metadata and drafts", () => {
  it("retains immutable references through drafts and task conversion", () => {
    const draft = {
      ...emptyPrompt,
      text: "Review this",
      target: "a:data-engineer",
      attachments: [file],
    };
    expect(parsePromptDraft(JSON.stringify(draft)).attachments).toEqual([file]);
    const task = taskFromPrompt(starterCompany, draft, "test", new Date().toISOString());
    expect(task.attachments).toEqual([file]);
    expect(isCompanyTask(task)).toBe(true);
  });
  it("validates old chats and attachment references without binary content in localStorage", () => {
    const chat = {
      id: "chat",
      engine: "Codex",
      createdAt: new Date().toISOString(),
      messages: [
        { id: "m", text: "Read this", createdAt: new Date().toISOString(), attachments: [file] },
      ],
    };
    expect(isCompanyChat(chat)).toBe(true);
    expect(
      isCompanyChat({
        ...chat,
        messages: [{ ...chat.messages[0], attachments: [{ ...file, id: "../../secret" }] }],
      }),
    ).toBe(false);
    expect(validAttachments([file, file])).toBe(false);
    expect(() =>
      parsePromptDraft(JSON.stringify({ ...emptyPrompt, attachments: [null] })),
    ).toThrow();
  });
  it("rejects empty, oversized, too many and unsupported files before reading", () => {
    expect(attachmentError({ name: "empty", size: 0 }, [])).toContain("empty");
    expect(attachmentError({ name: "big", size: MAX_FILE_BYTES + 1 }, [])).toContain("5 MB");
    expect(attachmentError(file, Array(8).fill(file))).toContain("8 files");
    expect(attachmentError({ name: "report.docx", size: 10 }, [])).toContain("Export");
    expect(attachmentError({ name: "notes.txt", size: 10 }, [])).toBeNull();
    expect(
      attachmentError({ name: "next", size: 1 }, Array(4).fill({ ...file, size: MAX_FILE_BYTES })),
    ).toContain("20 MB");
  });
});
