import type { ELK, ElkExtendedEdge, ElkNode, ElkPoint } from "elkjs/lib/elk.bundled.js";
import type { MermaidConfig } from "mermaid";
import {
  getElementType,
  getRelationshipNotation,
  relationshipNames,
  relationshipTypes,
  type AccessMode,
  type RelationshipType,
} from "../archimate/catalogue.js";
import type { ArchiMateModel, ArchiMateNote } from "../archimate/model.js";
import type { ArchiMatePluginOptions } from "./archimateDetector.js";
import type { ArchiMateLogger } from "./archimateDiagram.js";
import { placeArchitecture } from "./architectureLayout.js";
import { markerExtent, simplify } from "./geometry.js";
import { routeArchitecture, type RouteBundle, type RoutingNode } from "./orthogonalRouter.js";
import {
  archimatePalettes,
  resolveDiagramColours,
  resolveTypography,
  type DiagramColours,
  type PaletteColours,
} from "./styles.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const layoutPadding = 24;
const strokeGutter = 2;
// Allow for the longest marker and its outline on low-padding diagrams.
const markerReach = markerExtent;
const cornerRadius = 9;
const iconSize = 14;
const iconInset = 3;
const iconScale = iconSize / 16;
const iconLabelGap = 4;
const compoundLabelInset = 8;
const noteFold = 12;
const noteInset = 12;
const noteOverlap = 1;
const minimumElementWidth = 124;
const minimumHeaderHeight = 54;
const headerLabelPadding = 20;
// Labels without an icon keep this much room on each side.
const plainLabelInset = 14;
const minimumNoteHeight = 48;
// Horizontal padding around a relationship label inside its backing.
const edgeLabelPadding = 8;
const titleGap = 12;
const lineHeightFactor = 1.3;
// ELK gaps between elements in a layer and between layers, tuned for orthogonal routes and their labels.
const elkNodeSpacing = 38;
const elkLayerSpacing = 76;
const nameWrapWidth = 200;
const edgeLabelWrapWidth = 180;
const noteWrapWidth = 240;
const labelClass = "archimate-label";
const titleClass = `${labelClass} archimate-title`;
const edgeLabelClass = `${labelClass} archimate-edge-label`;

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
  accessibleName: string;
  notation: RelationshipNotation;
  label: TextMetrics | undefined;
  overlayLane?: number;
  overlayKey?: string;
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
type ElkConstructor = new () => ELK;

function isElkConstructor(value: unknown): value is ElkConstructor {
  return typeof value === "function";
}

function property(value: unknown, name: string): unknown {
  return (typeof value === "object" || typeof value === "function") && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

// ELK ships a CommonJS bundle that marks itself as an ES module. Depending on the bundler, the default
// import is the constructor itself or module.exports with the constructor on its default property.
export function resolveElkConstructor(loaded: unknown): ElkConstructor {
  const constructor = [loaded, property(loaded, "default"), property(property(loaded, "default"), "default")]
    .find(isElkConstructor);
  if (!constructor) {
    throw new Error("The elkjs module did not provide its layout constructor.");
  }
  return constructor;
}

let elkInstance: Promise<ELK> | undefined;

// Only graph layout needs ELK, so the 1.5 MB bundle loads on first use.
function loadElk(): Promise<ELK> {
  elkInstance ??= import("elkjs/lib/elk.bundled.js")
    .then((loaded) => new (resolveElkConstructor(loaded))())
    .catch((error: unknown) => {
      elkInstance = undefined;
      throw error;
    });
  return elkInstance;
}

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

// Lets the browser normalise any CSS colour, such as a named colour, to rgb() or rgba().
function browserColour(svg: SVGSVGElement, colour: string): string | undefined {
  const view = svg.ownerDocument.defaultView;
  if (!view) return undefined;
  const probe = append(svg, "g", { visibility: "hidden" });
  try {
    probe.style.color = colour;
    return probe.style.color ? view.getComputedStyle(probe).color : undefined;
  } finally {
    probe.remove();
  }
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

function breakWord(word: string, maxWidth: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  let current = "";
  // Hyphens and underscores stay at the end of a line, where readers expect a continuation.
  for (const piece of word.split(/(?<=[-_])/u)) {
    if (measure(current + piece) <= maxWidth) {
      current += piece;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    if (measure(piece) <= maxWidth) {
      current = piece;
      continue;
    }
    for (const character of Array.from(piece)) {
      if (current && measure(current + character) > maxWidth) {
        lines.push(current);
        current = character;
      } else {
        current += character;
      }
    }
  }
  lines.push(current);
  return lines;
}

function measureText(
  textElement: SVGTextElement,
  text: string,
  className: string,
  size: number,
  maxWidth?: number,
): TextMetrics {
  const lineHeight = Math.ceil(size * lineHeightFactor);
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
    // Non-breaking spaces are an author's request to keep words on one line.
    for (const word of line.trim().split(/[^\S\u00a0\u2007\u202f]+/u)) {
      const next = current ? `${current} ${word}` : word;
      if (!current || measure(next) <= maxWidth) {
        current = next;
      } else {
        wrapped.push(current);
        current = word;
      }
      if (measure(current) > maxWidth) {
        const pieces = breakWord(current, maxWidth, measure);
        current = pieces.pop() ?? "";
        wrapped.push(...pieces);
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
  // Text already named by an accessible group or relationship would otherwise be announced twice.
  hidden = false,
): void {
  const label = append(parent, "text", {
    class: className,
    fill: colour,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    ...(hidden ? { "aria-hidden": "true" } : {}),
  });
  for (const [index, line] of metrics.lines.entries()) {
    append(label, "tspan", {
      x: centerX,
      y: centerY + (index - (metrics.lines.length - 1) / 2) * metrics.lineHeight,
    }).textContent = line;
  }
}

function isRelationshipType(type: string): type is RelationshipType {
  return (relationshipTypes as readonly string[]).includes(type);
}

const accessModeWords = {
  read: "read",
  write: "write",
  readWrite: "read and write",
  unspecified: undefined,
} satisfies Record<AccessMode, string | undefined>;

// Relationships drawn alike may share a line, so the kind includes the access mode and direction.
function relationshipKind({ type, access, directed }: Relationship): string {
  return JSON.stringify([type, access ?? "unspecified", directed ?? false]);
}

function relationshipDescription(relationship: Relationship, names: ReadonlyMap<string, string>): string {
  const typeName = isRelationshipType(relationship.type) ? relationshipNames[relationship.type] : relationship.type;
  const mode = relationship.type === "access" ? accessModeWords[relationship.access ?? "unspecified"] : undefined;
  const qualifier = mode ? ` (${mode})` : relationship.type === "association" && relationship.directed ? " (directed)" : "";
  const source = names.get(relationship.source) ?? relationship.source;
  const target = names.get(relationship.target) ?? relationship.target;
  const description = `${source} — ${typeName}${qualifier} → ${target}`;
  return relationship.label ? `${description}: ${relationship.label}` : description;
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
    role: "graphics-symbol",
    "aria-roledescription": type.name,
    "aria-label": element.name,
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
  drawText(group, label, labelClass, width / 2, labelY, colours.text, true);
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
    role: "graphics-symbol",
    "aria-roledescription": "note",
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
  drawText(group, label, labelClass, width / 2, height / 2, noteColours.text, true);
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

  if (start.x === next.x && (next.y < start.y) === bandAbove) {
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

function entersBox(start: ElkPoint, end: ElkPoint, box: PositionedNode): boolean {
  return Math.min(start.x, end.x) < box.x + box.width - 0.5 && Math.max(start.x, end.x) > box.x + 0.5
    && Math.min(start.y, end.y) < box.y + box.height - 0.5 && Math.max(start.y, end.y) > box.y + 0.5;
}

function slideAlongSide(box: PositionedNode, point: ElkPoint, axis: "x" | "y", value: number): ElkPoint | undefined {
  const across = axis === "x" ? "y" : "x";
  const low = box[across];
  const high = box[across] + (axis === "x" ? box.height : box.width);
  const sideValue = Math.abs(point[across] - low) <= Math.abs(point[across] - high) ? low : high;
  const start = box[axis] + cornerRadius;
  const end = box[axis] + (axis === "x" ? box.width : box.height) - cornerRadius;
  if (value < start || value > end) return undefined;
  return axis === "x" ? { x: value, y: sideValue } : { x: sideValue, y: value };
}

// ELK does not see attached notes and compound titles, so move segments that cross them sideways.
function clearDecorations(
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
    const axis = start.x === end.x ? "x" : "y";
    const size = axis === "x" ? obstacle.width : obstacle.height;
    const values = [obstacle[axis] - clearance, obstacle[axis] + size + clearance]
      .sort((a, b) => Math.abs(a - start[axis]) - Math.abs(b - start[axis]));
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
  return simplify([start, { x: middle, y: start.y }, { x: middle, y: next.y }, next, ...(after ? [after] : []), ...rest]);
}

function overlayRoute(source: EdgeEndpoint, target: EdgeEndpoint, host: PositionedNode, lane: number): ElkPoint[] {
  const hostRight = host.x + host.width;
  // Attached notes end before the host's right edge. Put the channel in the layout padding.
  const channel = hostRight + noteInset + (layoutPadding - noteInset) * lane / 2;
  const port = ({ box, overlayHost }: EdgeEndpoint): ElkPoint => ({
    x: box.x + box.width,
    y: overlayHost
      ? box.y + box.height * (0.4 + 0.2 * lane)
      : Math.min(Math.max(host.y + cornerRadius + noteInset * lane, box.y + cornerRadius),
        box.y + box.height - cornerRadius),
  });
  const start = port(source);
  const end = port(target);
  return [start, { x: channel, y: start.y }, { x: channel, y: end.y }, end];
}

function drawEdge(
  graph: SVGGElement,
  defs: SVGDefsElement,
  prefix: string,
  { relationship, notation, accessibleName }: EdgeAppearance,
  points: readonly ElkPoint[],
  colours: DiagramColours,
  pass: "outline" | "line" | "both",
  bundle: RouteBundle | undefined,
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
  // Dashes start at the path's start. Members that share their end count the pattern back from it
  // instead, so the shared part shows one pattern rather than several out of phase.
  if (bundle?.sharedEnd === "end" && notation.line !== "solid") {
    attrs["stroke-dashoffset"] = -polylineLength(points);
  }
  // White relationships can cross the light fill of a nested element.
  if (colours.relationshipOutline && pass !== "line") {
    append(graph, "path", {
      ...attrs, stroke: colours.relationshipOutline, "stroke-width": 3.3, "aria-hidden": "true",
    });
  }
  if (pass === "outline") return;
  if (notation.start !== "none") {
    attrs["marker-start"] = markerReference(defs, prefix, notation.start, colours);
  }
  if (notation.end !== "none") {
    attrs["marker-end"] = markerReference(defs, prefix, notation.end, colours);
  }
  const edge = append(graph, "path", {
    ...attrs,
    "data-archimate-relationship": relationship.id,
    "data-archimate-type": relationship.type,
    role: "graphics-symbol",
    "aria-roledescription": "relationship",
    "aria-label": accessibleName,
  });
  append(edge, "title").textContent = accessibleName;
}

function polylineLength(points: readonly ElkPoint[]): number {
  return points.slice(1).reduce((length, point, index) => {
    const previous = points[index] ?? point;
    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

// How far along a segment, from its start, other paths run on top of it.
function coveredFrom(start: ElkPoint, end: ElkPoint, others: readonly (readonly ElkPoint[])[]): number {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const vertical = start.x === end.x;
  const direction = vertical ? Math.sign(end.y - start.y) : Math.sign(end.x - start.x);
  let covered = 0;
  for (const path of others) {
    for (let index = 1; index < path.length; index++) {
      const a = path[index - 1];
      const b = path[index];
      if (!a || !b) continue;
      const onLine = vertical ? a.x === start.x && b.x === start.x : a.y === start.y && b.y === start.y;
      if (!onLine) continue;
      const from = vertical ? start.y : start.x;
      const low = Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x);
      const high = Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x);
      if (from < low || from > high) continue;
      covered = Math.max(covered, Math.min(length, direction > 0 ? high - from : from - low));
    }
  }
  return covered;
}

// The part of a bundled path that no sibling shares, starting where it leaves the common trunk.
function unsharedBranch(
  points: readonly ElkPoint[], siblings: readonly (readonly ElkPoint[])[], sharedEnd: "start" | "end",
): ElkPoint[] {
  const path = sharedEnd === "start" ? [...points] : points.toReversed();
  const others = sharedEnd === "start" ? siblings : siblings.map((sibling) => sibling.toReversed());
  for (let index = 1; index < path.length; index++) {
    const start = path[index - 1];
    const end = path[index];
    if (!start || !end) continue;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    const covered = coveredFrom(start, end, others);
    if (covered >= length) continue;
    const fraction = covered / length;
    const split = { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
    const branch = [split, ...path.slice(index)];
    return sharedEnd === "start" ? branch : branch.toReversed();
  }
  return [...points];
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
  const width = metrics.width + edgeLabelPadding;
  const { height } = metrics;
  const isClear = ({ x, y }: ElkPoint) => !obstacles.some((box) => x < box.x + box.width
    && x + width > box.x && y < box.y + box.height && y + height > box.y);
  const label = layoutLabel === "ignore" || layoutLabel === "architecture" ? undefined : route.labels?.[0];
  if (label?.x !== undefined && label.y !== undefined && (label.x !== 0 || label.y !== 0)) {
    const position = { x: label.x, y: label.y };
    if (isClear(position) && (layoutLabel === "use" || labelNearRoute({ ...position, width, height }, points))) {
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
  append(graph, "rect", {
    x, y, width: metrics.width + edgeLabelPadding, height: metrics.height, fill: colours.canvas, "aria-hidden": "true",
  });
  drawText(graph, metrics, edgeLabelClass, x + (metrics.width + edgeLabelPadding) / 2, y + metrics.height / 2,
    colours.text, true);
}

export async function renderArchiMate(
  model: ArchiMateModel,
  id: string,
  title: string,
  options: Required<ArchiMatePluginOptions>,
  config?: MermaidConfig,
  logger?: ArchiMateLogger,
): Promise<void> {
  const svg = getSvg(id, config);
  const palette = archimatePalettes[options.palette];
  const colours = resolveDiagramColours(config, (colour) => browserColour(svg, colour));
  const typography = resolveTypography(config?.theme, config?.themeVariables);
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
  const parents = new Map(model.nesting?.map(({ child, parent }) => [child, parent]));
  const noteHosts = new Map((model.notes ?? []).map((note) => [note.id, note.on]));
  // Relationships leave upward in BT, so attached notes sit on the entry side, mirroring TB.
  const notesBelow = !architecture && model.direction === "BT";
  let titleMetrics: TextMetrics | undefined;
  let layoutInput: ElkNode & { children: MeasuredElkNode[]; edges: ElkExtendedEdge[] };

  try {
    titleMetrics = title ? measureText(measure, title, titleClass, typography.titleSize) : undefined;
    const children: MeasuredElkNode[] = [];
    for (const [index, note] of (model.notes ?? []).entries()) {
      const label = measureText(measure, note.text, labelClass, typography.labelSize, noteWrapWidth);
      const appearance = {
        note, label,
        width: Math.max(minimumElementWidth, label.width + 2 * (noteInset + noteFold)),
        height: Math.max(minimumNoteHeight, label.height + 2 * noteInset),
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
      const label = measureText(measure, element.name, labelClass, typography.labelSize, nameWrapWidth);
      // Reserve the same space on both sides so centered labels clear the icon.
      const labelInset = type.notation.icon?.length
        ? iconRightInset(type.notation.outline) + iconSize + iconLabelGap
        : plainLabelInset;
      const attached = overlays.get(element.id) ?? [];
      const notesHeight = attached.length
        ? attached.reduce((height, note) => height + note.height, 0)
          + (attached.length - 1) * noteInset - noteOverlap
        : 0;
      const headerHeight = Math.max(minimumHeaderHeight, label.height + headerLabelPadding);
      const width = Math.max(minimumElementWidth, label.width + 2 * labelInset,
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
        const top = appearance.headerHeight + (notesBelow ? 0 : appearance.notesHeight);
        const bottom = layoutPadding + (notesBelow ? appearance.notesHeight : 0);
        // ELK Layered reads compound minimum sizes in its horizontal coordinate system.
        const vertical = model.direction === "TB" || model.direction === "BT";
        const minimumSize = vertical
          ? `(${container.height},${container.width})`
          : `(${container.width},${container.height})`;
        container.layoutOptions = {
          "elk.padding": `[top=${top},left=${layoutPadding},bottom=${bottom},right=${layoutPadding}]`,
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
    const encloses = (outer: string, inner: string | undefined): boolean => {
      for (let parent = parents.get(inner ?? ""); parent !== undefined; parent = parents.get(parent)) {
        if (parent === outer) return true;
      }
      return false;
    };
    const nestedWithHost = (note: string, other: string): boolean => {
      const host = noteHosts.get(note);
      return host !== undefined && (encloses(other, host) || encloses(host, other));
    };
    const endpointNames = new Map([
      ...model.elements.map(({ id, name }) => [id, name] as const),
      ...(model.notes ?? []).map(({ id, text }) => [id, text] as const),
    ]);
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
      const label = relationship.label
        ? measureText(measure, relationship.label, edgeLabelClass, typography.edgeLabelSize, edgeLabelWrapWidth)
        : undefined;
      const appearance: EdgeAppearance = {
        relationship, notation, label, accessibleName: relationshipDescription(relationship, endpointNames),
      };
      // A route between an attached note and a container or member of its host would have to cross the host.
      const enclosed = !architecture && (nestedWithHost(relationship.source, relationship.target)
        || nestedWithHost(relationship.target, relationship.source));
      if ((source === target && relationship.source !== relationship.target) || enclosed) {
        const host = enclosed ? nodeIds.get(noteHosts.get(relationship.source) ?? noteHosts.get(relationship.target) ?? "")
          : source;
        if (host === undefined) {
          throw new Error(`The host of the attached note in relationship "${relationship.id}" is unavailable.`);
        }
        const lane = overlayLaneCounts.get(host) ?? 0;
        appearance.overlayLane = lane;
        appearance.overlayKey = host;
        overlayLaneCounts.set(host, lane + 1);
      }
      edges.set(internalId, appearance);
      relationships.push({
        id: internalId,
        sources: [source],
        targets: [target],
        ...(label ? { labels: [{ id: `l${index}`, width: label.width + edgeLabelPadding, height: label.height }] } : {}),
      });
    }
    layoutInput = {
      id: "archimate",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": layoutDirection[model.direction],
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.padding": `[top=${layoutPadding},left=${layoutPadding},bottom=${layoutPadding},right=${layoutPadding}]`,
        "elk.spacing.nodeNode": String(elkNodeSpacing),
        "elk.layered.spacing.nodeNodeBetweenLayers": String(elkLayerSpacing),
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
        maxRowWidth: options.maxRowWidth,
      },
    ) }
    : await (await loadElk()).layout(layoutInput);
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
        ...layoutBox, y: layoutBox.y + (notesBelow ? 0 : appearance.notesHeight),
        height: layoutBox.height - appearance.notesHeight,
      };
      placedNodes.push({ appearance, box, compound: Boolean(node.children?.length) });
      nodeBoxes.set(appearance.element.id, { box, outline: appearance.notation.outline });
      let y = notesBelow ? box.y + box.height - noteOverlap : layoutBox.y;
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
  let architectureRoutes: ReturnType<typeof routeArchitecture> | undefined;
  if (architecture) {
    const routingNodes = new Map<string, RoutingNode>();
    for (const [key, endpoint] of nodeBoxes) {
      const parent = parents.get(noteHosts.get(key) ?? key);
      const obstacles = decorations.get(key);
      routingNodes.set(key, { box: endpoint.box, ...(parent && { parent }), ...(obstacles && { decorations: obstacles }) });
    }
    architectureRoutes = routeArchitecture(routingNodes, Array.from(edges).flatMap(([edgeId, appearance]) =>
      appearance.overlayLane === undefined
        ? [{
          id: edgeId,
          source: appearance.relationship.source,
          target: appearance.relationship.target,
          sourceMarker: appearance.notation.start !== "none",
          targetMarker: appearance.notation.end !== "none",
          ...(noteHosts.has(appearance.relationship.source) || noteHosts.has(appearance.relationship.target)
            ? {}
            : { kind: relationshipKind(appearance.relationship) }),
        }]
        : []), logger);
  }
  const labelObstacles = [
    ...placedNotes.map(({ box }) => box),
    ...placedNodes.map(({ appearance, box, compound }) => compound
      ? { ...box, height: compoundLabelInset + appearance.label.height }
      : box),
  ];
  const routedEdges = (layout.edges ?? []).map((route) => {
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
    const laneCount = appearance.overlayKey === undefined ? undefined : overlayLaneCounts.get(appearance.overlayKey);
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
      const { source: sourceId, target: targetId } = appearance.relationship;
      const containers = new Set<string>();
      for (const id of [noteHosts.get(sourceId) ?? sourceId, noteHosts.get(targetId) ?? targetId]) {
        for (let parent = parents.get(id); parent !== undefined; parent = parents.get(parent)) containers.add(parent);
      }
      points = clearDecorations(
        routePoints(route, source, target),
        [...placedNotes.filter(({ appearance: { note } }) => note.id !== sourceId && note.id !== targetId)
          .map(({ box }) => box), ...Array.from(decorations.values()).flat()],
        placedNodes.filter(({ appearance: { element } }) => !containers.has(element.id)).map(({ box }) => box),
        source, target,
      );
    }
    const touchesNestedNode = nested.has(sourceNode ?? "") || nested.has(targetNode ?? "");
    const layoutLabel = architecture ? "architecture" : appearance.overlayLane !== undefined
      ? "ignore" : touchesNestedNode ? "check" : "use";
    return { route, appearance, points, layoutLabel, bundle: architectureRoutes?.bundles.get(route.id) } as const;
  });
  const placedEdges = routedEdges.map(({ route, appearance, points, layoutLabel, bundle }) => {
    const selfLoop = architecture && appearance.relationship.source === appearance.relationship.target;
    const siblings = bundle
      ? routedEdges.filter((other) => other.bundle?.id === bundle.id && other.route.id !== route.id)
        .map((other) => other.points)
      : [];
    // A loop's label belongs beside its outer segment, away from the element it returns to. A bundled
    // relationship's label belongs on its own branch, where it cannot be mistaken for its siblings'.
    const labelPoints = selfLoop ? points.slice(1, 3)
      : bundle ? unsharedBranch(points, siblings, bundle.sharedEnd) : points;
    const labelPosition = appearance.label
      ? edgeLabelPosition(route, labelPoints, appearance.label, layoutLabel, labelObstacles)
      : undefined;
    if (architecture && labelPosition && appearance.label) {
      labelObstacles.push({
        ...labelPosition, width: appearance.label.width + edgeLabelPadding, height: appearance.label.height,
      });
    }
    return { appearance, points, labelPosition, bundle };
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
      right = Math.max(right, labelPosition.x + appearance.label.width + edgeLabelPadding);
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
  const titleOffset = titleMetrics ? titleMetrics.height + titleGap : 0;
  const height = Math.max(2 * padding, bottom - top + titleOffset);
  if (options.background === "theme") {
    append(svg, "rect", { width, height, fill: colours.canvas, "aria-hidden": "true" });
  }
  const graph = append(svg, "g", {
    transform: `translate(${(width - graphWidth) / 2 - left} ${titleOffset - top})`,
  });

  // Child routes need to be visible against their container backgrounds.
  for (const { appearance, box, compound } of placedNodes) {
    if (compound || appearance.notesHeight > 0) drawNode(graph, appearance, box, compound, palette);
  }
  // Outlines of a bundle go below all of its lines, so one member's outline cannot cut a sibling's branch.
  const drawnBundles = new Set<string>();
  for (const { appearance, points, bundle } of placedEdges) {
    if (!bundle) {
      drawEdge(graph, defs, prefix, appearance, points, colours, "both", undefined);
      continue;
    }
    if (drawnBundles.has(bundle.id)) continue;
    drawnBundles.add(bundle.id);
    const members = placedEdges.filter((edge) => edge.bundle?.id === bundle.id);
    for (const pass of ["outline", "line"] as const) {
      for (const member of members) drawEdge(graph, defs, prefix, member.appearance, member.points, colours, pass, bundle);
    }
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
