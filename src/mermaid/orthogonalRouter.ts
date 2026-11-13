import type { Box, Point } from "./architectureLayout.js";
import { required } from "./invariant.js";
import {
  createAnchorRegistry, placeSharedAnchors, type AnchorRegistry, type SharedAnchors,
} from "./routing/anchors.js";
import { farSide, planBundles } from "./routing/bundles.js";
import { createCongestion, type Congestion, type RouteCost } from "./routing/congestion.js";
import { clearances, leadLength, markerGap, searchMargin, trackGap } from "./routing/constants.js";
import {
  bounds, centre, crosses, facing, oppositeSide, otherAxis, pointDistance, ports, sidePort, type Bounds, type Port,
} from "./routing/primitives.js";
import { routeBetween } from "./routing/search.js";
import { loopCandidates, straightRoute } from "./routing/shapes.js";
import {
  ancestorIds, boxOf,
  type ArchitectureRoutes, type RouteBundle, type RoutingEdge, type RoutingNode, type RoutingOptions,
} from "./routing/types.js";

export { bundleKind } from "./routing/types.js";
export type {
  ArchitectureRoutes, BundleKind, RouteBundle, RoutingEdge, RoutingNode, RoutingOptions,
} from "./routing/types.js";

interface RouteContext {
  readonly sourceBox: Box;
  readonly targetBox: Box;
  readonly sourceMarker: boolean;
  readonly targetMarker: boolean;
  readonly sourceInsideTarget: boolean;
  readonly targetInsideSource: boolean;
  readonly frame: Box | undefined;
  obstaclesFor(clearance: number): (Bounds & { readonly id: string })[];
  search(
    starts: readonly Port[], ends: readonly Port[], clearance: number,
    separate: { readonly start: boolean; readonly end: boolean }, owner?: string,
  ): Point[] | undefined;
  fallback(starts: readonly Port[], ends: readonly Port[]): Point[];
  record(points: readonly Point[], owner?: string): void;
}

interface RoutingState {
  readonly nodes: ReadonlyMap<string, RoutingNode>;
  readonly warn: ((message: string) => void) | undefined;
  readonly congestion: Congestion;
  readonly anchors: AnchorRegistry;
  readonly routes: Map<string, Point[]>;
  readonly bundles: Map<string, RouteBundle>;
  // Spreads each element's ports along its sides in the order relationships ask for them.
  portFraction(id: string): number;
  parallelCount(edge: RoutingEdge): number;
}

function createRoutingState(
  nodes: ReadonlyMap<string, RoutingNode>, edges: readonly RoutingEdge[], warn: RoutingOptions["warn"],
): RoutingState {
  const degrees = new Map<string, number>();
  for (const { source, target } of edges) {
    for (const id of [source, target]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
  }
  const usedPorts = new Map<string, number>();
  const pairKey = ({ source, target }: RoutingEdge) => JSON.stringify([source, target].sort());
  const parallelCounts = new Map<string, number>();
  for (const edge of edges) parallelCounts.set(pairKey(edge), (parallelCounts.get(pairKey(edge)) ?? 0) + 1);
  return {
    nodes, warn,
    congestion: createCongestion(),
    anchors: createAnchorRegistry(),
    routes: new Map(),
    bundles: new Map(),
    portFraction(id) {
      const used = (usedPorts.get(id) ?? 0) + 1;
      usedPorts.set(id, used);
      return used / ((degrees.get(id) ?? 0) + 1);
    },
    parallelCount: (edge) => parallelCounts.get(pairKey(edge)) ?? 1,
  };
}

function prepare(state: RoutingState, edge: RoutingEdge): RouteContext {
  const { nodes, congestion, anchors, routes, warn } = state;
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) throw new Error(`Missing endpoints for relationship "${edge.id}".`);
  const sourceBox = source.box;
  const targetBox = target.box;
  const sourceMarker = edge.sourceMarker ?? false;
  const targetMarker = edge.targetMarker ?? false;
  const sourceAncestors = ancestorIds(edge.source, nodes);
  const targetAncestors = ancestorIds(edge.target, nodes);
  const open = new Set([...sourceAncestors, ...targetAncestors]);
  const sourceInsideTarget = sourceAncestors.includes(edge.target);
  const targetInsideSource = targetAncestors.includes(edge.source);
  const container = sourceInsideTarget ? edge.target : targetInsideSource ? edge.source
    : sourceAncestors.find((id) => targetAncestors.includes(id));
  const frame = container === undefined ? undefined : nodes.get(container)?.box;

  // An edge can cross its container's frame wherever the title and icon leave room.
  const obstaclesFor = (clearance: number) => [...nodes].flatMap(([id, node]) =>
    (open.has(id) ? node.decorations ?? [] : [node.box]).map((box) => ({ id, ...bounds(box, clearance) })));
  function search(
    starts: readonly Port[], ends: readonly Port[], clearance: number,
    separate: { readonly start: boolean; readonly end: boolean }, owner?: string,
  ): Point[] | undefined {
    const obstacles = obstaclesFor(clearance);
    const available = (port: Port, id: string): boolean =>
      !crosses(port.anchor, port.lead, obstacles.filter((box) => box.id !== id || open.has(id)));
    const usableStarts = starts.filter((port) => available(port, edge.source)
      && (!separate.start || anchors.clear(edge.source, sourceBox, port.anchor, sourceMarker)));
    const usableEnds = ends.filter((port) => available(port, edge.target)
      && (!separate.end || anchors.clear(edge.target, targetBox, port.anchor, targetMarker)));
    const cost: RouteCost = (axis, from, to) => congestion.cost(axis, from, to, owner);
    const frameRegion = frame && bounds(frame, -clearance);
    // Search near the endpoints first; on large diagrams the full grid is far bigger than any good route needs.
    const nearSource = bounds(sourceBox, searchMargin);
    const nearTarget = bounds(targetBox, searchMargin);
    const outer = frameRegion ?? { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
    const nearby: Bounds = {
      left: Math.max(Math.min(nearSource.left, nearTarget.left), outer.left),
      right: Math.min(Math.max(nearSource.right, nearTarget.right), outer.right),
      top: Math.max(Math.min(nearSource.top, nearTarget.top), outer.top),
      bottom: Math.min(Math.max(nearSource.bottom, nearTarget.bottom), outer.bottom),
    };
    const local = obstacles.filter((box) => box.left < nearby.right && box.right > nearby.left
      && box.top < nearby.bottom && box.bottom > nearby.top);
    return (local.length < obstacles.length
      ? routeBetween(usableStarts, usableEnds, local, cost, nearby)
      : undefined)
      ?? routeBetween(usableStarts, usableEnds, obstacles, cost, frameRegion);
  }
  // A diagram with one awkward connector is more useful than no diagram, so the last resort is a straight line.
  function fallback(starts: readonly Port[], ends: readonly Port[]): Point[] {
    const [nearest] = starts.flatMap((start) => ends.map((end) => [start.anchor, end.anchor] as const))
      .sort(([a, b], [c, d]) => pointDistance(a, b) - pointDistance(c, d));
    if (!nearest) throw new Error(`Relationship "${edge.id}" has no ports to connect.`);
    warn?.(`ArchiMate could not find an orthogonal route for relationship "${edge.id}" and drew a direct line.`);
    return [...nearest];
  }
  function record(points: readonly Point[], owner?: string): void {
    const first = points[0];
    const last = points.at(-1);
    if (!first || !last || points.length < 2) {
      throw new Error(`Route for relationship "${edge.id}" has fewer than two points.`);
    }
    anchors.reserve(edge.source, sourceBox, first, sourceMarker);
    anchors.reserve(edge.target, targetBox, last, targetMarker);
    routes.set(edge.id, [...points]);
    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1];
      const end = points[index];
      if (!start || !end) continue;
      const axis = start.y === end.y ? "x" : "y";
      const across = start[otherAxis(axis)];
      congestion.add(axis, across, Math.min(start[axis], end[axis]), Math.max(start[axis], end[axis]), owner);
    }
  }
  return {
    sourceBox, targetBox, sourceMarker, targetMarker, sourceInsideTarget, targetInsideSource, frame,
    obstaclesFor, search, fallback, record,
  };
}

// Self-relationships and straight connections are recorded at once; the rest wait until the bundles are in place.
function routeSingles(state: RoutingState, edges: readonly RoutingEdge[]): (() => void)[] {
  const { anchors, congestion, portFraction } = state;
  const deferred: (() => void)[] = [];
  const loops = new Map<string, number>();
  for (const edge of edges) {
    const {
      sourceBox, targetBox, sourceMarker, targetMarker, sourceInsideTarget, targetInsideSource, frame,
      obstaclesFor, search, fallback, record,
    } = prepare(state, edge);
    const nestedEdge = sourceInsideTarget || targetInsideSource;
    const sourcePorts = ports(sourceBox, portFraction(edge.source), targetInsideSource);
    const targetPorts = ports(targetBox, portFraction(edge.target), sourceInsideTarget);
    const starts = nestedEdge ? sourcePorts : facing(sourcePorts, sourceBox, targetBox);
    const ends = nestedEdge ? targetPorts : facing(targetPorts, targetBox, sourceBox);
    if (edge.source === edge.target) {
      const lane = loops.get(edge.source) ?? 0;
      loops.set(edge.source, lane + 1);
      const obstacles = obstaclesFor(clearances.comfortable).filter(({ id }) => id !== edge.source);
      const region = frame && bounds(frame);
      const inside = ({ x, y }: Point) => !region
        || (x >= region.left && x <= region.right && y >= region.top && y <= region.bottom);
      const loopsAvailable = loopCandidates(sourceBox, lane);
      const clear = loopsAvailable.find((points) => {
        const first = points[0];
        const last = points.at(-1);
        return first !== undefined && last !== undefined
          && anchors.clear(edge.source, sourceBox, first, sourceMarker)
          && anchors.clear(edge.source, sourceBox, last, targetMarker)
          && points.every((point, index) => {
            const previous = points[index - 1];
            return inside(point) && (!previous || !crosses(previous, point, obstacles));
          });
      });
      if (!clear) {
        state.warn?.(`ArchiMate could not keep the self-relationship "${edge.id}" clear of other shapes and anchors.`);
      }
      record(clear ?? required(loopsAvailable[lane % loopsAvailable.length], "a self-relationship loop"));
      continue;
    }
    const direct = !sourceInsideTarget && !targetInsideSource
      ? straightRoute(sourceBox, targetBox,
        obstaclesFor(clearances.comfortable).filter(({ id }) => id !== edge.source && id !== edge.target),
        congestion.cost, (from, to) => anchors.clear(edge.source, sourceBox, from, sourceMarker)
          && anchors.clear(edge.target, targetBox, to, targetMarker),
        { gap: sourceMarker || targetMarker ? markerGap : trackGap, parallel: state.parallelCount(edge) })
      : undefined;
    if (direct) record(direct);
    else {
      const apart = { start: true, end: true };
      const together = { start: false, end: false };
      const { comfortable, tight } = clearances;
      deferred.push(() => record(search(starts, ends, comfortable, apart) ?? search(starts, ends, comfortable, together)
        ?? search(starts, ends, tight, together) ?? fallback(starts, ends)));
    }
  }
  return deferred;
}

function routeBundles(state: RoutingState, { ports: sharedPorts, order: routingOrder }: SharedAnchors): void {
  const { nodes, bundles, portFraction } = state;
  for (const group of routingOrder) {
    const shared = sharedPorts.get(group.id);
    if (!shared) continue;
    const sharedBox = boxOf(nodes, group.element);
    // The farthest member lays the trunk; nearer members then branch off it.
    const members = group.members.toSorted((a, b) => {
      const far = (edge: RoutingEdge) => boxOf(nodes, group.sharedEnd === "start" ? edge.target : edge.source);
      return pointDistance(centre(far(b)), centre(sharedBox)) - pointDistance(centre(far(a)), centre(sharedBox));
    });
    for (const edge of members) {
      const context = prepare(state, edge);
      const farId = group.sharedEnd === "start" ? edge.target : edge.source;
      const farBox = boxOf(nodes, farId);
      const fraction = portFraction(farId);
      const facingSide = farSide(group.side, shared.anchor, farBox);
      const insetX = Math.min(leadLength, farBox.width / 4);
      const insetY = Math.min(leadLength, farBox.height / 4);
      const across = facingSide === "top" || facingSide === "bottom" ? "x" : "y";
      const low = across === "x" ? farBox.x + insetX : farBox.y + insetY;
      const high = across === "x" ? farBox.x + farBox.width - insetX : farBox.y + farBox.height - insetY;
      const straightAcross = facingSide === oppositeSide[group.side]
        && shared.anchor[across] >= low && shared.anchor[across] <= high;
      const along = straightAcross ? shared.anchor[across] : low + fraction * (high - low);
      // Other relationships may already hold the best spot, so offer the rest of the facing side as well.
      // A branch that rises beside a nearer element can enter without a jog where it already runs.
      const besideElements = [...nodes.values()].flatMap(({ box }) => across === "x"
        ? [box.x - clearances.comfortable, box.x + box.width + clearances.comfortable]
        : [box.y - clearances.comfortable, box.y + box.height + clearances.comfortable]).filter((position) => position >= low && position <= high);
      const preferred = [along, ...besideElements,
        ...Array.from({ length: 5 }, (_, index) => low + (index + 0.5) * (high - low) / 5)]
        .map((position) => sidePort(farBox, facingSide, position));
      const anyFar = facing(ports(farBox, fraction, false), farBox, sharedBox);
      // The shared anchor is reserved for the whole bundle, so only the far end keeps clear of other anchors.
      const attempt = (far: readonly Port[], clearance: number, separate: boolean) => group.sharedEnd === "start"
        ? context.search([shared], far, clearance, { start: false, end: separate }, group.id)
        : context.search(far, [shared], clearance, { start: separate, end: false }, group.id);
      const { comfortable, tight } = clearances;
      const points = attempt(preferred, comfortable, true) ?? attempt(anyFar, comfortable, true)
        ?? attempt(anyFar, comfortable, false) ?? attempt(anyFar, tight, false)
        ?? (group.sharedEnd === "start" ? context.fallback([shared], anyFar) : context.fallback(anyFar, [shared]));
      context.record(points, group.members.length > 1 ? group.id : undefined);
      if (group.members.length > 1) bundles.set(edge.id, { id: group.id, sharedEnd: group.sharedEnd });
    }
  }
}

export function routeArchitecture(
  nodes: ReadonlyMap<string, RoutingNode>,
  edges: readonly RoutingEdge[],
  { warn }: RoutingOptions = {},
): ArchitectureRoutes {
  const state = createRoutingState(nodes, edges, warn);
  const groups = planBundles(nodes, edges);
  const shared = placeSharedAnchors(nodes, groups, state.anchors);
  const grouped = new Set([...groups.values()].flatMap(({ members }) => members.map(({ id }) => id)));
  const detours = routeSingles(state, edges.filter(({ id }) => !grouped.has(id)));
  // Reserve straight connectors first, then planned bundles, so detours route around both.
  routeBundles(state, shared);
  for (const detour of detours) detour();
  return { routes: state.routes, bundles: state.bundles };
}
