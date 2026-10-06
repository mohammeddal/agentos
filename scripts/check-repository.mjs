import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function publicationFiles() {
  return [
    ...new Set(
      execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
        maxBuffer: 16 * 1024 * 1024,
      })
        .toString()
        .split("\0")
        .filter(Boolean),
    ),
  ];
}

export function privatePath(file) {
  const segments = file.split("/");
  const base = segments.at(-1);
  if (
    segments.some((part) =>
      [
        ".agentos",
        ".staffforge",
        ".codex",
        ".aws",
        ".ssh",
        ".pnpm-store",
        ".playwright-cli",
        "node_modules",
        "target",
        "dist",
        "dist-types",
        "coverage",
      ].includes(part),
    ) ||
    file.startsWith("output/") ||
    file.startsWith("apps/desktop/src-tauri/gen/")
  )
    return true;
  if (/^\.env(?:\.|$)/.test(base) && !base.endsWith(".example")) return true;
  return (
    /^(?:auth\.json|credentials\.json|\.npmrc|\.netrc|settings\.local\.json|id_rsa.*|id_ed25519.*|\.DS_Store)$/.test(
      base,
    ) ||
    /\.(?:pem|key|p12|pfx|keystore|db|db-shm|db-wal|log|dmg|tsbuildinfo)$/.test(base) ||
    segments.some((part) => part.endsWith(".app"))
  );
}

export function checkRepository(files = publicationFiles()) {
  const errors = [];
  for (const file of files) {
    if (privatePath(file)) errors.push(`${file}: private or generated path`);
    let stat;
    try {
      stat = lstatSync(file);
    } catch (error) {
      if (error.code === "ENOENT") continue; // An unstaged deletion is not published.
      throw error;
    }
    if (!stat.isFile()) {
      errors.push(`${file}: only regular source files may be published`);
      continue;
    }
    if (stat.size > 5 * 1024 * 1024) errors.push(`${file}: exceeds the 5 MB source asset limit`);
    if (/\.(?:md|tsx?|jsx?|mjs|json|ya?ml|toml|rs)$/.test(file)) {
      const content = readFileSync(file, "utf8");
      if (/https?:\/\/[^\s/]+:[^\s/@]+@/.test(content)) {
        errors.push(`${file}: URL may contain embedded credentials (value withheld)`);
      }
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Repository guard passed: ${files.length} publishable paths checked.`);
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    checkRepository();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
