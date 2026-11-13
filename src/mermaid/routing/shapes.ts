import type { Box, Point } from "../architectureLayout.js";
import { leadLength, loopReach, trackGap } from "./constants.js";
import type { RouteCost } from "./congestion.js";
import { axisSize, crosses, otherAxis, type Bounds } from "./primitives.js";

export function straightRoute(
  source: Box,
  target: Box,
  obstacles: readonly Bounds[],
  routeCost: RouteCost,
  available: (from: Point, to: Point) => boolean,
  { gap, parallel }: { gap: number; parallel: number },
): Point[] | undefined {
  for (const axis of ["x", "y"] as const) {
    const across = otherAxis(axis);
    const sourceSize = axisSize(source, across);
    const targetSize = axisSize(target, across);
    const sourceInset = Math.min(leadLength, sourceSize / 4);
    const targetInset = Math.min(leadLength, targetSize / 4);
    const low = Math.max(source[across] + sourceInset, target[across] + targetInset);
    const high = Math.min(source[across] + sourceSize - sourceInset, target[across] + targetSize - targetInset);
    if (high < low) continue;

    const forward = source[axis] < target[axis];
    const start = forward ? source[axis] + axisSize(source, axis) : source[axis];
    const end = forward ? target[axis] : target[axis] + axisSize(target, axis);
    if ((forward ? end - start : start - end) < leadLength) continue;

    const middle = (low + high) / 2;
    // Relationships between the same pair share the overlap evenly, outward from its middle.
    const spacing = Math.max(gap, (high - low) / (parallel + 1));
    const spread = parallel > 1
      ? Array.from({ length: parallel }, (_, index) => index + 1)
        .flatMap((step) => [middle - step * spacing, middle + step * spacing])
      : [];
    const candidates = [middle, source[across] + sourceSize / 2, target[across] + targetSize / 2,
      ...spread, middle - gap, middle + gap, low, high];
    for (const coordinate of candidates) {
      if (coordinate < low || coordinate > high) continue;
      const from = axis === "x" ? { x: start, y: coordinate } : { x: coordinate, y: start };
      const to = axis === "x" ? { x: end, y: coordinate } : { x: coordinate, y: end };
      if (available(from, to) && !crosses(from, to, obstacles) && routeCost(axis, from, to) === 0) {
        return [from, to];
      }
    }
  }
  return undefined;
}

export function loopCandidates(box: Box, lane: number): Point[][] {
  const reach = loopReach + lane * trackGap;
  const exit = Math.min(leadLength, box.height / 4);
  const entry = Math.min(loopReach, box.width / 2);
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  return ([[right, 1], [left, -1]] as const).flatMap(([side, outward]) => {
    const channel = side + outward * reach;
    const x = side - outward * entry;
    return [
      [{ x: side, y: top + exit }, { x: channel, y: top + exit }, { x: channel, y: top - reach },
        { x, y: top - reach }, { x, y: top }],
      [{ x: side, y: bottom - exit }, { x: channel, y: bottom - exit }, { x: channel, y: bottom + reach },
        { x, y: bottom + reach }, { x, y: bottom }],
    ];
  });
}
