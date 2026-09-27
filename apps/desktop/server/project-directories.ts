import { lstat, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Plugin } from "vite";

export function validProjectFolders(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 1000 && value.every(p => typeof p === "string" && /^project-[a-f0-9-]{36}(?:\/shared|\/domains\/[a-z0-9-]{1,100}(?:\/agents\/[a-z0-9-]{1,100})?)?$/.test(p)) && new Set(value.map(p => p.split("/")[0])).size === 1;
}
export function createProjectDirectoryStore(base: string) {
  const root = join(base, ".agentos", "projects");
  async function safeDirectory(parts: string[], create: boolean) {
    let path = base;
    for (const part of [".agentos", "projects", ...parts]) {
      path = join(path, part);
      if (create) await mkdir(path, { mode: 0o700 }).catch(e => { if (e.code !== "EEXIST") throw e; });
      try { const stat = await lstat(path); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("A project path is not a regular directory. Nothing was overwritten."); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return false; throw e; }
    }
    return true;
  }
  async function request(action: unknown, folders: unknown) {
    if (!["status", "create", "reveal"].includes(String(action)) || !validProjectFolders(folders) || (action === "reveal" && folders.length !== 1)) throw new Error("Invalid project folder request.");
    const existing: string[] = [];
    for (const relative of folders) if (await safeDirectory(relative.split("/"), action === "create")) existing.push(relative);
    if (action === "reveal") {
      if (existing.length !== 1) throw new Error("Create the folder before opening it.");
      if (process.platform !== "darwin") throw new Error("Open in Finder is available on macOS. Copy the path instead.");
      await promisify(execFile)("/usr/bin/open", [join(root, folders[0]!)]);
    }
    return { root, existing };
  }
  return { request };
}
export function projectDirectoriesPlugin(): Plugin {
  return { name: "agentos-project-directories", configureServer(server) {
    const store = createProjectDirectoryStore(resolve(server.config.root, "../.."));
    server.middlewares.use("/api/project-directories", async (req, res) => {
      res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
      const host = req.headers.host;
      if (!["127.0.0.1:4173", "localhost:4173"].includes(host || "") || req.headers["x-agentos-projects"] !== "1" || (req.headers.origin && req.headers.origin !== `http://${host}`)) { res.statusCode = 403; res.end('{}'); return; }
      if (req.method !== "POST" || req.headers["content-type"] !== "application/json") { res.statusCode = 405; res.end('{}'); return; }
      try {
        const chunks: Buffer[] = []; let length = 0;
        for await (const chunk of req) { const bytes = Buffer.from(chunk); length += bytes.length; if (length > 500_000) throw new Error("Project request too large."); chunks.push(bytes); }
        const body = JSON.parse(Buffer.concat(chunks).toString());
        res.end(JSON.stringify(await store.request(body.action, body.folders)));
      } catch (error) { res.statusCode = 409; res.end(JSON.stringify({ error: error instanceof Error && !('code' in error) ? error.message : "Unable to access project directories. Check folder permissions; existing files were not overwritten." })); }
    });
  } };
}
