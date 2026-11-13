import type { Box, Point } from "../architectureLayout.js";
import { bendCost, leadLength } from "./constants.js";

export type Axis = "x" | "y";
export interface Port {
  anchor: Point;
  lead: Point;
  axis: Axis;
  cost: number;
}

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}


export function otherAxis(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

export function bounds(box: Box, padding = 0): Bounds {
  return {
    left: box.x - padding, right: box.x + box.width + padding,
    top: box.y - padding, bottom: box.y + box.height + padding,
  };
}

// Strict comparisons treat a segment on an obstacle's boundary as clear; the renderer's entersBox() differs.
export function crosses(start: Point, end: Point, obstacles: readonly Bounds[]): boolean {
  if (start.y === end.y) {
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    return obstacles.some((box) => box.top < start.y && start.y < box.bottom
      && left < box.right && right > box.left);
  }
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  return obstacles.some((box) => box.left < start.x && start.x < box.right
    && top < box.bottom && bottom > box.top);
}

export function ports(box: Box, fraction: number, inside: boolean): Port[] {
  const insetX = Math.min(leadLength, box.width / 4);
  const insetY = Math.min(leadLength, box.height / 4);
  const x = box.x + insetX + fraction * (box.width - 2 * insetX);
  const y = box.y + insetY + fraction * (box.height - 2 * insetY);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const lead = inside ? -leadLength : leadLength;
  const choices: Port[] = [
    { anchor: { x, y: bottom }, lead: { x, y: bottom + lead }, axis: "y", cost: 0 },
    { anchor: { x: box.x, y }, lead: { x: box.x - lead, y }, axis: "x", cost: 0 },
    { anchor: { x: right, y }, lead: { x: right + lead, y }, axis: "x", cost: 0 },
  ];
  if (!inside) choices.push({ anchor: { x, y: box.y }, lead: { x, y: box.y - lead }, axis: "y", cost: 0 });
  return choices;
}

export function firstAtLeast(sorted: ArrayLike<number>, value: number, strictlyAbove = false): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const candidate = sorted[middle] ?? Infinity;
    if (candidate < value || (strictlyAbove && candidate === value)) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function axisSize(box: Box, axis: Axis): number {
  return axis === "x" ? box.width : box.height;
}

export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export type Side = "top" | "bottom" | "left" | "right";
export const oppositeSide = { top: "bottom", bottom: "top", left: "right", right: "left" } satisfies Record<Side, Side>;

export function beyondSides(box: Box, other: Box): Record<Side, boolean> {
  return {
    top: other.y + other.height <= box.y,
    bottom: other.y >= box.y + box.height,
    left: other.x + other.width <= box.x,
    right: other.x >= box.x + box.width,
  };
}

// Ports that face away from the other endpoint force a detour around their own element.
export function facing(candidates: readonly Port[], box: Box, other: Box): Port[] {
  const beyond = beyondSides(box, other);
  const vertical = beyond.top || beyond.bottom;
  return candidates.map((port) => {
    const side = portSide(box, port.anchor);
    // Layers stack vertically, so a horizontal exit toward another rank would claim the channel between ranks.
    const cost = beyond[side] ? (port.axis === "x" && vertical ? bendCost : 0)
      : beyond[oppositeSide[side]] ? 3 * bendCost : bendCost;
    return { ...port, cost };
  });
}

export function portSide(box: Box, point: Point): Side {
  if (point.x === box.x) return "left";
  if (point.x === box.x + box.width) return "right";
  return point.y === box.y ? "top" : "bottom";
}

export function centre(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function sidePort(box: Box, side: Side, position: number): Port {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  switch (side) {
    case "top":
      return { anchor: { x: position, y: box.y }, lead: { x: position, y: box.y - leadLength }, axis: "y", cost: 0 };
    case "bottom":
      return { anchor: { x: position, y: bottom }, lead: { x: position, y: bottom + leadLength }, axis: "y", cost: 0 };
    case "left":
      return { anchor: { x: box.x, y: position }, lead: { x: box.x - leadLength, y: position }, axis: "x", cost: 0 };
    case "right":
      return { anchor: { x: right, y: position }, lead: { x: right + leadLength, y: position }, axis: "x", cost: 0 };
  }
}
