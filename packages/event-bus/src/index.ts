import type { StaffForgeEvent } from "@staffforge/schemas";

export type EventHandler = (event: StaffForgeEvent) => void | Promise<void>;

export interface EventStore {
  append(event: StaffForgeEvent): Promise<void>;
  list(sessionId: string): Promise<StaffForgeEvent[]>;
}

export class InMemoryEventStore implements EventStore {
  private events: StaffForgeEvent[] = [];
  async append(event: StaffForgeEvent) { this.events.push(event); }
  async list(sessionId: string) { return this.events.filter((event) => event.sessionId === sessionId); }
}

export class EventBus {
  private handlers = new Set<EventHandler>();
  constructor(private readonly store: EventStore = new InMemoryEventStore()) {}

  subscribe(handler: EventHandler) {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  async publish(event: StaffForgeEvent) {
    await this.store.append(event);
    await Promise.allSettled([...this.handlers].map((handler) => handler(event)));
  }

  history(sessionId: string) { return this.store.list(sessionId); }
}
