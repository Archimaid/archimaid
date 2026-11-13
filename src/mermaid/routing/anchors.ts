import type { Box, Point } from "../architectureLayout.js";
import { leadLength, markerGap, trackGap } from "./constants.js";
import { required } from "../invariant.js";
import type { BundleGroup } from "./bundles.js";
import { centre, pointDistance, portSide, sidePort, type Port } from "./primitives.js";
import { boxOf, type RoutingNode } from "./types.js";

export interface AnchorRegistry {
  // Whether a new anchor keeps the spacing rule against the anchors already on that side.
  readonly clear: (id: string, box: Box, point: Point, marker: boolean) => boolean;
  readonly reserve: (id: string, box: Box, point: Point, marker: boolean) => void;
}

export function createAnchorRegistry(): AnchorRegistry {
  const anchors = new Map<string, Map<string, { point: Point; marker: boolean }[]>>();
  function clear(id: string, box: Box, point: Point, marker: boolean): boolean {
    return !(anchors.get(id)?.get(portSide(box, point)) ?? []).some((other) =>
      Math.abs(other.point.x - point.x) + Math.abs(other.point.y - point.y)
        < (marker || other.marker ? markerGap : trackGap));
  }
  function reserve(id: string, box: Box, point: Point, marker: boolean): void {
    let sides = anchors.get(id);
    if (!sides) {
      sides = new Map();
      anchors.set(id, sides);
    }
    const side = portSide(box, point);
    const points = sides.get(side);
    if (points?.some((other) => other.point.x === point.x && other.point.y === point.y)) return;
    if (points) points.push({ point, marker });
    else sides.set(side, [{ point, marker }]);
  }
  return { clear, reserve };
}

// Spread anchors evenly along a side, in the order given. They stay clear of rounded corners, but trunks
// get at least a track gap between them where the side allows it.
function spreadAnchors(start: number, length: number, count: number): number[] {
  const inset = Math.max(0, Math.min(leadLength, (length - (count + 1) * trackGap) / 2));
  return Array.from({ length: count }, (_, index) => start + inset + (index + 1) * (length - 2 * inset) / (count + 1));
}

export interface SharedAnchors {
  readonly ports: ReadonlyMap<string, Port>;
  // Bundles in the order they must be routed.
  readonly order: readonly BundleGroup[];
}

// Order anchors so trunks nest: the anchor nearest a side's end serves the nearest far elements.
export function placeSharedAnchors(
  nodes: ReadonlyMap<string, RoutingNode>, groups: ReadonlyMap<string, BundleGroup>, anchors: AnchorRegistry,
): SharedAnchors {
  const sharedPorts = new Map<string, Port>();
  const routingOrder: BundleGroup[] = [];
  const contains = (outer: Box, inner: Box) => outer.x <= inner.x && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
  const bySide = new Map<string, BundleGroup[]>();
  for (const group of groups.values()) {
    const key = JSON.stringify([group.element, group.side]);
    bySide.set(key, [...bySide.get(key) ?? [], group]);
  }
  for (const sideGroups of bySide.values()) {
    const [first] = sideGroups;
    if (!first) continue;
    const box = boxOf(nodes, first.element);
    const middle = centre(box);
    const farBoxes = (group: BundleGroup) => group.members.map((edge) =>
      boxOf(nodes, group.sharedEnd === "start" ? edge.target : edge.source));
    // A branch to a farther row must rise through the gap beside the element in front of it,
    // so that element's near edge, not the target's centre, decides how far out the branch turns.
    const sideX = first.side === "left" ? box.x : box.x + box.width;
    const turn = (far: Box) => {
      const between = [...nodes.values()].map((node) => node.box).filter((other) => other !== far && other !== box
        && !contains(other, far) && !contains(other, box)
        && other.x < far.x + far.width && other.x + other.width > far.x
        && (far.y < middle.y
          ? other.y >= far.y + far.height && other.y + other.height <= middle.y
          : other.y + other.height <= far.y && other.y >= middle.y));
      if (!between.length) return centre(far).x;
      return first.side === "left"
        ? Math.max(...between.map((other) => other.x + other.width))
        : Math.min(...between.map((other) => other.x));
    };
    const reach = (group: BundleGroup) => Math.max(...farBoxes(group).map((far) => Math.abs(turn(far) - sideX)));
    const vertical = first.side === "top" || first.side === "bottom";
    const axis = vertical ? "x" : "y";
    const size = vertical ? box.width : box.height;
    const inset = Math.min(leadLength, size / 4);
    // A far element straight across is best served by an anchor within the overlap, so the line stays straight.
    const straightAt = (group: BundleGroup): number | undefined => {
      const [far] = farBoxes(group).toSorted((a, b) => pointDistance(centre(a), middle) - pointDistance(centre(b), middle));
      if (!far) return undefined;
      const low = Math.max(box[axis] + inset, far[axis] + inset);
      const high = Math.min(box[axis] + size - inset, far[axis] + (vertical ? far.width : far.height) - inset);
      return low <= high ? (low + high) / 2 : undefined;
    };
    let ordered: BundleGroup[];
    let positions: number[];
    if (vertical) {
      ordered = sideGroups.toSorted((a, b) =>
        Math.min(...farBoxes(a).map((far) => centre(far).x)) - Math.min(...farBoxes(b).map((far) => centre(far).x)));
      const even = spreadAnchors(box[axis], size, ordered.length);
      positions = ordered.map((group, index) => straightAt(group) ?? required(even[index], "an evenly spread anchor"));
    } else {
      // Trunks that turn upward take the upper half of the side and those that turn downward the lower half,
      // leaving the middle for straight connections to the same row, including ones that arrive there.
      const level = sideGroups.filter((group) => straightAt(group) !== undefined)
        .toSorted((a, b) => required(straightAt(a), "a straight anchor") - required(straightAt(b), "a straight anchor"));
      const turning = sideGroups.filter((group) => !level.includes(group));
      const rising = turning.filter((group) => farBoxes(group).filter((far) => centre(far).y < middle.y).length * 2
        >= group.members.length).toSorted((a, b) => reach(a) - reach(b));
      const falling = turning.filter((group) => !rising.includes(group)).toSorted((a, b) => reach(b) - reach(a));
      ordered = [...rising, ...level, ...falling];
      const half = size / 2;
      const upper = spreadAnchors(box.y, half, rising.length);
      const lower = spreadAnchors(middle.y, half, falling.length);
      positions = [...upper, ...level.map((group) => required(straightAt(group), "a straight anchor")), ...lower];
    }
    // Keep the planned order, at least a marker gap apart where the side is long enough.
    const lowest = box[axis] + inset;
    const highest = box[axis] + size - inset;
    const spacing = Math.min(markerGap, (highest - lowest) / Math.max(1, ordered.length - 1));
    for (let index = 0; index < positions.length; index++) {
      positions[index] = Math.max(required(positions[index], "an anchor position"), lowest, (positions[index - 1] ?? -Infinity) + spacing);
    }
    for (let index = positions.length - 1; index >= 0; index--) {
      positions[index] = Math.min(required(positions[index], "an anchor position"), highest, (positions[index + 1] ?? Infinity) - spacing);
    }
    for (const [index, group] of ordered.entries()) {
      const port = sidePort(box, group.side, required(positions[index], "an anchor position"));
      sharedPorts.set(group.id, port);
      anchors.reserve(group.element, box, port.anchor, group.marker);
    }
    // Inner trunks go first, so outer trunks find them in place and pass outside them.
    const inward = first.side === "left" || first.side === "right"
      ? ordered.toSorted((a, b) => reach(a) - reach(b))
      : ordered;
    routingOrder.push(...inward);
  }
  return { ports: sharedPorts, order: routingOrder };
}
