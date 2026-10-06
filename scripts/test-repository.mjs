import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRepository, privatePath } from "./check-repository.mjs";

test("blocks private stores and nested authentication files", () => {
  for (const path of [
    ".env",
    "apps/desktop/.env.production",
    ".codex/auth.json",
    "config/credentials.json",
    "keys/signing.p12",
    ".agentos/runtime/runs.json",
    "project/.ssh/id_ed25519",
    ".claude/settings.local.json",
  ])
    assert.equal(privatePath(path), true, path);
});

test("blocks generated binaries and caches while allowing source and reviewed images", () => {
  for (const path of [
    "apps/desktop/src-tauri/target/debug/app",
    "node_modules/pkg/index.js",
    "output/playwright/private.png",
    "AgentOS.app/Contents/Info.plist",
  ])
    assert.equal(privatePath(path), true, path);
  for (const path of [
    ".env.example",
    ".env.local.example",
    "docs/images/agentos-home.png",
    "apps/desktop/src-tauri/Cargo.lock",
    ".github/workflows/ci.yml",
  ])
    assert.equal(privatePath(path), false, path);
});

test("rejects embedded URL credentials without printing their values", () => {
  const folder = mkdtempSync(join(tmpdir(), "agentos-guard-test-"));
  const file = join(folder, "config.json");
  const secret = "synthetic-fixture-only";
  try {
    writeFileSync(
      file,
      JSON.stringify({
        url: ["https:", "", ["demo", secret].join(":") + "@example.invalid"].join("/"),
      }),
    );
    assert.throws(
      () => checkRepository([file]),
      (error) => error.message.includes("value withheld") && !error.message.includes(secret),
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("rejects symlinks instead of reading their targets", () => {
  const folder = mkdtempSync(join(tmpdir(), "agentos-guard-test-"));
  try {
    const target = join(folder, "missing.json");
    const file = join(folder, "linked.json");
    symlinkSync(target, file);
    assert.throws(() => checkRepository([file]), /only regular source files/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
