export type Attachment = {
  id: string;
  name: string;
  size: number;
  kind: "image" | "text" | "pdf";
  mime: string;
};
export const MAX_FILES = 8;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export function validAttachments(value: unknown): value is Attachment[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_FILES &&
    value.every(
      (a) =>
        a &&
        typeof a.id === "string" &&
        /^[a-f\d-]{36}$/i.test(a.id) &&
        typeof a.name === "string" &&
        a.name.length > 0 &&
        a.name.length <= 255 &&
        typeof a.mime === "string" &&
        ["image", "text", "pdf"].includes(a.kind) &&
        Number.isSafeInteger(a.size) &&
        a.size > 0 &&
        a.size <= MAX_FILE_BYTES,
    ) &&
    new Set(value.map((a) => a.id)).size === value.length &&
    value.reduce((sum, a) => sum + a.size, 0) <= MAX_TOTAL_BYTES
  );
}
export function attachmentError(
  file: { name: string; size: number },
  current: Attachment[],
): string | null {
  if (current.length >= MAX_FILES) return "Attach up to 8 files at a time.";
  if (!file.size) return "This file is empty or is a folder. Choose individual files.";
  if (file.size > MAX_FILE_BYTES) return "Each file must be 5 MB or smaller.";
  if (current.reduce((sum, a) => sum + a.size, 0) + file.size > MAX_TOTAL_BYTES)
    return "Attachments must total 20 MB or less.";
  if (/\.(docx?|xlsx?|pptx?|zip|exe|dmg|heic|mov|mp4|mp3|wav)$/i.test(file.name))
    return "Export this file as PDF, PNG/JPEG, or UTF-8 text before attaching it.";
  return null;
}
export function fileSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
