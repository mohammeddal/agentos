import { describe, expect, it } from "vitest";
import type { Company, CompanyTask, Office } from "./company-model";
import { MAP, mapLayout } from "./company-map-layout";

const agent = (id: string) => ({ id, name: id, role: "", engine: "Codex" });
const office = (id: string, agents: number): Office => ({
  id,
  name: id,
  domain: id,
  color: "sage",
  agents: Array.from({ length: agents }, (_, i) => agent(`${id}-${i}`)),
});
const task = (id: string) => ({ id }) as CompanyTask;
const company = (offices: Office[]) => ({ offices }) as unknown as Company;
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe("company map layout", () => {
  it("puts rooms two to a row with equal heights and an Add office slot beside an odd room", () => {
    const layout = mapLayout(company([office("a", 5), office("b", 1), office("c", 0)]), () => []);
    expect(layout.rooms.map((r) => [r.x, r.y])).toEqual([
      [MAP.margin, MAP.margin],
      [MAP.margin + MAP.room + MAP.gap, MAP.margin],
      [MAP.margin, expect.any(Number)],
    ]);
    expect(layout.rooms[0]!.height).toBe(layout.rooms[1]!.height);
    expect(layout.addOffice.x).toBe(layout.rooms[1]!.x);
    expect(layout.addOffice.y).toBe(layout.rooms[2]!.y);
    expect(layout.rooms[2]!.empty).not.toBeNull();
  });

  it("places workflows above desks and keeps everything inside its room without overlap", () => {
    const flows = [task("w1"), task("w2"), task("w3"), task("w4")];
    const [room] = mapLayout(company([office("a", 4)]), () => flows).rooms;
    const items = [...room!.flows, ...room!.desks];
    expect(Math.max(...room!.flows.map((f) => f.y))).toBeLessThan(
      Math.min(...room!.desks.map((d) => d.y)),
    );
    for (const item of items) {
      expect(item.x + item.width).toBeLessThanOrEqual(room!.width);
      expect(item.y + item.height).toBeLessThanOrEqual(room!.height);
    }
    items.forEach((a, i) => items.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)));
  });

  it("draws a hallway between the columns inside the building", () => {
    const layout = mapLayout(company([office("a", 1), office("b", 1)]), () => []);
    expect(layout.hallway.x).toBe(MAP.margin + MAP.room);
    expect(layout.hallway.width).toBe(MAP.gap);
    expect(layout.building.y + layout.building.height).toBeGreaterThan(
      layout.addOffice.y + layout.addOffice.height,
    );
  });

  it("offers a first office when the company is empty", () => {
    const layout = mapLayout(company([]), () => []);
    expect(layout.rooms).toEqual([]);
    expect(layout.addOffice).toMatchObject({ x: MAP.margin, y: MAP.margin });
  });
});
