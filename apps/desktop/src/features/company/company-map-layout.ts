import type { Company, CompanyTask, Office } from "./company-model";

/**
 * World-space layout for the company floor plan, drawn like an architect's plan: a building with
 * two columns of offices either side of a central hallway and an entrance at the bottom.
 * Pure, so it can be tested without rendering.
 */
export const MAP = {
  width: 1060,
  /** Inset from the building's outer wall to the rooms. */
  margin: 40,
  /** Hallway width between the two columns of rooms. */
  gap: 56,
  rowGap: 28,
  room: 462,
  /** Clearance kept free on the hallway side, where the door swings in. */
  door: 30,
  pad: 16,
  header: 80,
  /** Workflows are round meeting tables with their team's chairs around them. */
  flow: { width: 130, height: 118, gap: 5, row: 122 },
  flowColumns: 3,
  desk: { width: 124, height: 152, gap: 14 },
  vacantHeight: 190,
  wall: 20,
};

export type Box = { x: number; y: number; width: number; height: number };
export type Placed = Box & { id: string };
export type RoomLayout = Box & {
  office: Office;
  number: number;
  column: 0 | 1;
  flows: Placed[];
  desks: Placed[];
  empty: Box | null;
};
export type MapLayout = {
  rooms: RoomLayout[];
  /** Unbuilt space where the next office can go. */
  addOffice: Box;
  hallway: Box;
  building: Box;
  height: number;
};

function grid(
  ids: string[],
  columns: number,
  x: number,
  y: number,
  size: { width: number; height: number; gap: number },
  rowStep: number,
): Placed[] {
  return ids.map((id, index) => ({
    id,
    x: x + (index % columns) * (size.width + size.gap),
    y: y + Math.floor(index / columns) * rowStep,
    width: size.width,
    height: size.height,
  }));
}

function roomInterior(office: Office, flows: CompanyTask[], column: 0 | 1) {
  const x = MAP.pad + (column === 1 ? MAP.door : 0);
  let y = MAP.header;
  const placedFlows = grid(
    flows.map((t) => t.id),
    MAP.flowColumns,
    x,
    y,
    MAP.flow,
    MAP.flow.row,
  );
  if (flows.length) y += Math.ceil(flows.length / MAP.flowColumns) * MAP.flow.row + 4;
  const desks = grid(
    office.agents.map((a) => a.id),
    3,
    x,
    y,
    MAP.desk,
    MAP.desk.height,
  );
  const empty = office.agents.length
    ? null
    : { x, y, width: MAP.room - MAP.pad * 2 - MAP.door, height: MAP.desk.height - 18 };
  y += Math.max(1, Math.ceil(office.agents.length / 3)) * MAP.desk.height;
  return { flows: placedFlows, desks, empty, height: y + 30 };
}

export function mapLayout(
  company: Company,
  flowsByOffice: (office: Office) => CompanyTask[],
): MapLayout {
  const rooms: RoomLayout[] = [];
  const columnX = [MAP.margin, MAP.margin + MAP.room + MAP.gap] as const;
  let y = MAP.margin;
  let addOffice: Box | null = null;
  for (let i = 0; i < company.offices.length; i += 2) {
    const pair = company.offices.slice(i, i + 2).map((office, column) => ({
      office,
      ...roomInterior(office, flowsByOffice(office), column as 0 | 1),
    }));
    const height = Math.max(...pair.map((room) => room.height));
    pair.forEach((room, column) =>
      rooms.push({
        ...room,
        number: i + column + 1,
        column: column as 0 | 1,
        x: columnX[column]!,
        y,
        width: MAP.room,
        height,
      }),
    );
    if (pair.length === 1) addOffice = { x: columnX[1], y, width: MAP.room, height };
    y += height + MAP.rowGap;
  }
  if (!addOffice) {
    addOffice = { x: columnX[0], y, width: MAP.room, height: MAP.vacantHeight };
    y += MAP.vacantHeight + MAP.rowGap;
  }
  const hallway = {
    x: columnX[0] + MAP.room,
    y: MAP.margin,
    width: MAP.gap,
    height: y - MAP.margin,
  };
  const height = y - MAP.rowGap + MAP.margin + 30;
  const building = {
    x: MAP.wall,
    y: MAP.wall,
    width: MAP.width - MAP.wall * 2,
    height: height - MAP.wall * 2,
  };
  return { rooms, addOffice, hallway, building, height };
}
