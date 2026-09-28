import type { ReactNode, RefObject } from "react";
import { Minus, Plus } from "lucide-react";
import "./canvas-kit.css";

/**
 * Shared canvas pieces used by the workflow builder, the live run view, and the company map,
 * so all three read as one surface: same stage, zoom controls, cards, wires, and status colors.
 */
export type CanvasStatus =
  | "working"
  | "approval"
  | "done"
  | "failed"
  | "skipped"
  | "waiting"
  | "idle"
  | "offline";

export const canvasStatusLabels: Record<CanvasStatus, string> = {
  working: "Working",
  approval: "Needs approval",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
  waiting: "Waiting",
  idle: "Idle",
  offline: "Not connected",
};

export function StatusPill({ status }: { status: CanvasStatus }) {
  return (
    <em className="ck-status" data-status={status}>
      {canvasStatusLabels[status]}
    </em>
  );
}

/** A left-to-right curve between an output (x1, y1) and an input (x2, y2). */
export function wirePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(80, Math.abs(x2 - x1) / 2);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

export function ZoomControls({
  zoom,
  setZoom,
  fit,
  min = 0.1,
  max = 1.2,
}: {
  zoom: number;
  setZoom: (update: (zoom: number) => number) => void;
  fit: () => void;
  min?: number;
  max?: number;
}) {
  return (
    <>
      <button type="button" className="co-button" onClick={fit}>
        Fit view
      </button>
      <button
        type="button"
        className="co-icon-button"
        aria-label="Zoom out"
        disabled={zoom <= min + 0.001}
        onClick={() => setZoom((z) => Math.max(min, Math.round((z - 0.1) * 10) / 10))}
      >
        <Minus size={14} />
      </button>
      <span className="ck-zoom-value">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        className="co-icon-button"
        aria-label="Zoom in"
        disabled={zoom >= max - 0.001}
        onClick={() => setZoom((z) => Math.min(max, Math.round((z + 0.1) * 10) / 10))}
      >
        <Plus size={14} />
      </button>
    </>
  );
}

/** Fit a world-space box into the viewport; returns the zoom and scroll offset to apply. */
export function fitBox(
  box: { left: number; top: number; right: number; bottom: number },
  viewport: HTMLElement,
  max = 1,
) {
  const width = Math.max(1, box.right - box.left);
  const height = Math.max(1, box.bottom - box.top);
  const zoom = Math.max(
    0.1,
    Math.min(max, (viewport.clientWidth - 40) / width, (viewport.clientHeight - 40) / height),
  );
  return { zoom, left: Math.max(0, box.left * zoom - 20), top: Math.max(0, box.top * zoom - 20) };
}

/** The scrollable, dotted stage with a scaled world inside it. */
export function CanvasStage({
  label,
  viewportRef,
  worldRef,
  zoom,
  width,
  height,
  wires,
  children,
  onDragOver,
  onDrop,
}: {
  label: string;
  viewportRef?: RefObject<HTMLDivElement | null>;
  worldRef?: RefObject<HTMLDivElement | null>;
  zoom: number;
  width: number;
  height: number;
  wires?: ReactNode;
  children: ReactNode;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="tc-canvas"
      ref={viewportRef}
      aria-label={label}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div style={{ width: width * zoom, height: height * zoom }}>
        <div
          className="tc-world"
          ref={worldRef}
          style={{ width, height, transform: `scale(${zoom})` }}
        >
          <svg className="tc-wires" width={width} height={height} aria-label="Connections">
            <defs>
              <marker
                id="tc-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {wires}
          </svg>
          {children}
        </div>
      </div>
    </div>
  );
}
