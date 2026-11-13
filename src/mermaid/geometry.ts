import type { Point } from './architectureLayout.js';

// The longest marker is 12 px and its outline adds 2 px, so 14 px holds any marker with its outline.
export const markerExtent = 14;

export function simplify<P extends Point>(points: readonly P[]): P[] {
  const result: P[] = [];
  for (const point of points) {
    const last = result.at(-1);
    if (last?.x === point.x && last.y === point.y) continue;
    const previous = result.at(-2);
    // A collinear middle point is either a straight continuation or a lead that doubles back.
    if (
      last &&
      previous &&
      ((previous.x === last.x && last.x === point.x) || (previous.y === last.y && last.y === point.y))
    ) {
      result.pop();
    }
    result.push(point);
  }
  return result;
}
