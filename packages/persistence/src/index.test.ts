import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { createEvent } from "@staffforge/schemas";
import { SqliteEventStore } from "./index.js";

const filename = `/tmp/staffforge-test-${process.pid}.db`;
afterEach(async () => { await Promise.allSettled([rm(filename), rm(`${filename}-shm`), rm(`${filename}-wal`)]); });

describe("SqliteEventStore", () => {
  it("persists and replays normalized events", async () => {
    const store = new SqliteEventStore(filename);
    const event = createEvent({ type: "session.created", sessionId: "session-1", workspaceId: "workspace-1", correlationId: "session-1", actor: { kind: "system", id: "test" }, payload: { objective: "test" } });
    await store.append(event);
    expect(await store.list("session-1")).toEqual([event]);
  });
});
