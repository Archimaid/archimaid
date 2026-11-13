import type { ElkExtendedEdge, ElkPoint } from 'elkjs/lib/elk.bundled.js';
import { simplify } from '../geometry.js';
import { cornerRadius, layoutPadding, noteFold, noteInset, type EdgeEndpoint, type PositionedNode } from './shared.js';

export function clipCorner(point: ElkPoint, adjacent: ElkPoint, { box, outline }: EdgeEndpoint): ElkPoint {
  const horizontal = Math.abs(point.x - adjacent.x) > Math.abs(point.y - adjacent.y);
  if (outline === 'note') {
    const cornerDistance = box.x + box.width - point.x + point.y - box.y;
    const inset = Math.max(0, noteFold - cornerDistance);
    return horizontal ? { x: point.x - inset, y: point.y } : { x: point.x, y: point.y + inset };
  }
  if (outline !== 'rounded' && outline !== 'chamfered') {
    return point;
  }

  const distance = horizontal
    ? Math.min(point.y - box.y, box.y + box.height - point.y)
    : Math.min(point.x - box.x, box.x + box.width - point.x);
  const delta = Math.max(0, cornerRadius - Math.max(0, distance));
  const inset = outline === 'rounded' ? cornerRadius - Math.sqrt(cornerRadius ** 2 - delta ** 2) : delta;
  return horizontal
    ? { x: point.x + Math.sign(point.x - adjacent.x) * inset, y: point.y }
    : { x: point.x, y: point.y + Math.sign(point.y - adjacent.y) * inset };
}

// ELK routes an attached note's relationships from its host's layout box. Rebuild the part of the route
// next to the note so that it leaves the note orthogonally and never crosses the host.
function attachedNoteRoute(path: readonly ElkPoint[], note: PositionedNode, host: PositionedNode): ElkPoint[] {
  const [start, next, ...rest] = path;
  if (!start || !next) return [...path];
  const final = rest.length === 0;
  const right = note.x + note.width;
  const bandAbove = note.y < host.y;
  const top = Math.min(note.y, host.y);
  const bottom = Math.max(note.y + note.height, host.y + host.height);
  // Keep ELK's port order on the note's side, so that relationships sharing a side do not share an exit.
  const sideExit = (fraction: number, rightSide: boolean): number => {
    const low = note.y + (rightSide ? noteFold : 0) + 4;
    const high = note.y + note.height - 4;
    return low + Math.min(Math.max(fraction, 0), 1) * (high - low);
  };
  const hostRight = host.x + host.width;
  const hostBottom = host.y + host.height;

  if (start.x === next.x && next.y < start.y === bandAbove) {
    // The route leaves through the band, so it can leave the note's outer edge directly.
    const x = Math.min(Math.max(start.x, note.x + 2), right - (bandAbove ? noteFold : 0) - 2);
    const exit = { x, y: bandAbove ? note.y : note.y + note.height };
    if (x === next.x) return simplify([exit, next, ...rest]);
    const turn = (exit.y + next.y) / 2;
    return simplify([exit, { x, y: turn }, { x: next.x, y: turn }, next, ...rest]);
  }

  if (start.y === next.y) {
    const rightward = next.x > start.x;
    const exit = { x: rightward ? right : note.x, y: sideExit((start.y - top) / (bottom - top), rightward) };
    if (!final) return simplify([exit, { x: next.x, y: exit.y }, next, ...rest]);
    const outside = rightward ? hostRight + noteInset / 2 : host.x - noteInset / 2;
    const turn = rightward ? Math.max((exit.x + next.x) / 2, outside) : Math.min((exit.x + next.x) / 2, outside);
    return simplify([exit, { x: turn, y: exit.y }, { x: turn, y: next.y }, next]);
  }

  // The route leaves through the host, so go around the host on the side nearer the route.
  const rightward = next.x >= host.x + host.width / 2;
  const fraction = (start.x - host.x) / host.width;
  const exit = { x: rightward ? right : note.x, y: sideExit(rightward ? fraction : 1 - fraction, rightward) };
  const channel = rightward ? hostRight + noteInset : host.x - noteInset;
  if (!final) return simplify([exit, { x: channel, y: exit.y }, { x: channel, y: next.y }, next, ...rest]);
  const hostEdge = bandAbove ? hostBottom : host.y;
  const turn = (hostEdge + next.y) / 2;
  return simplify([exit, { x: channel, y: exit.y }, { x: channel, y: turn }, { x: next.x, y: turn }, next]);
}

// Unlike the router's strict crosses(), the 0.5 px inset lets segments that only graze an outline pass.
function entersBox(start: ElkPoint, end: ElkPoint, box: PositionedNode): boolean {
  return (
    Math.min(start.x, end.x) < box.x + box.width - 0.5 &&
    Math.max(start.x, end.x) > box.x + 0.5 &&
    Math.min(start.y, end.y) < box.y + box.height - 0.5 &&
    Math.max(start.y, end.y) > box.y + 0.5
  );
}

function slideAlongSide(box: PositionedNode, point: ElkPoint, axis: 'x' | 'y', value: number): ElkPoint | undefined {
  const across = axis === 'x' ? 'y' : 'x';
  const low = box[across];
  const high = box[across] + (axis === 'x' ? box.height : box.width);
  const sideValue = Math.abs(point[across] - low) <= Math.abs(point[across] - high) ? low : high;
  const start = box[axis] + cornerRadius;
  const end = box[axis] + (axis === 'x' ? box.width : box.height) - cornerRadius;
  if (value < start || value > end) return undefined;
  return axis === 'x' ? { x: value, y: sideValue } : { x: sideValue, y: value };
}

// ELK does not see attached notes and compound titles, so move segments that cross them sideways.
export function clearDecorations(
  points: readonly ElkPoint[],
  obstacles: readonly PositionedNode[],
  blocked: readonly PositionedNode[],
  source: EdgeEndpoint,
  target: EdgeEndpoint,
): ElkPoint[] {
  let path = points.map((point) => ({ ...point }));
  const clearance = 6;
  for (let index = 0; index + 1 < path.length; index++) {
    const start = path[index];
    const end = path[index + 1];
    if (!start || !end || (start.x !== end.x && start.y !== end.y)) continue;
    const obstacle = obstacles.find((box) => entersBox(start, end, box));
    if (!obstacle) continue;
    const axis = start.x === end.x ? 'x' : 'y';
    const size = axis === 'x' ? obstacle.width : obstacle.height;
    const values = [obstacle[axis] - clearance, obstacle[axis] + size + clearance].sort(
      (a, b) => Math.abs(a - start[axis]) - Math.abs(b - start[axis]),
    );
    for (const value of values) {
      const moved = path.map((point) => ({ ...point }));
      const startsRoute = index === 0;
      const endsRoute = index + 2 === path.length;
      // Attached-note ends were already rebuilt to leave the note cleanly.
      if ((startsRoute && source.overlayHost) || (endsRoute && target.overlayHost)) break;
      const first = startsRoute ? slideAlongSide(source.box, start, axis, value) : { ...start, [axis]: value };
      const last = endsRoute ? slideAlongSide(target.box, end, axis, value) : { ...end, [axis]: value };
      if (!first || !last) continue;
      moved[index] = first;
      moved[index + 1] = last;
      const nearby = moved.slice(Math.max(0, index - 1), index + 3);
      const clear = nearby.slice(1).every((point, offset) => {
        const previous = nearby[offset];
        return !previous || [...obstacles, ...blocked].every((box) => !entersBox(previous, point, box));
      });
      if (clear) {
        path = moved;
        break;
      }
    }
  }
  return path;
}

function edgeEndpoint(point: ElkPoint, adjacent: ElkPoint, endpoint: EdgeEndpoint): ElkPoint {
  const bottom = endpoint.box.y + endpoint.box.height;
  if (point.y >= endpoint.box.y && point.y <= bottom) return clipCorner(point, adjacent, endpoint);

  // ELK includes the attached-note band in its box, but edges must meet the visible shape.
  const horizontal = point.y === adjacent.y;
  const inset = horizontal ? Math.min(cornerRadius, endpoint.box.height / 2) : 0;
  const y = point.y < endpoint.box.y ? endpoint.box.y + inset : bottom - inset;
  return clipCorner({ x: point.x, y }, horizontal ? { x: adjacent.x, y } : adjacent, endpoint);
}

export function routePoints(route: ElkExtendedEdge, source: EdgeEndpoint, target: EdgeEndpoint): ElkPoint[] {
  const sections = route.sections ?? [];
  const byId = new Map(sections.map((section) => [section.id, section]));
  const first = sections.find((section) => !section.incomingSections?.length);
  if (!first) {
    throw new Error(`ELK did not return a route for relationship "${route.id}".`);
  }

  const points: ElkPoint[] = [];
  const visited = new Set<string>();
  let section = first;
  for (;;) {
    if (visited.has(section.id) || (section.outgoingSections?.length ?? 0) > 1) {
      throw new Error(`ELK returned a branched route for relationship "${route.id}".`);
    }
    visited.add(section.id);
    points.push(section.startPoint, ...(section.bendPoints ?? []), section.endPoint);
    const next = section.outgoingSections?.[0];
    if (!next) break;
    const nextSection = byId.get(next);
    if (!nextSection) {
      throw new Error(`ELK returned an incomplete route for relationship "${route.id}".`);
    }
    section = nextSection;
  }

  const routePath = points.filter(
    (point, index) => index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y,
  );
  const start = routePath[0];
  const next = routePath[1];
  const end = routePath.at(-1);
  const previous = routePath.at(-2);
  if (!start || !next || !end || !previous || visited.size !== sections.length) {
    throw new Error(`ELK returned an incomplete route for relationship "${route.id}".`);
  }

  let result = routePath;
  if (source.overlayHost) result = attachedNoteRoute(result, source.box, source.overlayHost);
  else result = alignFirstSegment([edgeEndpoint(start, next, source), ...result.slice(1)]);
  if (target.overlayHost) return attachedNoteRoute(result.toReversed(), target.box, target.overlayHost).toReversed();
  const moved = [...result.slice(0, -1), edgeEndpoint(end, result.at(-2) ?? previous, target)];
  return alignFirstSegment(moved.toReversed()).toReversed();
}

// Moving an endpoint out of an attached-note band can leave the first segment diagonal. Carry the next
// bend along when the route continues across, otherwise add a jog halfway, outside the element.
function alignFirstSegment(path: readonly ElkPoint[]): ElkPoint[] {
  const [start, next, after, ...rest] = path;
  if (!start || !next || start.x === next.x || start.y === next.y) return [...path];
  if (after && next.x === after.x) return simplify([start, { x: next.x, y: start.y }, after, ...rest]);
  if (after && next.y === after.y) return simplify([start, { x: start.x, y: next.y }, after, ...rest]);
  const middle = (start.x + next.x) / 2;
  return simplify([
    start,
    { x: middle, y: start.y },
    { x: middle, y: next.y },
    next,
    ...(after ? [after] : []),
    ...rest,
  ]);
}

export function overlayRoute(
  source: EdgeEndpoint,
  target: EdgeEndpoint,
  host: PositionedNode,
  lane: number,
): ElkPoint[] {
  const hostRight = host.x + host.width;
  // Attached notes end before the host's right edge. Put the channel in the layout padding.
  const channel = hostRight + noteInset + ((layoutPadding - noteInset) * lane) / 2;
  const port = ({ box, overlayHost }: EdgeEndpoint): ElkPoint => ({
    x: box.x + box.width,
    y: overlayHost
      ? box.y + box.height * (0.4 + 0.2 * lane)
      : Math.min(
          Math.max(host.y + cornerRadius + noteInset * lane, box.y + cornerRadius),
          box.y + box.height - cornerRadius,
        ),
  });
  const start = port(source);
  const end = port(target);
  return [start, { x: channel, y: start.y }, { x: channel, y: end.y }, end];
}
