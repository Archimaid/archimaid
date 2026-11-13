import type { ElkPoint } from "elkjs/lib/elk.bundled.js";
import { required } from "../invariant.js";
import type { RouteBundle } from "../orthogonalRouter.js";
import type { Placement } from "./place.js";
import type { LabelStrategy, RoutedEdge } from "./route.js";
import {
  compoundLabelInset, edgeLabelPadding, type EdgeAppearance, type PositionedNode, type TextMetrics,
} from "./shared.js";

// How far along a segment, from its start, other paths run on top of it.
function coveredFrom(start: ElkPoint, end: ElkPoint, others: readonly (readonly ElkPoint[])[]): number {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const vertical = start.x === end.x;
  const direction = vertical ? Math.sign(end.y - start.y) : Math.sign(end.x - start.x);
  let covered = 0;
  for (const path of others) {
    for (let index = 1; index < path.length; index++) {
      const a = path[index - 1];
      const b = path[index];
      if (!a || !b) continue;
      const onLine = vertical ? a.x === start.x && b.x === start.x : a.y === start.y && b.y === start.y;
      if (!onLine) continue;
      const from = vertical ? start.y : start.x;
      const low = Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x);
      const high = Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x);
      if (from < low || from > high) continue;
      covered = Math.max(covered, Math.min(length, direction > 0 ? high - from : from - low));
    }
  }
  return covered;
}

// The part of a bundled path that no sibling shares, starting where it leaves the common trunk.
function unsharedBranch(
  points: readonly ElkPoint[], siblings: readonly (readonly ElkPoint[])[], sharedEnd: "start" | "end",
): ElkPoint[] {
  const path = sharedEnd === "start" ? [...points] : points.toReversed();
  const others = sharedEnd === "start" ? siblings : siblings.map((sibling) => sibling.toReversed());
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1];
    const end = path[index];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const covered = coveredFrom(start, end, others);
    if (covered >= length) continue;
    const fraction = covered / length;
    const split = { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
    const branch = [split, ...path.slice(index)];
    return sharedEnd === "start" ? branch : branch.toReversed();
  }
  return [...points];
}

function labelNearRoute(label: PositionedNode, points: readonly ElkPoint[]): boolean {
  const centreX = label.x + label.width / 2;
  const centreY = label.y + label.height / 2;
  return points.some((start, index) => {
    const end = points[index + 1];
    if (!end) return false;
    const horizontal = Math.abs(start.x - end.x) >= Math.abs(start.y - end.y);
    const along = horizontal ? centreX : centreY;
    const from = horizontal ? start.x : start.y;
    const to = horizontal ? end.x : end.y;
    const across = horizontal
      ? Math.abs(centreY - (start.y + end.y) / 2) - label.height / 2
      : Math.abs(centreX - (start.x + end.x) / 2) - label.width / 2;
    return along >= Math.min(from, to) && along <= Math.max(from, to) && across >= 0 && across <= 8;
  });
}

function edgeLabelPosition(
  points: readonly ElkPoint[],
  metrics: TextMetrics,
  obstacles: readonly PositionedNode[],
  { hint, hintNearRoute, searchAllSegments }: LabelStrategy,
): ElkPoint {
  const width = metrics.width + edgeLabelPadding;
  const { height } = metrics;
  const isClear = ({ x, y }: ElkPoint) => !obstacles.some((box) => x < box.x + box.width
    && x + width > box.x && y < box.y + box.height && y + height > box.y);
  if (hint && isClear(hint) && (!hintNearRoute || labelNearRoute({ ...hint, width, height }, points))) {
    return hint;
  }
  // Labels beside a route leave short paths and their markers visible.
  const segments: { start: ElkPoint; end: ElkPoint; length: number }[] = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    if (start && end) segments.push({ start, end, length: Math.hypot(end.x - start.x, end.y - start.y) });
  }
  segments.sort((a, b) => b.length - a.length);
  let fallback: ElkPoint | undefined;
  for (const { start, end } of segments) {
    const horizontal = Math.abs(start.x - end.x) >= Math.abs(start.y - end.y);
    const along = horizontal ? "x" : "y";
    const across = horizontal ? "y" : "x";
    const alongSize = horizontal ? width : height;
    const acrossSize = horizontal ? height : width;
    const preferred = (start[along] + end[along] - alongSize) / 2;
    const minimum = Math.min(start[along], end[along]) - alongSize / 2;
    const maximum = Math.max(start[along], end[along]) - alongSize / 2;
    const middle = (start[across] + end[across]) / 2;
    const sides = horizontal ? [middle - height - 4, middle + 4] : [middle + 4, middle - width - 4];
    const position = (coordinate: number, side: number) =>
      horizontal ? { x: coordinate, y: side } : { x: side, y: coordinate };
    const nearby = [0, -0.5, 0.5].flatMap((shift) =>
      sides.map((side) => position(preferred + shift * alongSize, side)));
    fallback ??= nearby[0];
    const nearbyClear = nearby.find(isClear);
    if (nearbyClear) return nearbyClear;
    if (!searchAllSegments) break;

    for (const side of sides) {
      const candidates = obstacles.flatMap((box) => {
        const acrossEnd = box[across] + (horizontal ? box.height : box.width);
        if (side >= acrossEnd || side + acrossSize <= box[across]) return [];
        return [box[along] - alongSize - 0.5, box[along] + (horizontal ? box.width : box.height) + 0.5];
      }).filter((coordinate) => coordinate >= minimum && coordinate <= maximum)
        .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
      const clear = candidates.map((coordinate) => position(coordinate, side)).find(isClear);
      if (clear) return clear;
    }
  }
  return required(fallback, "a label position beside the route");
}

export interface PlacedEdge {
  readonly appearance: EdgeAppearance;
  readonly points: ElkPoint[];
  readonly labelPosition: ElkPoint | undefined;
  readonly bundle: RouteBundle | undefined;
}

export function placeLabels(routed: readonly RoutedEdge[], placement: Placement, architecture: boolean): PlacedEdge[] {
  const labelObstacles = [
    ...placement.notes.map(({ box }) => box),
    ...placement.elements.map(({ appearance, box, compound }) => compound
      ? { ...box, height: compoundLabelInset + appearance.label.height }
      : box),
  ];
  return routed.map(({ id, appearance, points, label, bundle }) => {
    const selfLoop = architecture && appearance.relationship.source === appearance.relationship.target;
    const siblings = bundle
      ? routed.filter((other) => other.bundle?.id === bundle.id && other.id !== id).map((other) => other.points)
      : [];
    // A loop's label belongs beside its outer segment, away from the element it returns to. A bundled
    // relationship's label belongs on its own branch, where it cannot be mistaken for its siblings'.
    const labelPoints = selfLoop ? points.slice(1, 3)
      : bundle ? unsharedBranch(points, siblings, bundle.sharedEnd) : points;
    const labelPosition = appearance.label
      ? edgeLabelPosition(labelPoints, appearance.label, labelObstacles, label)
      : undefined;
    if (architecture && labelPosition && appearance.label) {
      labelObstacles.push({
        ...labelPosition, width: appearance.label.width + edgeLabelPadding, height: appearance.label.height,
      });
    }
    return { appearance, points, labelPosition, bundle };
  });
}
