import type { Point } from "../architectureLayout.js";
import { simplify } from "../geometry.js";
import { bendCost, heuristicWeight, leadLength } from "./constants.js";
import type { RouteCost } from "./congestion.js";
import { firstAtLeast, type Axis, type Bounds, type Port } from "./primitives.js";

interface State {
  column: number;
  row: number;
  axis: Axis;
  distance: number;
  priority: number;
  previous?: State;
  port?: Port;
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

interface Grid {
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly columns: ReadonlyMap<number, number>;
  readonly rows: ReadonlyMap<number, number>;
  readonly blockedSteps: (axis: Axis, across: number) => Uint8Array;
}

// Search only at ports and obstacle boundaries, where an orthogonal turn can clear a shape.
function buildGrid(leads: readonly Point[], obstacles: readonly Bounds[], region: Bounds | undefined): Grid {
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
  const blockers: Record<Axis, Map<number, Uint8Array>> = { x: new Map(), y: new Map() };
  return {
    xs,
    ys,
    columns: new Map(xs.map((x, index) => [x, index])),
    rows: new Map(ys.map((y, index) => [y, index])),
    // Steps join neighbouring grid coordinates, so mark once per grid line which steps enter an obstacle.
    blockedSteps(axis, across) {
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
    },
  };
}

export function routeBetween(
  starts: readonly Port[],
  ends: readonly Port[],
  obstacles: readonly Bounds[],
  routeCost: RouteCost,
  region: Bounds | undefined,
): Point[] | undefined {
  if (!starts.length || !ends.length) return undefined;
  const { xs, ys, columns, rows, blockedSteps } = buildGrid(
    [...starts, ...ends].map(({ lead }) => lead), obstacles, region,
  );
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
