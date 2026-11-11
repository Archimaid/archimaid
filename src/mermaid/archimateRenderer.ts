import Elk, { type ElkExtendedEdge, type ElkNode, type ElkPoint } from "elkjs/lib/elk.bundled.js";
import type { MermaidConfig } from "mermaid";
import {
  getElementType,
  getRelationshipNotation,
} from "../archimate/catalogue.js";
import type { ArchiMateModel, ArchiMateNote } from "../archimate/model.js";
import type { ArchiMatePluginOptions } from "./archimateDetector.js";
import { placeArchitecture } from "./architectureLayout.js";
import { routeArchitecture, type RoutingNode } from "./orthogonalRouter.js";
import { archimatePalettes, resolveDiagramColours, type DiagramColours, type PaletteColours } from "./styles.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const layoutPadding = 24;
const strokeGutter = 2;
// Allow for the longest marker and its outline on low-padding diagrams.
const markerReach = 14;
const fontSize = 14;
const cornerRadius = 9;
const iconSize = 14;
const iconInset = 3;
const iconScale = iconSize / 16;
const iconLabelGap = 4;
const compoundLabelInset = 8;
const noteFold = 12;
const noteInset = 12;
const noteOverlap = 1;
const labelClass = "archimate-label";
const titleClass = `${labelClass} archimate-title`;
const edgeLabelClass = `${labelClass} archimate-edge-label`;
// ELK's CommonJS bundle exposes its constructor on module.exports.default.
const elk = new Elk.default();

const architectureRows = ["strategy", "business", "application", "technology", "implementationAndMigration"];
const layoutDirection = {
  TB: "DOWN",
  BT: "UP",
  LR: "RIGHT",
  RL: "LEFT",
} satisfies Record<ArchiMateModel["direction"], string>;

type Element = ArchiMateModel["elements"][number];
type Relationship = ArchiMateModel["relationships"][number];
type ElementType = NonNullable<ReturnType<typeof getElementType>>;
type Outline = NonNullable<ElementType["notation"]>["outline"];
type RelationshipNotation = NonNullable<ReturnType<typeof getRelationshipNotation>>;
type Marker = Exclude<RelationshipNotation["start"], "none">;
type MeasuredElkNode = ElkNode & { width: number; height: number; children?: MeasuredElkNode[] };

interface TextMetrics {
  lines: readonly string[];
  width: number;
  height: number;
  lineHeight: number;
}

interface NodeAppearance {
  element: Element;
  type: ElementType;
  notation: NonNullable<ElementType["notation"]>;
  label: TextMetrics;
  headerHeight: number;
  notesHeight: number;
}

interface NoteAppearance {
  note: ArchiMateNote;
  label: TextMetrics;
  width: number;
  height: number;
}

interface EdgeAppearance {
  relationship: Relationship;
  notation: RelationshipNotation;
  label: TextMetrics | undefined;
  overlayLane?: number;
}

interface PositionedNode extends ElkPoint {
  width: number;
  height: number;
}

interface EdgeEndpoint {
  box: PositionedNode;
  outline: Outline | "note";
  overlayHost?: PositionedNode;
}

type SvgAttributes = Record<string, string | number>;

function append<Tag extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: Tag,
  attrs: SvgAttributes = {},
): SVGElementTagNameMap[Tag] {
  const element = parent.ownerDocument.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, String(value));
  }
  parent.append(element);
  return element;
}

function getSvg(id: string, config: MermaidConfig | undefined): SVGSVGElement {
  const frame = config?.securityLevel === "sandbox" ? document.getElementById(`i${id}`) : null;
  const targetDocument = frame instanceof HTMLIFrameElement ? frame.contentDocument : document;
  const svg = targetDocument?.querySelector<SVGSVGElement>(`svg#${CSS.escape(id)}`);
  if (svg?.namespaceURI !== svgNamespace) {
    throw new Error("Mermaid did not create the ArchiMate SVG container.");
  }
  return svg;
}

function measureText(
  textElement: SVGTextElement,
  text: string,
  className: string,
  size: number,
  maxWidth?: number,
): TextMetrics {
  const lineHeight = Math.ceil(size * 1.3);
  textElement.setAttribute("class", className);
  const measure = (line: string) => {
    textElement.textContent = line;
    return textElement.getComputedTextLength() || Array.from(line).length * size;
  };
  const lines = text.split(/\r\n?|\n/u).flatMap((line) => {
    if (maxWidth === undefined || measure(line) <= maxWidth) {
      return [line];
    }

    const wrapped: string[] = [];
    let current = "";
    for (const word of line.trim().split(/\s+/u)) {
      const next = current ? `${current} ${word}` : word;
      if (current && measure(next) > maxWidth) {
        wrapped.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    wrapped.push(current);
    return wrapped;
  });
  const width = Math.max(...lines.map(measure));
  return { lines, width: Math.ceil(width), height: lines.length * lineHeight, lineHeight };
}

function drawText(
  parent: SVGElement,
  metrics: TextMetrics,
  className: string,
  centerX: number,
  centerY: number,
  colour: string,
): void {
  const label = append(parent, "text", {
    class: className,
    fill: colour,
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  for (const [index, line] of metrics.lines.entries()) {
    append(label, "tspan", {
      x: centerX,
      y: centerY + (index - (metrics.lines.length - 1) / 2) * metrics.lineHeight,
    }).textContent = line;
  }
}

function iconRightInset(outline: Outline): number {
  // Leave room for the diagonal at the top right of motivation figures.
  return outline === "chamfered" ? cornerRadius - iconInset + 1 : iconInset;
}

function positioned(node: ElkNode): PositionedNode {
  const { x, y, width, height } = node;
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    throw new Error("ELK did not return a position and size for an ArchiMate element.");
  }
  return { x, y, width, height };
}

function drawNode(
  graph: SVGGElement,
  { element, type, notation, label }: NodeAppearance,
  box: PositionedNode,
  compound: boolean,
  palette: PaletteColours,
): void {
  const { x, y, width, height } = box;
  const group = append(graph, "g", {
    transform: `translate(${x} ${y})`,
    "data-archimate-element": element.id,
    "data-archimate-type": element.type,
    "aria-label": `${type.name}: ${element.name}`,
  });
  append(group, "title").textContent = `${type.name}: ${element.name}`;
  if (element.description) {
    append(group, "desc").textContent = element.description;
  }

  const colours = element.type === "location" ? palette.location : palette.elements[type.category];
  const stroke: SvgAttributes = {
    class: "archimate-outline",
    fill: colours.fill,
    stroke: colours.stroke,
    "stroke-width": 1.25,
  };
  if (notation.outline === "chamfered") {
    const r = cornerRadius;
    append(group, "path", {
      ...stroke,
      d: `M ${r} 0 H ${width - r} L ${width} ${r} V ${height - r} L ${width - r} ${height} H ${r} L 0 ${height - r} V ${r} Z`,
    });
  } else {
    if (notation.outline === "grouping") {
      stroke["stroke-dasharray"] = "5 3";
    }
    append(group, "rect", {
      ...stroke,
      width,
      height,
      rx: notation.outline === "rounded" ? cornerRadius : 0,
    });
  }

  if (notation.icon?.length) {
    const icon = append(group, "g", {
      class: "archimate-icon",
      transform: `translate(${width - iconRightInset(notation.outline) - iconSize} ${iconInset}) scale(${iconScale})`,
      "aria-hidden": "true",
      stroke: colours.text,
      "stroke-width": 1.15,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    for (const path of notation.icon) {
      append(icon, "path", {
        d: path.d,
        fill: path.fill === "ink" ? colours.text : "none",
      });
    }
  }
  const labelY = compound ? compoundLabelInset + label.height / 2 : height / 2;
  drawText(group, label, labelClass, width / 2, labelY, colours.text);
}

function drawNote(
  graph: SVGGElement,
  { note, label }: NoteAppearance,
  box: PositionedNode,
  noteColours: PaletteColours["note"],
): void {
  const { x, y, width, height } = box;
  const group = append(graph, "g", {
    transform: `translate(${x} ${y})`,
    "data-archimate-note": note.id,
    "aria-label": note.text,
  });
  append(group, "title").textContent = note.text;
  append(group, "path", {
    class: "archimate-note-outline",
    d: `M 0 0 H ${width - noteFold} L ${width} ${noteFold} V ${height} H 0 Z`,
    fill: noteColours.fill,
    stroke: noteColours.stroke,
    "stroke-width": 1.25,
    "stroke-dasharray": "5 3",
    "stroke-linejoin": "round",
  });
  append(group, "path", {
    d: `M ${width - noteFold} 0 V ${noteFold} H ${width} Z`,
    fill: noteColours.fold,
  });
  append(group, "path", {
    d: `M ${width - noteFold} 0 V ${noteFold} H ${width}`,
    fill: "none",
    stroke: noteColours.stroke,
    "stroke-width": 1,
  });
  drawText(group, label, labelClass, width / 2, height / 2, noteColours.text);
}

const markerShapes = {
  filledDiamond: { d: "M 0 0 -6 -4 -12 0 -6 4 Z", fill: "relationship" },
  openDiamond: { d: "M 0 0 -6 -4 -12 0 -6 4 Z", fill: "canvas" },
  filledDot: { d: "M 0 0 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0 Z", fill: "relationship" },
  openArrow: { d: "M -8 -4 0 0 -8 4", fill: "none" },
  filledArrow: { d: "M 0 0 -9 -4 -9 4 Z", fill: "relationship" },
  openTriangle: { d: "M 0 0 -10 -5 -10 5 Z", fill: "canvas" },
  singleBarb: { d: "M -8 -4 0 0", fill: "none" },
} satisfies Record<Marker, { d: string; fill: "relationship" | "canvas" | "none" }>;

function markerReference(defs: SVGDefsElement, prefix: string, marker: Marker, colours: DiagramColours): string {
  const id = `${prefix}-${marker}`;
  if (!defs.querySelector(`#${id}`)) {
    const element = append(defs, "marker", {
      id,
      viewBox: "-14 -7 16 14",
      markerWidth: 16,
      markerHeight: 14,
      markerUnits: "userSpaceOnUse",
      orient: "auto-start-reverse",
      refX: 0,
      refY: 0,
    });
    const { d, fill } = markerShapes[marker];
    if (colours.relationshipOutline) {
      append(element, "path", {
        d, fill: "none", stroke: colours.relationshipOutline, "stroke-width": 3, "stroke-linejoin": "round",
      });
    }
    append(element, "path", {
      d,
      fill: fill === "none" ? "none" : colours[fill],
      stroke: colours.relationship,
      "stroke-width": 1,
      "stroke-linejoin": "round",
    });
  }
  return `url(#${id})`;
}

function clipCorner(
  point: ElkPoint,
  adjacent: ElkPoint,
  { box, outline }: EdgeEndpoint,
): ElkPoint {
  const horizontal = Math.abs(point.x - adjacent.x) > Math.abs(point.y - adjacent.y);
  if (outline === "note") {
    const cornerDistance = box.x + box.width - point.x + point.y - box.y;
    const inset = Math.max(0, noteFold - cornerDistance);
    return horizontal ? { x: point.x - inset, y: point.y } : { x: point.x, y: point.y + inset };
  }
  if (outline !== "rounded" && outline !== "chamfered") {
    return point;
  }

  const distance = horizontal
    ? Math.min(point.y - box.y, box.y + box.height - point.y)
    : Math.min(point.x - box.x, box.x + box.width - point.x);
  const delta = Math.max(0, cornerRadius - Math.max(0, distance));
  const inset = outline === "rounded"
    ? cornerRadius - Math.sqrt(cornerRadius ** 2 - delta ** 2)
    : delta;
  return horizontal
    ? { x: point.x + Math.sign(point.x - adjacent.x) * inset, y: point.y }
    : { x: point.x, y: point.y + Math.sign(point.y - adjacent.y) * inset };
}

function noteBoundary(box: PositionedNode, toward: ElkPoint): ElkPoint {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) {
    return { x: box.x + box.width, y: cy };
  }

  let scale = Math.min(box.width / (2 * Math.abs(dx)), box.height / (2 * Math.abs(dy)));
  if (dx - dy > 0) {
    // The fold clips the upper-right corner along x - y = right - top - fold.
    scale = Math.min(scale, ((box.width + box.height) / 2 - noteFold) / (dx - dy));
  }
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function edgeEndpoint(point: ElkPoint, adjacent: ElkPoint, endpoint: EdgeEndpoint): ElkPoint {
  if (endpoint.overlayHost) return noteBoundary(endpoint.box, adjacent);
  if (point.y >= endpoint.box.y) return clipCorner(point, adjacent, endpoint);

  // ELK includes the attached-note band in its box, but edges must meet the visible shape.
  const horizontal = point.y === adjacent.y;
  const y = endpoint.box.y + (horizontal ? Math.min(cornerRadius, endpoint.box.height / 2) : 0);
  return clipCorner({ x: point.x, y }, horizontal ? { x: adjacent.x, y } : adjacent, endpoint);
}

function routePoints(route: ElkExtendedEdge, source: EdgeEndpoint, target: EdgeEndpoint): ElkPoint[] {
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

  const routePath = points.filter((point, index) =>
    index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y,
  );
  const start = routePath[0];
  const next = routePath[1];
  const end = routePath.at(-1);
  const previous = routePath.at(-2);
  if (!start || !next || !end || !previous || visited.size !== sections.length) {
    throw new Error(`ELK returned an incomplete route for relationship "${route.id}".`);
  }

  routePath[0] = edgeEndpoint(start, next, source);
  routePath[routePath.length - 1] = edgeEndpoint(
    end, target.overlayHost ? routePath.at(-2) ?? previous : previous, target,
  );
  return routePath;
}

function overlayRoute(source: EdgeEndpoint, target: EdgeEndpoint, host: PositionedNode, lane: number): ElkPoint[] {
  const hostRight = host.x + host.width;
  // Attached notes end before the host's right edge. Put the channel in the layout padding.
  const channel = hostRight + noteInset + (layoutPadding - noteInset) * lane / 2;
  const port = ({ box, overlayHost }: EdgeEndpoint): ElkPoint => ({
    x: box.x + box.width,
    y: overlayHost
      ? box.y + box.height * (0.4 + 0.2 * lane)
      : host.y + cornerRadius + noteInset * lane,
  });
  const start = port(source);
  const end = port(target);
  return [start, { x: channel, y: start.y }, { x: channel, y: end.y }, end];
}

function drawEdge(
  graph: SVGGElement,
  defs: SVGDefsElement,
  prefix: string,
  { relationship, notation }: EdgeAppearance,
  points: readonly ElkPoint[],
  colours: DiagramColours,
): void {
  const segments = points.map(({ x, y }) => `${x} ${y}`);
  const attrs: SvgAttributes = {
    d: `M ${segments.join(" L ")}`,
    fill: "none",
    stroke: colours.relationship,
    "stroke-width": 1.3,
  };
  if (notation.line === "dashed") {
    attrs["stroke-dasharray"] = "6 4";
  } else if (notation.line === "dotted") {
    attrs["stroke-dasharray"] = "1 3";
    attrs["stroke-linecap"] = "round";
  }
  // White relationships can cross the light fill of a nested element.
  if (colours.relationshipOutline) {
    append(graph, "path", {
      ...attrs, stroke: colours.relationshipOutline, "stroke-width": 3.3, "aria-hidden": "true",
    });
  }
  if (notation.start !== "none") {
    attrs["marker-start"] = markerReference(defs, prefix, notation.start, colours);
  }
  if (notation.end !== "none") {
    attrs["marker-end"] = markerReference(defs, prefix, notation.end, colours);
  }
  const edge = append(graph, "path", {
    ...attrs, "data-archimate-relationship": relationship.id, "data-archimate-type": relationship.type,
  });
  append(edge, "title").textContent = relationship.label ?? relationship.type;
}

function labelNearRoute(label: PositionedNode, points: readonly ElkPoint[]): boolean {
  const centreX = label.x + label.width / 2;
  const centreY = label.y + label.height / 2;
  return points.some((start, index) => {
    const end = points[index + 1];
    if (!end) return false;
    const horizontal = Math.abs(start.x - end.x) >= Math.abs(start.y - end.y);
    const along = horizontal ? centreX : centreY;
    const from = horizontal ? start.x : start.y;
    const to = horizontal ? end.x : end.y;
    const across = horizontal
      ? Math.abs(centreY - (start.y + end.y) / 2) - label.height / 2
      : Math.abs(centreX - (start.x + end.x) / 2) - label.width / 2;
    return along >= Math.min(from, to) && along <= Math.max(from, to) && across >= 0 && across <= 8;
  });
}

function edgeLabelPosition(
  route: ElkExtendedEdge,
  points: readonly ElkPoint[],
  metrics: TextMetrics,
  layoutLabel: "use" | "check" | "ignore" | "architecture",
  obstacles: readonly PositionedNode[],
): ElkPoint {
  const width = metrics.width + 8;
  const { height } = metrics;
  const isClear = ({ x, y }: ElkPoint) => !obstacles.some((box) => x < box.x + box.width
    && x + width > box.x && y < box.y + box.height && y + height > box.y);
  const label = layoutLabel === "ignore" || layoutLabel === "architecture" ? undefined : route.labels?.[0];
  if (label?.x !== undefined && label.y !== undefined && (label.x !== 0 || label.y !== 0)) {
    const position = { x: label.x, y: label.y };
    if (layoutLabel === "use" || (isClear(position) && labelNearRoute({ ...position, width, height }, points))) {
      return position;
    }
  }
  // Labels beside a route leave short paths and their markers visible.
  const segments: { start: ElkPoint; end: ElkPoint; length: number }[] = [];
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1];
    const end = points[index];
    if (start && end) segments.push({ start, end, length: Math.hypot(end.x - start.x, end.y - start.y) });
  }
  segments.sort((a, b) => b.length - a.length);
  let fallback: ElkPoint | undefined;
  for (const { start, end } of segments) {
    const horizontal = Math.abs(start.x - end.x) >= Math.abs(start.y - end.y);
    const along = horizontal ? "x" : "y";
    const across = horizontal ? "y" : "x";
    const alongSize = horizontal ? width : height;
    const acrossSize = horizontal ? height : width;
    const preferred = (start[along] + end[along] - alongSize) / 2;
    const minimum = Math.min(start[along], end[along]) - alongSize / 2;
    const maximum = Math.max(start[along], end[along]) - alongSize / 2;
    const middle = (start[across] + end[across]) / 2;
    const sides = horizontal ? [middle - height - 4, middle + 4] : [middle + 4, middle - width - 4];
    const position = (coordinate: number, side: number) =>
      horizontal ? { x: coordinate, y: side } : { x: side, y: coordinate };
    const nearby = [0, -0.5, 0.5].flatMap((shift) =>
      sides.map((side) => position(preferred + shift * alongSize, side)));
    fallback ??= nearby[0];
    const nearbyClear = nearby.find(isClear);
    if (nearbyClear) return nearbyClear;
    if (layoutLabel !== "architecture") break;

    for (const side of sides) {
      const candidates = obstacles.flatMap((box) => {
        const acrossEnd = box[across] + (horizontal ? box.height : box.width);
        if (side >= acrossEnd || side + acrossSize <= box[across]) return [];
        return [box[along] - alongSize - 0.5, box[along] + (horizontal ? box.width : box.height) + 0.5];
      }).filter((coordinate) => coordinate >= minimum && coordinate <= maximum)
        .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
      const clear = candidates.map((coordinate) => position(coordinate, side)).find(isClear);
      if (clear) return clear;
    }
  }
  return fallback ?? { x: 0, y: 0 };
}

function drawEdgeLabel(graph: SVGGElement, metrics: TextMetrics, position: ElkPoint, colours: DiagramColours): void {
  const { x, y } = position;
  append(graph, "rect", { x, y, width: metrics.width + 8, height: metrics.height, fill: colours.canvas });
  drawText(graph, metrics, edgeLabelClass, x + (metrics.width + 8) / 2, y + metrics.height / 2, colours.text);
}

export async function renderArchiMate(
  model: ArchiMateModel,
  id: string,
  title: string,
  options: Required<ArchiMatePluginOptions>,
  config?: MermaidConfig,
): Promise<void> {
  const svg = getSvg(id, config);
  const palette = archimatePalettes[options.palette];
  const colours = resolveDiagramColours(config);
  const measure = append(svg, "text", { visibility: "hidden" });
  const nodes = new Map<string, NodeAppearance>();
  const notes = new Map<string, NoteAppearance>();
  const overlays = new Map<string, NoteAppearance[]>();
  const nodeIds = new Map<string, string>();
  const edges = new Map<string, EdgeAppearance>();
  const overlayLaneCounts = new Map<string, number>();
  const nested = new Set<string>();
  const nestingRelationships = new Set(model.nesting?.map(({ relationship }) => relationship));
  const architecture = model.layout === "architecture" || model.layout === "framework";
  let titleMetrics: TextMetrics | undefined;
  let layoutInput: ElkNode & { children: MeasuredElkNode[]; edges: ElkExtendedEdge[] };

  try {
    titleMetrics = title ? measureText(measure, title, titleClass, 17) : undefined;
    const children: MeasuredElkNode[] = [];
    for (const [index, note] of (model.notes ?? []).entries()) {
      const label = measureText(measure, note.text, labelClass, fontSize, 240);
      const appearance = {
        note, label,
        width: Math.max(124, label.width + 2 * (noteInset + noteFold)),
        height: Math.max(48, label.height + 2 * noteInset),
      };
      if (note.on !== undefined) {
        const attached = overlays.get(note.on);
        if (attached) attached.push(appearance);
        else overlays.set(note.on, [appearance]);
      } else {
        const id = `note${index}`;
        nodeIds.set(note.id, id);
        notes.set(id, appearance);
        children.push({ id, width: appearance.width, height: appearance.height });
      }
    }

    const elkNodes = new Map<string, MeasuredElkNode>();
    for (const [index, element] of model.elements.entries()) {
      const type = getElementType(element.type);
      if (!type?.notation) {
        throw new Error(`SVG notation for element type "${element.type}" is not implemented.`);
      }

      const internalId = `n${index}`;
      const label = measureText(measure, element.name, labelClass, fontSize);
      // Reserve the same space on both sides so centered labels clear the icon.
      const labelInset = type.notation.icon?.length
        ? iconRightInset(type.notation.outline) + iconSize + iconLabelGap
        : 14;
      const attached = overlays.get(element.id) ?? [];
      const notesHeight = attached.length
        ? attached.reduce((height, note) => height + note.height, 0)
          + (attached.length - 1) * noteInset - noteOverlap
        : 0;
      const headerHeight = Math.max(54, label.height + 20);
      const width = Math.max(124, label.width + 2 * labelInset,
        ...attached.map(({ width }) => width + 2 * noteInset));
      nodes.set(internalId, { element, type, notation: type.notation, label, headerHeight, notesHeight });
      nodeIds.set(element.id, internalId);
      elkNodes.set(element.id, { id: internalId, width, height: headerHeight + notesHeight });
      for (const { note } of attached) nodeIds.set(note.id, internalId);
    }

    for (const { parent, child } of model.nesting ?? []) {
      const container = elkNodes.get(parent);
      const member = elkNodes.get(child);
      const appearance = container && nodes.get(container.id);
      if (!container || !member || !appearance) {
        throw new Error(`Layout nodes for nesting "${child}" in "${parent}" are unavailable.`);
      }
      nested.add(member.id);
      if (!container.children) {
        container.children = [];
        const top = appearance.notesHeight + appearance.headerHeight;
        // ELK Layered reads compound minimum sizes in its horizontal coordinate system.
        const vertical = model.direction === "TB" || model.direction === "BT";
        const minimumSize = vertical
          ? `(${container.height},${container.width})`
          : `(${container.width},${container.height})`;
        container.layoutOptions = {
          "elk.padding": `[top=${top},left=${layoutPadding},bottom=${layoutPadding},right=${layoutPadding}]`,
          "elk.nodeSize.constraints": "MINIMUM_SIZE",
          "elk.nodeSize.minimum": minimumSize,
        };
      }
      container.children.push(member);
    }
    for (const node of elkNodes.values()) {
      if (!nested.has(node.id)) children.push(node);
    }

    const relationships: ElkExtendedEdge[] = [];
    for (const [index, relationship] of model.relationships.entries()) {
      if (nestingRelationships.has(relationship.id) && !relationship.label
        && (relationship.access === undefined || relationship.access === "unspecified")) {
        continue;
      }
      const source = nodeIds.get(relationship.source);
      const target = nodeIds.get(relationship.target);
      const notation = getRelationshipNotation(relationship.type, relationship.access, relationship.directed);
      if (!source || !target || !notation) {
        throw new Error(`SVG notation or endpoints for relationship "${relationship.id}" are unavailable.`);
      }

      const internalId = `e${index}`;
      const label = relationship.label ? measureText(measure, relationship.label, edgeLabelClass, 12) : undefined;
      const appearance: EdgeAppearance = { relationship, notation, label };
      if (source === target && relationship.source !== relationship.target) {
        const lane = overlayLaneCounts.get(source) ?? 0;
        appearance.overlayLane = lane;
        overlayLaneCounts.set(source, lane + 1);
      }
      edges.set(internalId, appearance);
      relationships.push({
        id: internalId,
        sources: [source],
        targets: [target],
        ...(label ? { labels: [{ id: `l${index}`, width: label.width + 8, height: label.height }] } : {}),
      });
    }
    layoutInput = {
      id: "archimate",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": layoutDirection[model.direction],
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.padding": `[top=${layoutPadding},left=${layoutPadding},bottom=${layoutPadding},right=${layoutPadding}]`,
        "elk.spacing.nodeNode": "38",
        "elk.layered.spacing.nodeNodeBetweenLayers": "76",
        "elk.json.shapeCoords": "ROOT",
        "elk.json.edgeCoords": "ROOT",
        ...(nested.size > 0 ? { "elk.hierarchyHandling": "INCLUDE_CHILDREN" } : {}),
      },
      children,
      edges: relationships,
    };
  } finally {
    measure.remove();
  }

  const layout: ElkNode = architecture
    ? { ...layoutInput, ...placeArchitecture(
      layoutInput.children,
      new Map(Array.from(nodes, ([key, { type, headerHeight, notesHeight }]) => [key, {
        row: type.category === "composite" ? null : type.category === "physical" ? "technology" : type.category,
        column: type.aspect === "motivation" ? null : type.aspect,
        headerHeight: headerHeight + notesHeight,
      }])),
      layoutInput.edges.flatMap(({ id: edgeId, sources: [source], targets: [target] }) => {
        const type = edges.get(edgeId)?.relationship.type;
        return source && target && type ? [{ source, target, type }] : [];
      }),
      {
        rowOrder: architectureRows,
        padding: layoutPadding,
        labelHeight: Array.from(edges.values()).reduce((height, edge) => Math.max(height, edge.label?.height ?? 0), 0),
        framework: model.layout === "framework",
      },
    ) }
    : await elk.layout(layoutInput);
  if (layout.width === undefined || layout.height === undefined) {
    throw new Error("ELK did not return the ArchiMate diagram size.");
  }

  const placedNodes: { appearance: NodeAppearance; box: PositionedNode; compound: boolean }[] = [];
  const placedNotes: { appearance: NoteAppearance; box: PositionedNode }[] = [];
  const nodeBoxes = new Map<string, EdgeEndpoint>();
  function placeNodes(children: readonly ElkNode[]): void {
    for (const node of children) {
      const layoutBox = positioned(node);
      const note = notes.get(node.id);
      if (note) {
        placedNotes.push({ appearance: note, box: layoutBox });
        nodeBoxes.set(note.note.id, { box: layoutBox, outline: "note" });
        continue;
      }
      const appearance = nodes.get(node.id);
      if (!appearance) {
        throw new Error("ELK returned an unknown ArchiMate element.");
      }
      const box = {
        ...layoutBox, y: layoutBox.y + appearance.notesHeight,
        height: layoutBox.height - appearance.notesHeight,
      };
      placedNodes.push({ appearance, box, compound: Boolean(node.children?.length) });
      nodeBoxes.set(appearance.element.id, { box, outline: appearance.notation.outline });
      let y = layoutBox.y;
      for (const attached of overlays.get(appearance.element.id) ?? []) {
        const position = {
          x: box.x + box.width - attached.width - noteInset, y,
          width: attached.width, height: attached.height,
        };
        placedNotes.push({ appearance: attached, box: position });
        nodeBoxes.set(attached.note.id, { box: position, outline: "note", overlayHost: box });
        y += attached.height + noteInset;
      }
      if (node.children) placeNodes(node.children);
    }
  }
  placeNodes(layout.children ?? []);
  let architectureRoutes: ReturnType<typeof routeArchitecture> | undefined;
  if (architecture) {
    const parents = new Map(model.nesting?.map(({ child, parent }) => [child, parent]));
    const noteHosts = new Map((model.notes ?? []).map((note) => [note.id, note.on]));
    const decorations = new Map(placedNodes.filter(({ compound }) => compound)
      .map(({ appearance: { element, label, notation }, box }) => {
        const titleBox = {
          x: box.x + (box.width - label.width) / 2, y: box.y + compoundLabelInset,
          width: label.width, height: label.height,
        };
        const iconBox = {
          x: box.x + box.width - iconRightInset(notation.outline) - iconSize, y: box.y + iconInset,
          width: iconSize, height: iconSize,
        };
        return [element.id, notation.icon?.length ? [titleBox, iconBox] : [titleBox]] as const;
      }));
    const routingNodes = new Map<string, RoutingNode>();
    for (const [key, endpoint] of nodeBoxes) {
      const parent = parents.get(noteHosts.get(key) ?? key);
      const obstacles = decorations.get(key);
      routingNodes.set(key, { box: endpoint.box, ...(parent && { parent }), ...(obstacles && { decorations: obstacles }) });
    }
    architectureRoutes = routeArchitecture(routingNodes, Array.from(edges).flatMap(([edgeId, appearance]) =>
      appearance.overlayLane === undefined
        ? [{ id: edgeId, source: appearance.relationship.source, target: appearance.relationship.target }]
        : []));
  }
  const labelObstacles = [
    ...placedNotes.map(({ box }) => box),
    ...placedNodes.map(({ appearance, box, compound }) => compound
      ? { ...box, height: compoundLabelInset + appearance.label.height }
      : box),
  ];
  const placedEdges = (layout.edges ?? []).map((route) => {
    const appearance = edges.get(route.id);
    if (!appearance) {
      throw new Error("ELK returned an unknown ArchiMate relationship.");
    }
    const source = nodeBoxes.get(appearance.relationship.source);
    const target = nodeBoxes.get(appearance.relationship.target);
    if (!source || !target) {
      throw new Error(`ELK did not position the endpoints of relationship "${appearance.relationship.id}".`);
    }
    const [sourceNode] = route.sources;
    const [targetNode] = route.targets;
    const host = source.overlayHost ?? target.overlayHost;
    const laneCount = sourceNode === undefined ? undefined : overlayLaneCounts.get(sourceNode);
    let points: ElkPoint[];
    if (host && laneCount && appearance.overlayLane !== undefined) {
      points = overlayRoute(source, target, host, (appearance.overlayLane + 1) / (laneCount + 1));
    } else if (architectureRoutes) {
      const path = architectureRoutes.get(route.id);
      const start = path?.[0];
      const next = path?.[1];
      const end = path?.at(-1);
      const previous = path?.at(-2);
      if (!path || !start || !next || !end || !previous) {
        throw new Error(`Missing architecture route for relationship "${appearance.relationship.id}".`);
      }
      points = path.slice();
      points[0] = clipCorner(start, next, source);
      points[points.length - 1] = clipCorner(end, previous, target);
    } else {
      points = routePoints(route, source, target);
    }
    const touchesNestedNode = nested.has(sourceNode ?? "") || nested.has(targetNode ?? "");
    const layoutLabel = architecture ? "architecture" : appearance.overlayLane !== undefined
      ? "ignore" : touchesNestedNode ? "check" : "use";
    const labelPosition = appearance.label
      ? edgeLabelPosition(route, points, appearance.label, layoutLabel, labelObstacles)
      : undefined;
    if (architecture && labelPosition && appearance.label) {
      labelObstacles.push({ ...labelPosition, width: appearance.label.width + 8, height: appearance.label.height });
    }
    return { appearance, points, labelPosition };
  });

  const prefix = `archimate-${Array.from(id, (char) => char.codePointAt(0)?.toString(16)).join("-")}`;
  const defs = append(svg, "defs");
  // ELK's fixed gutter keeps routing independent of the requested outer margin.
  let left = Math.min(layoutPadding, layout.width / 2);
  let top = Math.min(layoutPadding, layout.height / 2);
  let right = layout.width - left;
  let bottom = layout.height - top;
  const markerAnchors: ElkPoint[] = [];
  for (const { appearance, points, labelPosition } of placedEdges) {
    for (const { x, y } of points) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
    if (appearance.label && labelPosition) {
      left = Math.min(left, labelPosition.x);
      top = Math.min(top, labelPosition.y);
      right = Math.max(right, labelPosition.x + appearance.label.width + 8);
      bottom = Math.max(bottom, labelPosition.y + appearance.label.height);
    }
    const start = points[0];
    const end = points.at(-1);
    if (start && appearance.notation.start !== "none") markerAnchors.push(start);
    if (end && appearance.notation.end !== "none") markerAnchors.push(end);
  }
  const padding = Math.max(strokeGutter, options.diagramPadding);
  left -= padding;
  top -= padding;
  right += padding;
  bottom += padding;
  for (const { x, y } of markerAnchors) {
    left = Math.min(left, x - markerReach);
    top = Math.min(top, y - markerReach);
    right = Math.max(right, x + markerReach);
    bottom = Math.max(bottom, y + markerReach);
  }
  const graphWidth = right - left;
  const width = Math.max(graphWidth, (titleMetrics?.width ?? 0) + 2 * padding);
  const titleOffset = titleMetrics ? titleMetrics.height + 12 : 0;
  const height = Math.max(2 * padding, bottom - top + titleOffset);
  append(svg, "rect", { width, height, fill: colours.canvas, "aria-hidden": "true" });
  const graph = append(svg, "g", {
    transform: `translate(${(width - graphWidth) / 2 - left} ${titleOffset - top})`,
  });

  // Child routes need to be visible against their container backgrounds.
  for (const { appearance, box, compound } of placedNodes) {
    if (compound || appearance.notesHeight > 0) drawNode(graph, appearance, box, compound, palette);
  }
  for (const { appearance, points } of placedEdges) {
    drawEdge(graph, defs, prefix, appearance, points, colours);
  }
  for (const { appearance, box, compound } of placedNodes) {
    if (!compound && appearance.notesHeight === 0) drawNode(graph, appearance, box, false, palette);
  }
  for (const { appearance, box } of placedNotes) {
    drawNote(graph, appearance, box, palette.note);
  }
  for (const { appearance, labelPosition } of placedEdges) {
    if (appearance.label && labelPosition) {
      drawEdgeLabel(graph, appearance.label, labelPosition, colours);
    }
  }
  if (titleMetrics) {
    drawText(svg, titleMetrics, titleClass, width / 2, padding + titleMetrics.height / 2, colours.text);
  }

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (options.useMaxWidth) {
    svg.setAttribute("width", "100%");
    svg.style.maxWidth = `${width}px`;
    svg.style.height = "auto";
  } else {
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
  }
}
