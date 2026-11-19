import type { Arrangement, MeasuredNode, PlacedNode } from './architectureLayout.js';

export const gridUnit = 20;
// The same gap that separates cells in architecture layout keeps fallback elements apart from pinned ones.
const fallbackGap = 72;

export interface GridPosition {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

export interface CustomLayoutOptions {
  // Keyed by layout node id.
  readonly positions: ReadonlyMap<string, GridPosition>;
  readonly headerHeights: ReadonlyMap<string, number>;
  readonly padding: number;
  // Places unpositioned siblings and their whole subtrees, with the padding already around them.
  readonly fallback: (nodes: readonly MeasuredNode[]) => Arrangement;
}

function roundUpToGrid(value: number): number {
  return Math.ceil(value / gridUnit) * gridUnit;
}

function shift(nodes: readonly PlacedNode[], x: number, y: number): void {
  for (const node of nodes) {
    node.x += x;
    node.y += y;
    if (node.children) shift(node.children, x, y);
  }
}

interface Siblings {
  readonly children: PlacedNode[];
  readonly width: number;
  readonly height: number;
}

/**
 * Pins positioned nodes to the grid and hands the rest to the fallback, below the pinned ones.
 * Positions of nested nodes are relative to their parent's content area. Coordinates in the result
 * are absolute, as in architecture layout. A node never shrinks below its measured size or its children.
 */
export function placeCustom(nodes: readonly MeasuredNode[], options: CustomLayoutOptions): Arrangement {
  const { positions, headerHeights, padding, fallback } = options;

  function placePinned(node: MeasuredNode, position: GridPosition, x: number, y: number): PlacedNode {
    let width = Math.max(node.width, (position.width ?? 0) * gridUnit);
    let height = Math.max(node.height, (position.height ?? 0) * gridUnit);
    if (!node.children?.length) {
      return { id: node.id, x, y, width: roundUpToGrid(width), height: roundUpToGrid(height) };
    }
    const header = headerHeights.get(node.id) ?? node.height;
    const inner = placeSiblings(node.children, x + padding, y + header + padding);
    width = Math.max(width, inner.width + 2 * padding);
    height = Math.max(height, header + inner.height + 2 * padding);
    return {
      id: node.id,
      x,
      y,
      width: roundUpToGrid(width),
      height: roundUpToGrid(height),
      children: inner.children,
    };
  }

  function placeSiblings(siblings: readonly MeasuredNode[], originX: number, originY: number): Siblings {
    const placed = new Map<string, PlacedNode>();
    let width = 0;
    let height = 0;
    const loose: MeasuredNode[] = [];
    for (const node of siblings) {
      const position = positions.get(node.id);
      if (!position) {
        loose.push(node);
        continue;
      }
      const pinned = placePinned(node, position, originX + position.x * gridUnit, originY + position.y * gridUnit);
      placed.set(node.id, pinned);
      width = Math.max(width, pinned.x - originX + pinned.width);
      height = Math.max(height, pinned.y - originY + pinned.height);
    }
    if (loose.length) {
      const arranged = fallback(loose);
      const top = placed.size ? height + fallbackGap : 0;
      shift(arranged.children, originX - padding, originY + top - padding);
      for (const child of arranged.children) placed.set(child.id, child);
      width = Math.max(width, arranged.width - 2 * padding);
      height = top + arranged.height - 2 * padding;
    }
    // Keep the SVG traversal in declaration order, as the other layouts do.
    const children = siblings.flatMap((node) => placed.get(node.id) ?? []);
    return { children, width, height };
  }

  const root = placeSiblings(nodes, padding, padding);
  return { children: root.children, width: root.width + 2 * padding, height: root.height + 2 * padding };
}
