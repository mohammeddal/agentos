import { isTauri, invoke } from "@tauri-apps/api/core";
import type { MemoryDocument } from "./company-memory";
export type MemoryFile = {
  contents: string | null;
  path: string;
  directory: string;
  documents: MemoryDocument[];
};
export async function memoryFile(save?: {
  expected: string | null;
  contents: string;
  expectedDocuments: MemoryDocument[];
  documents: MemoryDocument[];
}): Promise<MemoryFile> {
  if (isTauri())
    return invoke<MemoryFile>(
      save ? "save_company_memory" : "read_company_memory",
      // Tauri maps these to the command's snake_case arguments; all four are required to save.
      save
        ? {
            expected: save.expected,
            contents: save.contents,
            expectedDocuments: save.expectedDocuments,
            documents: save.documents,
          }
        : {},
    );
  const response = await fetch("/api/company-memory", {
    method: save ? "PUT" : "GET",
    headers: { "X-AgentOS-Memory": "1", ...(save ? { "Content-Type": "application/json" } : {}) },
    ...(save ? { body: JSON.stringify(save) } : {}),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      body.error || "Markdown storage is unavailable. Run the local app server or the Mac app.",
    );
  }
  return response.json() as Promise<MemoryFile>;
}
