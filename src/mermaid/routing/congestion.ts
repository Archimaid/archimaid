import type { Point } from "../architectureLayout.js";
import { crossingCost, trackGap } from "./constants.js";
import { firstAtLeast, otherAxis, type Axis } from "./primitives.js";

type Track = readonly [from: number, to: number, owner: string | undefined];
type Tracks = Record<Axis, Map<number, Track[]>>;

export type RouteCost = (axis: Axis, start: Point, end: Point) => number;

export interface Congestion {
  readonly cost: (axis: Axis, start: Point, end: Point, owner?: string) => number;
  readonly add: (axis: Axis, across: number, from: number, to: number, owner?: string) => void;
}

// Lines are cached for the whole diagram and updated as routes are recorded, because rebuilding them
// for every search dominated routing time on tall diagrams.
export function createCongestion(): Congestion {
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
