import { invoke, isTauri } from "@tauri-apps/api/core";
import { type Attachment } from "./attachment-model";
export type AttachmentPreview = { dataUrl?: string; text?: string };
function dataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("agentos-attachments", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Attachment storage is unavailable."));
  });
}
async function localFile(id: string, file?: File): Promise<File> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", file ? "readwrite" : "readonly");
    const request = file ? tx.objectStore("files").put(file, id) : tx.objectStore("files").get(id);
    let result: File | undefined;
    request.onsuccess = () => {
      result = file || request.result;
    };
    tx.oncomplete = () => {
      db.close();
      result ? resolve(result) : reject(new Error("Attachment is missing. Attach it again."));
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("Could not store this attachment."));
    };
    tx.onabort = tx.onerror;
  });
}
export async function saveAttachment(file: File): Promise<Attachment> {
  const id = crypto.randomUUID();
  if (isTauri()) {
    const url = await dataUrl(file);
    return invoke<Attachment>("save_attachment", {
      id,
      name: file.name,
      data: url.slice(url.indexOf(",") + 1),
    });
  }
  // Preview storage is separate from the native app; never pretend it can execute.
  let kind: Attachment["kind"] = "text";
  if (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) kind = "image";
  else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name))
    throw new Error("PDF text extraction is available in the installed Mac app.");
  else {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (text.includes("\0") || file.size > 100_000)
      throw new Error("Use a UTF-8 text/code file up to 100 KB.");
  }
  await localFile(id, file);
  return {
    id,
    name: file.name,
    size: file.size,
    kind,
    mime: kind === "image" ? file.type : "text/plain",
  };
}
export async function previewAttachment(a: Attachment): Promise<AttachmentPreview> {
  if (isTauri()) return invoke("attachment_preview", { id: a.id });
  const file = await localFile(a.id);
  return a.kind === "image" ? { dataUrl: await dataUrl(file) } : { text: await file.text() };
}
