import { mkdir, readFile, readdir, rename, unlink, writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Plugin } from "vite";

export function createMemoryStore(directory: string) {
  const path = join(directory, "company-memory.md");
  let queue = Promise.resolve();
  async function readDocuments() {
    const documents: { path: string; contents: string }[] = [];
    for (const folder of ["main", "offices", "agents"]) {
      const root = join(directory, folder);
      try {
        for (const name of await readdir(root)) {
          if (!/^[A-Za-z0-9_-]+\.md$/.test(name)) continue;
          const filePath = join(root, name);
          const stat = await lstat(filePath);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 200_000)
            throw new Error("Memory document is unsafe or too large.");
          documents.push({ path: `${folder}/${name}`, contents: await readFile(filePath, "utf8") });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const indexPath = join(directory, "MEMORY.md");
    try {
      const stat = await lstat(indexPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 200_000)
        throw new Error("Memory index is unsafe or too large.");
      documents.unshift({ path: "MEMORY.md", contents: await readFile(indexPath, "utf8") });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return documents;
  }
  async function read() {
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000)
        throw new Error("Memory file is unsafe or too large.");
      return { contents: await readFile(path, "utf8"), path };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { contents: null, path, directory, documents: await readDocuments() };
      throw error;
    }
  }
  async function snapshot() {
    const base = await read();
    return { ...base, directory, documents: await readDocuments() };
  }
  function save(
    expected: string | null,
    contents: string,
    expectedDocuments: { path: string; contents: string }[] = [],
    documents: { path: string; contents: string }[] = [],
  ) {
    const operation = queue.then(async () => {
      if (
        typeof contents !== "string" ||
        Buffer.byteLength(contents) > 2_000_000 ||
        !contents.startsWith("# AgentOS company memory\n")
      )
        throw new Error("Invalid or oversized memory document.");
      if ((await read()).contents !== expected)
        throw new Error(
          "Memory changed on disk. Reload before saving; your changes were not written.",
        );
      const currentDocuments = await readDocuments();
      if (JSON.stringify(currentDocuments) !== JSON.stringify(expectedDocuments))
        throw new Error("A Markdown memory file changed on disk. Reload before saving.");
      if (documents.length > 501) throw new Error("Too many memory documents.");
      for (const document of documents) {
        if (
          !(
            document.path === "MEMORY.md" ||
            /^(main|offices|agents)\/[A-Za-z0-9_-]+\.md$/.test(document.path)
          ) ||
          typeof document.contents !== "string" ||
          Buffer.byteLength(document.contents) > 200_000
        )
          throw new Error("Invalid memory document.");
        if (
          document.path === "MEMORY.md"
            ? !document.contents.startsWith("# AgentOS memory\n")
            : !document.contents.startsWith("<!-- agentos-memory-entry-v1\n")
        )
          throw new Error("Unrecognized memory document.");
      }
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if ((await lstat(directory)).isSymbolicLink())
        throw new Error("Memory directory must not be a symbolic link.");
      const temp = join(directory, `.memory-${randomUUID()}.tmp`);
      await writeFile(temp, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
      // Preserve the previous revision so a user can recover an accidental edit.
      if (expected !== null) {
        const backup = join(directory, `.previous-${randomUUID()}.tmp`);
        await writeFile(backup, expected, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await rename(backup, join(directory, "company-memory.previous.md"));
      }
      await rename(temp, path);
      for (const document of documents) {
        const destination = join(directory, document.path);
        await mkdir(join(destination, ".."), { recursive: true, mode: 0o700 });
        const documentTemp = join(directory, `.document-${randomUUID()}.tmp`);
        await writeFile(documentTemp, document.contents, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
        await rename(documentTemp, destination);
      }
      const retained = new Set(documents.map((document) => document.path));
      for (const previous of currentDocuments) {
        if (previous.path !== "MEMORY.md" && !retained.has(previous.path))
          await unlink(join(directory, previous.path));
      }
      return snapshot();
    });
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
  return { read: snapshot, save };
}

export function companyMemoryPlugin(): Plugin {
  return {
    name: "agentos-company-memory",
    configureServer(server) {
      const store = createMemoryStore(join(server.config.root, "../../.agentos/memory"));
      server.middlewares.use("/api/company-memory", async (req, res) => {
        const host = req.headers.host;
        if (
          !["127.0.0.1:4173", "localhost:4173"].includes(host || "") ||
          req.headers["x-agentos-memory"] !== "1" ||
          (req.headers.origin && req.headers.origin !== `http://${host}`)
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        try {
          if (req.method === "GET") {
            res.end(JSON.stringify(await store.read()));
            return;
          }
          if (req.method !== "PUT" || req.headers["content-type"] !== "application/json") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Unsupported method." }));
            return;
          }
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of req) {
            const buffer = Buffer.from(chunk);
            length += buffer.length;
            if (length > 4_100_000) throw new Error("Memory request too large.");
            chunks.push(buffer);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString()) as {
            expected: unknown;
            contents: unknown;
            expectedDocuments: unknown;
            documents: unknown;
          };
          if (
            (body.expected !== null && typeof body.expected !== "string") ||
            typeof body.contents !== "string" ||
            !Array.isArray(body.expectedDocuments) ||
            !Array.isArray(body.documents)
          )
            throw new Error("Invalid save request.");
          res.end(
            JSON.stringify(
              await store.save(
                body.expected,
                body.contents,
                body.expectedDocuments as { path: string; contents: string }[],
                body.documents as { path: string; contents: string }[],
              ),
            ),
          );
        } catch (error) {
          res.statusCode = 409;
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "Memory storage failed.",
            }),
          );
        }
      });
    },
  };
}
