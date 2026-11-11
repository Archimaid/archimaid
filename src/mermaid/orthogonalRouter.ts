import type { Box, Point } from "./architectureLayout.js";

export interface RoutingNode {
  readonly box: Box;
  readonly parent?: string;
  readonly decorations?: readonly Box[];
}

export interface RoutingEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

type Axis = "x" | "y";
interface Port {
  anchor: Point;
  lead: Point;
  axis: Axis;
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

type Tracks = Record<Axis, Map<number, Array<readonly [number, number]>>>;
const leadLength = 14;
const bendCost = 20;
const trackGap = 8;
const crossingCost = 32;

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
  const insetX = Math.min(14, box.width / 4);
  const insetY = Math.min(14, box.height / 4);
  const x = box.x + insetX + fraction * (box.width - 2 * insetX);
  const y = box.y + insetY + fraction * (box.height - 2 * insetY);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const lead = inside ? -leadLength : leadLength;
  const choices: Port[] = [
    { anchor: { x, y: bottom }, lead: { x, y: bottom + lead }, axis: "y" },
    { anchor: { x: box.x, y }, lead: { x: box.x - lead, y }, axis: "x" },
    { anchor: { x: right, y }, lead: { x: right + lead, y }, axis: "x" },
  ];
  if (!inside) choices.push({ anchor: { x, y: box.y }, lead: { x, y: box.y - lead }, axis: "y" });
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

function compact(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last?.x === point.x && last.y === point.y) continue;
    const previous = result.at(-2);
    if (last && previous && ((previous.x === last.x && last.x === point.x
      && (last.y - previous.y) * (point.y - last.y) > 0)
      || (previous.y === last.y && last.y === point.y
        && (last.x - previous.x) * (point.x - last.x) > 0))) {
      result.pop();
    }
    result.push(point);
  }
  return result;
}

function congestion(tracks: Tracks): (axis: Axis, start: Point, end: Point) => number {
  type Line = { parallel: { from: number; to: number; weight: number }[]; crossings: number[] };
  const lines: Record<Axis, Map<number, Line>> = { x: new Map(), y: new Map() };
  return (axis, start, end) => {
    const perpendicular = otherAxis(axis);
    const coordinate = start[perpendicular];
    let line = lines[axis].get(coordinate);
    if (!line) {
      const parallel: Line["parallel"] = [];
      const crossings: Line["crossings"] = [];
      for (const [offset, ranges] of tracks[axis]) {
        const distance = Math.abs(coordinate - offset);
        if (distance >= trackGap) continue;
        for (const [from, to] of ranges) parallel.push({ from, to, weight: 1 - distance / trackGap });
      }
      for (const [offset, ranges] of tracks[perpendicular]) {
        for (const [from, to] of ranges) {
          if (from < coordinate && coordinate < to) crossings.push(offset);
        }
      }
      line = { parallel, crossings };
      lines[axis].set(coordinate, line);
    }
    const from = Math.min(start[axis], end[axis]);
    const to = Math.max(start[axis], end[axis]);
    let penalty = 0;
    for (const track of line.parallel) {
      penalty += 2 * track.weight * Math.max(0, Math.min(to, track.to) - Math.max(from, track.from));
    }
    // Half-open intervals count a crossing once when a search step ends on it.
    for (const crossing of line.crossings) {
      if (from <= crossing && crossing < to) penalty += crossingCost;
    }
    return penalty;
  };
}

function routeBetween(
  starts: readonly Port[],
  ends: readonly Port[],
  obstacles: readonly Bounds[],
  tracks: Tracks,
  region: Bounds | undefined,
): Point[] | undefined {
  if (!starts.length || !ends.length) return undefined;
  const routeCost = congestion(tracks);
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
  const blockers: Record<Axis, Map<number, readonly Bounds[]>> = { x: new Map(), y: new Map() };
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
      // Bias the search toward the target on dense diagrams while retaining bend and overlap costs.
      column, row, axis, distance, priority: distance + 1.3 * remaining,
      ...(previous && { previous }), ...(port && { port }),
    });
  }

  for (const port of starts) {
    const column = columns.get(port.lead.x);
    const row = rows.get(port.lead.y);
    if (column !== undefined && row !== undefined) enqueue(column, row, port.axis, 0, undefined, port);
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
      const cost = state.distance + (port.axis === state.axis ? 0 : bendCost);
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
      const across = axis === "x" ? y : x;
      let line = blockers[axis].get(across);
      if (!line) {
        line = axis === "x" ? obstacles.filter(({ top, bottom }) => top < y && y < bottom)
          : obstacles.filter(({ left, right }) => left < x && x < right);
        blockers[axis].set(across, line);
      }
      if (crosses(point, next, line)) continue;
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
  return compact(points.reverse());
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
  tracks: Tracks,
  available: (from: Point, to: Point) => boolean,
): Point[] | undefined {
  const routeCost = congestion(tracks);
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
    const candidates = [middle, source[across] + sourceSize / 2, target[across] + targetSize / 2,
      middle - trackGap, middle + trackGap, low, high];
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

function portSide(box: Box, point: Point): string {
  if (point.x === box.x) return "left";
  if (point.x === box.x + box.width) return "right";
  return point.y === box.y ? "top" : "bottom";
}

export function routeArchitecture(
  nodes: ReadonlyMap<string, RoutingNode>,
  edges: readonly RoutingEdge[],
): ReadonlyMap<string, Point[]> {
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

  const tracks: Tracks = { x: new Map(), y: new Map() };
  const routes = new Map<string, Point[]>();
  const anchors = new Map<string, Map<string, Point[]>>();
  function anchorClear(id: string, box: Box, point: Point): boolean {
    return !(anchors.get(id)?.get(portSide(box, point)) ?? []).some((other) =>
      Math.abs(other.x - point.x) + Math.abs(other.y - point.y) < trackGap);
  }
  function reserve(id: string, box: Box, point: Point): void {
    let sides = anchors.get(id);
    if (!sides) {
      sides = new Map();
      anchors.set(id, sides);
    }
    const side = portSide(box, point);
    const points = sides.get(side);
    if (points) points.push(point);
    else sides.set(side, [point]);
  }

  const deferred: (() => void)[] = [];
  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (!source || !target) throw new Error(`Missing endpoints for relationship "${edge.id}".`);
    const sourceBox = source.box;
    const targetBox = target.box;
    const sourceAncestors = ancestorIds(edge.source, nodes);
    const targetAncestors = ancestorIds(edge.target, nodes);
    const open = new Set([...sourceAncestors, ...targetAncestors]);
    const sourceInsideTarget = sourceAncestors.includes(edge.target);
    const targetInsideSource = targetAncestors.includes(edge.source);
    const container = sourceInsideTarget ? edge.target : targetInsideSource ? edge.source
      : sourceAncestors.find((id) => targetAncestors.includes(id));
    const frame = container === undefined ? undefined : nodes.get(container)?.box;
    const starts = ports(sourceBox, portFraction(edge.source), targetInsideSource);
    const ends = ports(targetBox, portFraction(edge.target), sourceInsideTarget);

    // An edge can cross its container's frame wherever the title and icon leave room.
    const obstaclesFor = (clearance: number) => [...nodes].flatMap(([id, node]) =>
      (open.has(id) ? node.decorations ?? [] : [node.box]).map((box) => ({ id, ...bounds(box, clearance) })));
    function route(clearance: number, separate: boolean): Point[] | undefined {
      const obstacles = obstaclesFor(clearance);
      const available = (port: Port, id: string): boolean =>
        !crosses(port.anchor, port.lead, obstacles.filter((box) => box.id !== id || open.has(id)));
      return routeBetween(
        starts.filter((port) => available(port, edge.source)
          && (!separate || anchorClear(edge.source, sourceBox, port.anchor))),
        ends.filter((port) => available(port, edge.target)
          && (!separate || anchorClear(edge.target, targetBox, port.anchor))),
        obstacles, tracks, frame && bounds(frame, -clearance),
      );
    }
    function record(points: Point[] | undefined): void {
      const first = points?.[0];
      const last = points?.at(-1);
      if (!points || !first || !last || points.length < 2) {
        throw new Error(`Unable to route ArchiMate relationship "${edge.id}".`);
      }
      reserve(edge.source, sourceBox, first);
      reserve(edge.target, targetBox, last);
      routes.set(edge.id, points);
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1];
        const end = points[index];
        if (!start || !end) continue;
        const axis = start.y === end.y ? "x" : "y";
        const across = start[otherAxis(axis)];
        const range = [Math.min(start[axis], end[axis]), Math.max(start[axis], end[axis])] as const;
        const occupied = tracks[axis].get(across);
        if (occupied) occupied.push(range);
        else tracks[axis].set(across, [range]);
      }
    }
    const direct = edge.source !== edge.target && !sourceInsideTarget && !targetInsideSource
      ? straightRoute(sourceBox, targetBox, obstaclesFor(8).filter(({ id }) => id !== edge.source && id !== edge.target),
        tracks, (from, to) => anchorClear(edge.source, sourceBox, from) && anchorClear(edge.target, targetBox, to))
      : undefined;
    if (direct) record(direct);
    else deferred.push(() => record(route(8, true) ?? route(8, false) ?? route(2, false)));
  }
  // Reserve straight connectors first, so detours route around them.
  for (const route of deferred) route();
  return routes;
}
