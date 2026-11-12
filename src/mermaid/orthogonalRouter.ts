import type { Box, Point } from "./architectureLayout.js";
import { markerExtent, simplify } from "./geometry.js";

export interface RoutingNode {
  readonly box: Box;
  readonly parent?: string;
  readonly decorations?: readonly Box[];
}

export interface RoutingEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourceMarker?: boolean;
  readonly targetMarker?: boolean;
  // Relationships with the same kind (type, access mode and direction) may be bundled.
  readonly kind?: string;
}

type Axis = "x" | "y";
interface Port {
  anchor: Point;
  lead: Point;
  axis: Axis;
  cost: number;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface State {
  column: number;
  row: number;
  axis: Axis;
  distance: number;
  priority: number;
  previous?: State;
  port?: Port;
}

type Track = readonly [from: number, to: number, owner: string | undefined];
type Tracks = Record<Axis, Map<number, Track[]>>;
const leadLength = 14;
const bendCost = 20;
const trackGap = 8;
// Neighbouring anchors with markers need room for a marker and its outline.
const markerGap = markerExtent;
const crossingCost = 32;
const loopReach = 24;
// Weighting the distance still to go above 1 makes the search greedy: it gives up guaranteed shortest
// routes for far fewer expanded states on dense diagrams.
const heuristicWeight = 1.3;
// Routes first try to stay a comfortable distance from elements, then accept a tight squeeze.
const clearances = { comfortable: 8, tight: 2 } as const;
// Wide enough for a detour around one neighbouring element and its gap; anything longer searches the full grid.
const searchMargin = 160;
const busyDegree = 3;

function otherAxis(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

function bounds(box: Box, padding = 0): Bounds {
  return {
    left: box.x - padding, right: box.x + box.width + padding,
    top: box.y - padding, bottom: box.y + box.height + padding,
  };
}

function crosses(start: Point, end: Point, obstacles: readonly Bounds[]): boolean {
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

function ports(box: Box, fraction: number, inside: boolean): Port[] {
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

function push(queue: State[], state: State): void {
  let index = queue.length;
  queue.push(state);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const higher = queue[parent];
    if (!higher || higher.priority <= state.priority) break;
    queue[index] = higher;
    index = parent;
  }
  queue[index] = state;
}

function pop(queue: State[]): State | undefined {
  const first = queue[0];
  const tail = queue.pop();
  if (!tail || queue.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    const leftState = queue[left];
    const rightState = queue[right];
    if (!leftState) break;
    const best = rightState && rightState.priority < leftState.priority ? right : left;
    const next = queue[best];
    if (!next || tail.priority <= next.priority) break;
    queue[index] = next;
    index = best;
  }
  queue[index] = tail;
  return first;
}

function firstAtLeast(sorted: ArrayLike<number>, value: number, strictlyAbove = false): number {
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

type RouteCost = (axis: Axis, start: Point, end: Point) => number;

interface Congestion {
  cost(axis: Axis, start: Point, end: Point, owner?: string): number;
  add(axis: Axis, across: number, from: number, to: number, owner?: string): void;
}

// Lines are cached for the whole diagram and updated as routes are recorded, because rebuilding them
// for every search dominated routing time on tall diagrams.
function createCongestion(): Congestion {
  type Line = {
    parallel: { from: number; to: number; weight: number; owner: string | undefined; shared: boolean }[];
    crossings: number[];
  };
  const tracks: Tracks = { x: new Map(), y: new Map() };
  const lines: Record<Axis, Map<number, Line>> = { x: new Map(), y: new Map() };
  function line(axis: Axis, coordinate: number): Line {
    const cached = lines[axis].get(coordinate);
    if (cached) return cached;
    const parallel: Line["parallel"] = [];
    const crossings: Line["crossings"] = [];
    for (const [offset, ranges] of tracks[axis]) {
      const distance = Math.abs(coordinate - offset);
      if (distance >= trackGap) continue;
      for (const [from, to, owner] of ranges) {
        parallel.push({ from, to, weight: 1 - distance / trackGap, owner, shared: distance === 0 });
      }
    }
    for (const [offset, ranges] of tracks[otherAxis(axis)]) {
      for (const [from, to] of ranges) {
        if (from < coordinate && coordinate < to) crossings.push(offset);
      }
    }
    crossings.sort((a, b) => a - b);
    const created = { parallel, crossings };
    lines[axis].set(coordinate, created);
    return created;
  }
  return {
    cost(axis, start, end, owner) {
      const { parallel, crossings } = line(axis, start[otherAxis(axis)]);
      const from = Math.min(start[axis], end[axis]);
      const to = Math.max(start[axis], end[axis]);
      let penalty = 0;
      let reused = 0;
      for (const track of parallel) {
        const overlap = Math.max(0, Math.min(to, track.to) - Math.max(from, track.from));
        if (owner === undefined || track.owner !== owner) penalty += 2 * track.weight * overlap;
        else if (track.shared) reused = Math.max(reused, overlap);
      }
      // Following a bundle's own trunk is cheaper than a fresh line, so members share it. The discount
      // stays below the step length, which keeps every step cost positive for the search.
      return penalty - reused / 2 + crossingCost * (firstAtLeast(crossings, to) - firstAtLeast(crossings, from));
    },
    add(axis, across, from, to, owner) {
      const occupied = tracks[axis].get(across);
      if (occupied) occupied.push([from, to, owner]);
      else tracks[axis].set(across, [[from, to, owner]]);
      for (const [coordinate, { parallel }] of lines[axis]) {
        const distance = Math.abs(coordinate - across);
        if (distance < trackGap) {
          parallel.push({ from, to, weight: 1 - distance / trackGap, owner, shared: distance === 0 });
        }
      }
      for (const [coordinate, { crossings }] of lines[otherAxis(axis)]) {
        if (from < coordinate && coordinate < to) crossings.splice(firstAtLeast(crossings, across), 0, across);
      }
    },
  };
}

function routeBetween(
  starts: readonly Port[],
  ends: readonly Port[],
  obstacles: readonly Bounds[],
  routeCost: RouteCost,
  region: Bounds | undefined,
): Point[] | undefined {
  if (!starts.length || !ends.length) return undefined;
  const leads = [...starts, ...ends].map(({ lead }) => lead);
  // Search only at ports and obstacle boundaries, where an orthogonal turn can clear a shape.
  function coordinates(axis: Axis, low: "left" | "top", high: "right" | "bottom"): number[] {
    const values = leads.map((point) => point[axis]);
    for (const box of obstacles) values.push(box[low], box[high]);
    const ordered = [...new Set(values)].sort((a, b) => a - b);
    const first = ordered[0] ?? 0;
    const last = ordered.at(-1) ?? 0;
    const minimum = region?.[low] ?? first - leadLength;
    const maximum = region?.[high] ?? last + leadLength;
    return [...new Set([minimum, ...ordered, maximum])]
      .filter((value) => value >= minimum && value <= maximum)
      .sort((a, b) => a - b);
  }
  const xs = coordinates("x", "left", "right");
  const ys = coordinates("y", "top", "bottom");
  const columns = new Map(xs.map((x, index) => [x, index]));
  const rows = new Map(ys.map((y, index) => [y, index]));
  const blockers: Record<Axis, Map<number, Uint8Array>> = { x: new Map(), y: new Map() };
  // Steps join neighbouring grid coordinates, so mark once per grid line which steps enter an obstacle.
  function blockedSteps(axis: Axis, across: number): Uint8Array {
    const cached = blockers[axis].get(across);
    if (cached) return cached;
    const values = axis === "x" ? xs : ys;
    const steps = new Uint8Array(Math.max(0, values.length - 1));
    for (const box of obstacles) {
      const [low, high, start, end] = axis === "x"
        ? [box.left, box.right, box.top, box.bottom]
        : [box.top, box.bottom, box.left, box.right];
      if (!(start < across && across < end)) continue;
      steps.fill(1, Math.max(0, firstAtLeast(values, low, true) - 1), firstAtLeast(values, high));
    }
    blockers[axis].set(across, steps);
    return steps;
  }
  const queue: State[] = [];
  const distances = new Map<number, number>();
  const key = (column: number, row: number, axis: Axis) => (row * xs.length + column) * 2 + Number(axis === "y");

  function enqueue(
    column: number, row: number, axis: Axis, distance: number, previous?: State, port?: Port,
  ): void {
    const x = xs[column];
    const y = ys[row];
    if (x === undefined || y === undefined) return;
    const id = key(column, row, axis);
    if ((distances.get(id) ?? Infinity) <= distance) return;
    distances.set(id, distance);
    let remaining = Infinity;
    for (const { lead } of ends) remaining = Math.min(remaining, Math.abs(x - lead.x) + Math.abs(y - lead.y));
    push(queue, {
      column, row, axis, distance, priority: distance + heuristicWeight * remaining,
      ...(previous && { previous }), ...(port && { port }),
    });
  }

  for (const port of starts) {
    const column = columns.get(port.lead.x);
    const row = rows.get(port.lead.y);
    if (column !== undefined && row !== undefined) enqueue(column, row, port.axis, port.cost, undefined, port);
  }
  let best: { state: State; port: Port; cost: number } | undefined;
  let state: State | undefined;
  while ((state = pop(queue))) {
    if (best && state.priority >= best.cost) break;
    if (state.distance !== distances.get(key(state.column, state.row, state.axis))) continue;
    const x = xs[state.column];
    const y = ys[state.row];
    if (x === undefined || y === undefined) continue;
    const point = { x, y };
    for (const port of ends) {
      if (port.lead.x !== x || port.lead.y !== y) continue;
      const cost = state.distance + port.cost + (port.axis === state.axis ? 0 : bendCost);
      if (!best || cost < best.cost) best = { state, port, cost };
    }
    const neighbors = [
      [state.column - 1, state.row, "x"], [state.column + 1, state.row, "x"],
      [state.column, state.row - 1, "y"], [state.column, state.row + 1, "y"],
    ] as const;
    for (const [column, row, axis] of neighbors) {
      const nextX = xs[column];
      const nextY = ys[row];
      if (nextX === undefined || nextY === undefined) continue;
      const next = { x: nextX, y: nextY };
      const step = axis === "x" ? Math.min(column, state.column) : Math.min(row, state.row);
      if (blockedSteps(axis, axis === "x" ? y : x)[step]) continue;
      const distance = state.distance + Math.abs(point[axis] - next[axis])
        + (axis === state.axis ? 0 : bendCost) + routeCost(axis, point, next);
      enqueue(column, row, axis, distance, state);
    }
  }

  if (!best) return undefined;
  const points = [best.port.anchor];
  for (let current: State | undefined = best.state; current; current = current.previous) {
    const x = xs[current.column];
    const y = ys[current.row];
    if (x === undefined || y === undefined) throw new Error("Invalid orthogonal routing point.");
    points.push({ x, y });
    if (current.port) points.push(current.port.anchor);
  }
  return simplify(points.reverse());
}

function ancestorIds(id: string, nodes: ReadonlyMap<string, RoutingNode>): string[] {
  const ancestors: string[] = [];
  for (let parent = nodes.get(id)?.parent; parent !== undefined; parent = nodes.get(parent)?.parent) {
    ancestors.push(parent);
  }
  return ancestors;
}

function axisSize(box: Box, axis: Axis): number {
  return axis === "x" ? box.width : box.height;
}

function straightRoute(
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

function loopCandidates(box: Box, lane: number): Point[][] {
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

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type Side = "top" | "bottom" | "left" | "right";
const oppositeSide = { top: "bottom", bottom: "top", left: "right", right: "left" } satisfies Record<Side, Side>;

function beyondSides(box: Box, other: Box): Record<Side, boolean> {
  return {
    top: other.y + other.height <= box.y,
    bottom: other.y >= box.y + box.height,
    left: other.x + other.width <= box.x,
    right: other.x >= box.x + box.width,
  };
}

// Ports that face away from the other endpoint force a detour around their own element.
function facing(candidates: readonly Port[], box: Box, other: Box): Port[] {
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

function portSide(box: Box, point: Point): Side {
  if (point.x === box.x) return "left";
  if (point.x === box.x + box.width) return "right";
  return point.y === box.y ? "top" : "bottom";
}

export interface RoutingOptions {
  readonly warn?: (message: string) => void;
}

export interface RouteBundle {
  readonly id: string;
  // Members of a bundle coincide from the end they share: their start, or their end.
  readonly sharedEnd: "start" | "end";
}

export interface ArchitectureRoutes extends ReadonlyMap<string, Point[]> {
  readonly bundles: ReadonlyMap<string, RouteBundle>;
}

interface BundleGroup {
  readonly id: string;
  readonly element: string;
  readonly side: Side;
  readonly sharedEnd: "start" | "end";
  readonly marker: boolean;
  readonly members: RoutingEdge[];
}

function centre(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// A far element directly above or below gets a straight line from the facing side. Anything else
// joins a trunk on the left or right side, which then runs along the gap between rows.
function bundleSide(shared: Box, far: Box): Side {
  if (far.x < shared.x + shared.width && far.x + far.width > shared.x) {
    return far.y < shared.y ? "top" : "bottom";
  }
  return centre(far).x < centre(shared).x ? "left" : "right";
}

function farSide(group: Side, anchor: Point, far: Box): Side {
  if (group === "top") return "bottom";
  if (group === "bottom") return "top";
  if (far.y + far.height <= anchor.y) return "bottom";
  if (far.y >= anchor.y) return "top";
  return oppositeSide[group];
}

function sidePort(box: Box, side: Side, position: number): Port {
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

// Spread anchors evenly along a side, in the order given. They stay clear of rounded corners, but trunks
// get at least a track gap between them where the side allows it.
function spreadAnchors(start: number, length: number, count: number): number[] {
  const inset = Math.max(0, Math.min(leadLength, (length - (count + 1) * trackGap) / 2));
  return Array.from({ length: count }, (_, index) => start + inset + (index + 1) * (length - 2 * inset) / (count + 1));
}

export function routeArchitecture(
  nodes: ReadonlyMap<string, RoutingNode>,
  edges: readonly RoutingEdge[],
  { warn }: RoutingOptions = {},
): ArchitectureRoutes {
  const degrees = new Map<string, number>();
  for (const { source, target } of edges) {
    for (const id of [source, target]) degrees.set(id, (degrees.get(id) ?? 0) + 1);
  }
  const usedPorts = new Map<string, number>();
  function portFraction(id: string): number {
    const used = (usedPorts.get(id) ?? 0) + 1;
    usedPorts.set(id, used);
    return used / ((degrees.get(id) ?? 0) + 1);
  }

  const congestion = createCongestion();
  const routes = new Map<string, Point[]>();
  const bundles = new Map<string, RouteBundle>();
  const anchors = new Map<string, Map<string, { point: Point; marker: boolean }[]>>();
  function anchorClear(id: string, box: Box, point: Point, marker: boolean): boolean {
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
  const pairKey = ({ source, target }: RoutingEdge) => JSON.stringify([source, target].sort());
  const parallelCounts = new Map<string, number>();
  for (const edge of edges) parallelCounts.set(pairKey(edge), (parallelCounts.get(pairKey(edge)) ?? 0) + 1);

  function boxOf(id: string): Box {
    const node = nodes.get(id);
    if (!node) throw new Error(`Missing endpoint "${id}" for an ArchiMate relationship.`);
    return node.box;
  }

  function prepare(edge: RoutingEdge) {
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
        && (!separate.start || anchorClear(edge.source, sourceBox, port.anchor, sourceMarker)));
      const usableEnds = ends.filter((port) => available(port, edge.target)
        && (!separate.end || anchorClear(edge.target, targetBox, port.anchor, targetMarker)));
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
      reserve(edge.source, sourceBox, first, sourceMarker);
      reserve(edge.target, targetBox, last, targetMarker);
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

  // Relationships of one kind that leave, or arrive at, the same element share an anchor and a trunk.
  const eligible = edges.filter((edge) => {
    if (edge.kind === undefined || edge.source === edge.target) return false;
    return !ancestorIds(edge.source, nodes).includes(edge.target) && !ancestorIds(edge.target, nodes).includes(edge.source);
  });
  const candidates = new Map<string, RoutingEdge[]>();
  const keys = (edge: RoutingEdge) => [
    { key: JSON.stringify([edge.source, edge.kind, "start"]), element: edge.source, sharedEnd: "start" as const },
    { key: JSON.stringify([edge.target, edge.kind, "end"]), element: edge.target, sharedEnd: "end" as const },
  ];
  for (const edge of eligible) {
    for (const { key } of keys(edge)) candidates.set(key, [...candidates.get(key) ?? [], edge]);
  }
  const eligibleDegrees = new Map<string, number>();
  for (const { source, target } of eligible) {
    for (const id of [source, target]) eligibleDegrees.set(id, (eligibleDegrees.get(id) ?? 0) + 1);
  }
  const groups = new Map<string, BundleGroup>();
  for (const edge of eligible) {
    const [atSource, atTarget] = keys(edge);
    if (!atSource || !atTarget) continue;
    const sourceSize = candidates.get(atSource.key)?.length ?? 0;
    const targetSize = candidates.get(atTarget.key)?.length ?? 0;
    const sourceDegree = eligibleDegrees.get(edge.source) ?? 0;
    const targetDegree = eligibleDegrees.get(edge.target) ?? 0;
    // A lone relationship still gets a planned anchor at a busy element, so its trunk nests with the bundles there.
    const chosen = Math.max(sourceSize, targetSize) >= 2
      ? sourceSize >= targetSize ? atSource : atTarget
      : Math.max(sourceDegree, targetDegree) >= busyDegree
        ? sourceDegree >= targetDegree ? atSource : atTarget
        : undefined;
    if (!chosen) continue;
    const far = chosen.sharedEnd === "start" ? edge.target : edge.source;
    const side = bundleSide(boxOf(chosen.element), boxOf(far));
    const id = JSON.stringify([chosen.key, side]);
    const group = groups.get(id);
    // Two relationships of one kind between the same pair would coincide completely, so the copy routes alone.
    const farOf = (member: RoutingEdge) => chosen.sharedEnd === "start" ? member.target : member.source;
    if (group?.members.some((member) => farOf(member) === far)) continue;
    if (group) group.members.push(edge);
    else {
      groups.set(id, {
        id, element: chosen.element, side, sharedEnd: chosen.sharedEnd, members: [edge],
        marker: (chosen.sharedEnd === "start" ? edge.sourceMarker : edge.targetMarker) ?? false,
      });
    }
  }

  // Order anchors so trunks nest: the anchor nearest a side's end serves the nearest far elements.
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
    const box = boxOf(first.element);
    const middle = centre(box);
    const farBoxes = (group: BundleGroup) => group.members.map((edge) =>
      boxOf(group.sharedEnd === "start" ? edge.target : edge.source));
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
      positions = ordered.map((group, index) => straightAt(group) ?? even[index] ?? 0);
    } else {
      // Trunks that turn upward take the upper half of the side and those that turn downward the lower half,
      // leaving the middle for straight connections to the same row, including ones that arrive there.
      const level = sideGroups.filter((group) => straightAt(group) !== undefined)
        .toSorted((a, b) => (straightAt(a) ?? 0) - (straightAt(b) ?? 0));
      const turning = sideGroups.filter((group) => !level.includes(group));
      const rising = turning.filter((group) => farBoxes(group).filter((far) => centre(far).y < middle.y).length * 2
        >= group.members.length).toSorted((a, b) => reach(a) - reach(b));
      const falling = turning.filter((group) => !rising.includes(group)).toSorted((a, b) => reach(b) - reach(a));
      ordered = [...rising, ...level, ...falling];
      const half = size / 2;
      const upper = spreadAnchors(box.y, half, rising.length);
      const lower = spreadAnchors(middle.y, half, falling.length);
      positions = [...upper, ...level.map((group) => straightAt(group) ?? middle.y), ...lower];
    }
    // Keep the planned order, at least a marker gap apart where the side is long enough.
    const lowest = box[axis] + inset;
    const highest = box[axis] + size - inset;
    const spacing = Math.min(markerGap, (highest - lowest) / Math.max(1, ordered.length - 1));
    for (let index = 0; index < positions.length; index++) {
      positions[index] = Math.max(positions[index] ?? lowest, lowest, (positions[index - 1] ?? -Infinity) + spacing);
    }
    for (let index = positions.length - 1; index >= 0; index--) {
      positions[index] = Math.min(positions[index] ?? highest, highest, (positions[index + 1] ?? Infinity) - spacing);
    }
    for (const [index, group] of ordered.entries()) {
      const port = sidePort(box, group.side, positions[index] ?? 0);
      sharedPorts.set(group.id, port);
      reserve(group.element, box, port.anchor, group.marker);
    }
    // Inner trunks go first, so outer trunks find them in place and pass outside them.
    const inward = first.side === "left" || first.side === "right"
      ? ordered.toSorted((a, b) => reach(a) - reach(b))
      : ordered;
    routingOrder.push(...inward);
  }

  const grouped = new Set([...groups.values()].flatMap(({ members }) => members.map(({ id }) => id)));
  function routeGroups(): void {
    for (const group of routingOrder) {
      const shared = sharedPorts.get(group.id);
      if (!shared) continue;
      const sharedBox = boxOf(group.element);
      // The farthest member lays the trunk; nearer members then branch off it.
      const members = group.members.toSorted((a, b) => {
        const far = (edge: RoutingEdge) => boxOf(group.sharedEnd === "start" ? edge.target : edge.source);
        return pointDistance(centre(far(b)), centre(sharedBox)) - pointDistance(centre(far(a)), centre(sharedBox));
      });
      for (const edge of members) {
        const context = prepare(edge);
        const farId = group.sharedEnd === "start" ? edge.target : edge.source;
        const farBox = boxOf(farId);
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

  const deferred: (() => void)[] = [];
  const loops = new Map<string, number>();
  for (const edge of edges) {
    if (grouped.has(edge.id)) continue;
    const {
      sourceBox, targetBox, sourceMarker, targetMarker, sourceInsideTarget, targetInsideSource, frame,
      obstaclesFor, search, fallback, record,
    } = prepare(edge);
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
          && anchorClear(edge.source, sourceBox, first, sourceMarker)
          && anchorClear(edge.source, sourceBox, last, targetMarker)
          && points.every((point, index) => {
            const previous = points[index - 1];
            return inside(point) && (!previous || !crosses(previous, point, obstacles));
          });
      });
      record(clear ?? loopsAvailable[lane % loopsAvailable.length] ?? []);
      continue;
    }
    const direct = !sourceInsideTarget && !targetInsideSource
      ? straightRoute(sourceBox, targetBox,
        obstaclesFor(clearances.comfortable).filter(({ id }) => id !== edge.source && id !== edge.target),
        congestion.cost, (from, to) => anchorClear(edge.source, sourceBox, from, sourceMarker)
          && anchorClear(edge.target, targetBox, to, targetMarker),
        { gap: sourceMarker || targetMarker ? markerGap : trackGap, parallel: parallelCounts.get(pairKey(edge)) ?? 1 })
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
  // Reserve straight connectors first, then planned bundles, so detours route around both.
  routeGroups();
  for (const route of deferred) route();
  return Object.assign(routes, { bundles });
}
