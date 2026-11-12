import { placeConnectedLayers, sequence } from "./relationshipPlacement.js";

export interface MeasuredNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly children?: readonly MeasuredNode[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Box extends Point {
  width: number;
  height: number;
}

export interface PlacedNode extends Box {
  id: string;
  children?: PlacedNode[];
}

export interface Placement {
  readonly row: string | null;
  readonly column: Column;
  readonly headerHeight: number;
}

export interface LayoutRelationship {
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

const columns = ["passiveStructure", "behavior", "activeStructure"] as const;
type Column = (typeof columns)[number] | null;

interface Cell {
  row: string;
  column: Column;
}

export interface SizedNode extends Cell {
  node: PlacedNode;
}

export interface Arrangement {
  width: number;
  height: number;
  children: PlacedNode[];
}

const nodeGap = 46;
const cellGap = 72;

function extent(nodes: readonly PlacedNode[], dimension: "height" | "width"): number {
  return nodes.reduce((maximum, node) => Math.max(maximum, node[dimension]), 0);
}

function stack(nodes: readonly PlacedNode[], horizontal: boolean, gap: number): Arrangement {
  const crossSize = extent(nodes, horizontal ? "height" : "width");
  let offset = 0;
  for (const node of nodes) {
    node.x = horizontal ? offset : (crossSize - node.width) / 2;
    node.y = horizontal ? (crossSize - node.height) / 2 : offset;
    offset += (horizontal ? node.width : node.height) + gap;
  }
  const size = Math.max(0, offset - gap);
  return {
    width: horizontal ? size : crossSize,
    height: horizontal ? crossSize : size,
    children: [...nodes],
  };
}

function grid(nodes: readonly SizedNode[], rows: readonly string[], gap: number): Arrangement {
  const widths = new Map<Column, number>();
  const stacks = new Map<string, Map<Column, Arrangement>>();
  for (const row of [...rows, "motivation"]) {
    const cells = new Map<Column, Arrangement>();
    for (const column of [...columns, null]) {
      const members = nodes.filter((node) => node.row === row && node.column === column);
      if (members.length === 0) continue;
      const arrangement = stack(members.map(({ node }) => node), false, gap);
      cells.set(column, arrangement);
      if (row !== "motivation") widths.set(column, Math.max(widths.get(column) ?? 0, arrangement.width));
    }
    stacks.set(row, cells);
  }

  const offsets = new Map<Column, number>();
  let width = 0;
  for (const column of columns) {
    const size = widths.get(column);
    if (size === undefined) continue;
    offsets.set(column, width);
    width += size + cellGap;
  }
  width = Math.max(0, width - cellGap, widths.get(null) ?? 0);

  let height = 0;
  for (const row of rows) {
    const cells = stacks.get(row);
    if (!cells?.size) continue;
    let rowHeight = 0;
    for (const [column, offset] of offsets) {
      const cell = cells.get(column);
      if (!cell) continue;
      const left = offset + ((widths.get(column) ?? 0) - cell.width) / 2;
      for (const node of cell.children) {
        node.x += left;
        node.y += height;
      }
      rowHeight = Math.max(rowHeight, cell.height);
    }
    const neutral = cells.get(null);
    if (neutral) {
      if (rowHeight) rowHeight += gap;
      for (const node of neutral.children) node.y += height + rowHeight;
      rowHeight += neutral.height;
    }
    height += rowHeight + cellGap;
  }
  height = Math.max(0, height - cellGap);

  const motivation = stacks.get("motivation")?.get(null);
  if (motivation) {
    const offset = width > 0 ? width + cellGap : 0;
    for (const node of motivation.children) node.x += offset;
    width = offset + motivation.width;
    height = Math.max(height, motivation.height);
  }
  return { width, height, children: nodes.map(({ node }) => node) };
}

function classify(placement: Placement | undefined, children: readonly SizedNode[]): Cell {
  if (placement?.row) return { row: placement.row, column: placement.column };
  const first = children[0];
  if (!first || children.some(({ row }) => row !== first.row)) return { row: "neutral", column: null };
  return {
    row: first.row,
    column: children.every(({ column }) => column === first.column) ? first.column : null,
  };
}

export function placeArchitecture(
  nodes: readonly MeasuredNode[],
  placements: ReadonlyMap<string, Placement>,
  relationships: readonly LayoutRelationship[],
  { rowOrder, padding, labelHeight, framework = false, maxRowWidth }: {
    rowOrder: readonly string[]; padding: number; labelHeight: number; framework?: boolean; maxRowWidth: number;
  },
): Arrangement {
  const successors = new Map<string, string[]>();
  for (const { source, target, type } of relationships) {
    if (type !== "triggering" && type !== "flow") continue;
    const existing = successors.get(source);
    if (existing) existing.push(target);
    else successors.set(source, [target]);
  }
  const rows = [...rowOrder, "neutral"];
  const gap = Math.max(nodeGap, labelHeight + 16);
  const arrange = (members: readonly SizedNode[]) => framework
    ? grid(members, rows, gap)
    : placeConnectedLayers(members, ["motivation", ...rows], relationships, gap, cellGap, maxRowWidth);

  function size(node: MeasuredNode): SizedNode {
    const placement = placements.get(node.id);
    const children = (node.children ?? []).map(size);
    const cell = classify(placement, children);
    const measured = { id: node.id, width: node.width, height: node.height, x: 0, y: 0 };
    if (!children.length) return { ...cell, node: measured };

    const local = placement?.column === "behavior"
      ? stack(sequence(children, successors), true, gap)
      : arrange(children);
    const header = placement?.headerHeight ?? node.height;
    const width = Math.max(node.width, local.width + 2 * padding);
    const height = Math.max(node.height, header + local.height + 2 * padding);
    for (const child of local.children) {
      child.x += (width - local.width) / 2;
      child.y += header + padding;
    }
    // Keep the SVG traversal in declaration order even when flow changed placement order.
    return { ...cell, node: { ...measured, width, height, children: children.map(({ node }) => node) } };
  }

  const arranged = arrange(nodes.map(size));
  function translate(children: readonly PlacedNode[], x: number, y: number): void {
    for (const child of children) {
      child.x += x;
      child.y += y;
      if (child.children) translate(child.children, child.x, child.y);
    }
  }
  translate(arranged.children, padding, padding);
  return { ...arranged, width: arranged.width + 2 * padding, height: arranged.height + 2 * padding };
}
