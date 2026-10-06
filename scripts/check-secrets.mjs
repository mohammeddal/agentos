import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkRepository } from "./check-repository.mjs";

// Scan only files eligible for publication, never personal provider stores or caches.
const executable = process.env.GITLEAKS_BIN || "gitleaks";
function scan(args) {
  const result = spawnSync(executable, args, { stdio: "inherit" });
  if (result.error)
    throw new Error("Install Gitleaks 8.30.1 or set GITLEAKS_BIN to its executable.");
  if (result.status !== 0)
    throw new Error("Secret scan failed. Review redacted findings locally before publishing.");
}

let snapshot;
try {
  const files = checkRepository();
  scan(["git", ".", "--log-opts=--all", "--redact", "--no-banner", "--ignore-gitleaks-allow"]);
  snapshot = mkdtempSync(join(tmpdir(), "agentos-publication-"));
  for (const file of files) {
    if (!existsSync(file)) continue;
    const destination = join(snapshot, file);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(file, destination);
  }
  scan(["dir", snapshot, "--redact", "--no-banner", "--ignore-gitleaks-allow"]);
  console.log("Secret scans passed for Git history and current publishable files.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (snapshot) rmSync(snapshot, { recursive: true, force: true });
}
