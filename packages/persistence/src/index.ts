import type { EventStore } from "@staffforge/event-bus";
import type { StaffForgeEvent } from "@staffforge/schemas";

export interface MemoryRecord {
  id: string; scope: string; kind: "workspace-fact" | "decision" | "incident-lesson" | "workflow-history" | "artifact" | "preference";
  value: string; source: string; confidence: number; provenance: string; createdAt: string;
}

export interface MemoryRepository {
  remember(record: MemoryRecord): Promise<void>;
  list(scope: string): Promise<MemoryRecord[]>;
  forget(id: string): Promise<void>;
}

export class MemoryRepositoryImpl implements MemoryRepository {
  private records = new Map<string, MemoryRecord>();
  async remember(record: MemoryRecord) { this.records.set(record.id, record); }
  async list(scope: string) { return [...this.records.values()].filter((record) => record.scope === scope); }
  async forget(id: string) { this.records.delete(id); }
}

export class SqliteEventStore implements EventStore {
  private db: import("node:sqlite").DatabaseSync | undefined;
  constructor(private readonly filename: string) {}

  private async database() {
    if (!this.db) {
      const { DatabaseSync } = await import("node:sqlite");
      this.db = new DatabaseSync(this.filename);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          body TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS events_session_time ON events(session_id, timestamp);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));
      `);
    }
    return this.db;
  }

  async append(event: StaffForgeEvent) {
    const db = await this.database();
    db.prepare("INSERT INTO events(id, session_id, type, timestamp, body) VALUES (?, ?, ?, ?, ?)")
      .run(event.id, event.sessionId, event.type, event.timestamp, JSON.stringify(event));
  }

  async list(sessionId: string) {
    const db = await this.database();
    const rows = db.prepare("SELECT body FROM events WHERE session_id = ? ORDER BY timestamp, rowid").all(sessionId) as Array<{ body: string }>;
    return rows.map((row) => JSON.parse(row.body) as StaffForgeEvent);
  }
}
