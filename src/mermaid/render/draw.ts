import type { ElkPoint } from 'elkjs/lib/elk.bundled.js';
import type { ArchiMatePluginOptions } from '../archimateDetector.js';
import type { RouteBundle } from '../orthogonalRouter.js';
import type { DiagramColours, PaletteColours } from '../styles.js';
import type { PlacedEdge } from './labels.js';
import type { Placement } from './place.js';
import {
  cornerRadius,
  edgeLabelClass,
  edgeLabelPadding,
  iconInset,
  iconRightInset,
  iconScale,
  iconSize,
  labelClass,
  compoundLabelInset,
  noteFold,
  titleClass,
  type EdgeAppearance,
  type Marker,
  type NodeAppearance,
  type NoteAppearance,
  type PositionedNode,
  type TextMetrics,
} from './shared.js';
import { append, type SvgAttributes } from './svg.js';
import type { Viewport } from './viewport.js';

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
  const label = append(parent, 'text', {
    class: className,
    fill: colour,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    ...(hidden ? { 'aria-hidden': 'true' } : {}),
  });
  for (const [index, line] of metrics.lines.entries()) {
    append(label, 'tspan', {
      x: centerX,
      y: centerY + (index - (metrics.lines.length - 1) / 2) * metrics.lineHeight,
    }).textContent = line;
  }
}

function drawNode(
  graph: SVGElement,
  { element, type, notation, label }: NodeAppearance,
  box: PositionedNode,
  compound: boolean,
  palette: PaletteColours,
): void {
  const { x, y, width, height } = box;
  const { link } = element;
  const parent = link
    ? append(graph, 'a', {
        class: 'archimate-link',
        href: link.href,
        ...(link.target && { target: link.target }),
        ...(link.target === '_blank' && { rel: 'noopener noreferrer' }),
      })
    : graph;
  const group = append(parent, 'g', {
    transform: `translate(${x} ${y})`,
    'data-archimate-element': element.id,
    'data-archimate-type': element.type,
    role: 'graphics-symbol',
    'aria-roledescription': type.name,
    'aria-label': element.name,
  });
  // Browsers show the title as the tooltip.
  const details = link?.tooltip ?? element.description;
  append(group, 'title').textContent = `${type.name}: ${element.name}${details ? `\n${details}` : ''}`;
  if (element.description) {
    append(group, 'desc').textContent = element.description;
  }

  const colours = element.type === 'location' ? palette.location : palette.elements[type.category];
  const stroke: SvgAttributes = {
    class: 'archimate-outline',
    fill: colours.fill,
    stroke: colours.stroke,
    'stroke-width': 1.25,
  };
  if (notation.outline === 'chamfered') {
    const r = cornerRadius;
    append(group, 'path', {
      ...stroke,
      d: `M ${r} 0 H ${width - r} L ${width} ${r} V ${height - r} L ${width - r} ${height} H ${r} L 0 ${height - r} V ${r} Z`,
    });
  } else {
    if (notation.outline === 'grouping') {
      stroke['stroke-dasharray'] = '5 3';
    }
    append(group, 'rect', {
      ...stroke,
      width,
      height,
      rx: notation.outline === 'rounded' ? cornerRadius : 0,
    });
  }

  if (notation.icon?.length) {
    const icon = append(group, 'g', {
      class: 'archimate-icon',
      transform: `translate(${width - iconRightInset(notation.outline) - iconSize} ${iconInset}) scale(${iconScale})`,
      'aria-hidden': 'true',
      stroke: colours.text,
      'stroke-width': 1.15,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    for (const path of notation.icon) {
      append(icon, 'path', {
        d: path.d,
        fill: path.fill === 'ink' ? colours.text : 'none',
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
  noteColours: PaletteColours['note'],
): void {
  const { x, y, width, height } = box;
  const group = append(graph, 'g', {
    transform: `translate(${x} ${y})`,
    'data-archimate-note': note.id,
    role: 'graphics-symbol',
    'aria-roledescription': 'note',
    'aria-label': note.text,
  });
  append(group, 'title').textContent = note.text;
  append(group, 'path', {
    class: 'archimate-note-outline',
    d: `M 0 0 H ${width - noteFold} L ${width} ${noteFold} V ${height} H 0 Z`,
    fill: noteColours.fill,
    stroke: noteColours.stroke,
    'stroke-width': 1.25,
    'stroke-dasharray': '5 3',
    'stroke-linejoin': 'round',
  });
  append(group, 'path', {
    d: `M ${width - noteFold} 0 V ${noteFold} H ${width} Z`,
    fill: noteColours.fold,
  });
  append(group, 'path', {
    d: `M ${width - noteFold} 0 V ${noteFold} H ${width}`,
    fill: 'none',
    stroke: noteColours.stroke,
    'stroke-width': 1,
  });
  drawText(group, label, labelClass, width / 2, height / 2, noteColours.text, true);
}

const markerShapes = {
  filledDiamond: { d: 'M 0 0 -6 -4 -12 0 -6 4 Z', fill: 'relationship' },
  openDiamond: { d: 'M 0 0 -6 -4 -12 0 -6 4 Z', fill: 'canvas' },
  filledDot: { d: 'M 0 0 a 3.5 3.5 0 1 0 -7 0 a 3.5 3.5 0 1 0 7 0 Z', fill: 'relationship' },
  openArrow: { d: 'M -8 -4 0 0 -8 4', fill: 'none' },
  filledArrow: { d: 'M 0 0 -9 -4 -9 4 Z', fill: 'relationship' },
  openTriangle: { d: 'M 0 0 -10 -5 -10 5 Z', fill: 'canvas' },
  singleBarb: { d: 'M -8 -4 0 0', fill: 'none' },
} satisfies Record<Marker, { d: string; fill: 'relationship' | 'canvas' | 'none' }>;

function markerReference(defs: SVGDefsElement, prefix: string, marker: Marker, colours: DiagramColours): string {
  const id = `${prefix}-${marker}`;
  if (!defs.querySelector(`#${id}`)) {
    const element = append(defs, 'marker', {
      id,
      viewBox: '-14 -7 16 14',
      markerWidth: 16,
      markerHeight: 14,
      markerUnits: 'userSpaceOnUse',
      orient: 'auto-start-reverse',
      refX: 0,
      refY: 0,
    });
    const { d, fill } = markerShapes[marker];
    if (colours.relationshipOutline) {
      append(element, 'path', {
        d,
        fill: 'none',
        stroke: colours.relationshipOutline,
        'stroke-width': 3,
        'stroke-linejoin': 'round',
      });
    }
    append(element, 'path', {
      d,
      fill: fill === 'none' ? 'none' : colours[fill],
      stroke: colours.relationship,
      'stroke-width': 1,
      'stroke-linejoin': 'round',
    });
  }
  return `url(#${id})`;
}

function drawEdge(
  graph: SVGGElement,
  defs: SVGDefsElement,
  prefix: string,
  { relationship, notation, accessibleName }: EdgeAppearance,
  points: readonly ElkPoint[],
  colours: DiagramColours,
  pass: 'outline' | 'line' | 'both',
  bundle: RouteBundle | undefined,
): void {
  const segments = points.map(({ x, y }) => `${x} ${y}`);
  const attrs: SvgAttributes = {
    d: `M ${segments.join(' L ')}`,
    fill: 'none',
    stroke: colours.relationship,
    'stroke-width': 1.3,
  };
  if (notation.line === 'dashed') {
    attrs['stroke-dasharray'] = '6 4';
  } else if (notation.line === 'dotted') {
    attrs['stroke-dasharray'] = '1 3';
    attrs['stroke-linecap'] = 'round';
  }
  // Dashes start at the path's start. Members that share their end count the pattern back from it
  // instead, so the shared part shows one pattern rather than several out of phase.
  if (bundle?.sharedEnd === 'end' && notation.line !== 'solid') {
    attrs['stroke-dashoffset'] = -polylineLength(points);
  }
  // White relationships can cross the light fill of a nested element.
  if (colours.relationshipOutline && pass !== 'line') {
    append(graph, 'path', {
      ...attrs,
      stroke: colours.relationshipOutline,
      'stroke-width': 3.3,
      'aria-hidden': 'true',
    });
  }
  if (pass === 'outline') return;
  if (notation.start !== 'none') {
    attrs['marker-start'] = markerReference(defs, prefix, notation.start, colours);
  }
  if (notation.end !== 'none') {
    attrs['marker-end'] = markerReference(defs, prefix, notation.end, colours);
  }
  const edge = append(graph, 'path', {
    ...attrs,
    'data-archimate-relationship': relationship.id,
    'data-archimate-type': relationship.type,
    role: 'graphics-symbol',
    'aria-roledescription': 'relationship',
    'aria-label': accessibleName,
  });
  append(edge, 'title').textContent = accessibleName;
}

function polylineLength(points: readonly ElkPoint[]): number {
  return points.slice(1).reduce((length, point, index) => {
    const previous = points[index] ?? point;
    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function drawEdgeLabel(graph: SVGGElement, metrics: TextMetrics, position: ElkPoint, colours: DiagramColours): void {
  const { x, y } = position;
  append(graph, 'rect', {
    x,
    y,
    width: metrics.width + edgeLabelPadding,
    height: metrics.height,
    fill: colours.canvas,
    'aria-hidden': 'true',
  });
  drawText(
    graph,
    metrics,
    edgeLabelClass,
    x + (metrics.width + edgeLabelPadding) / 2,
    y + metrics.height / 2,
    colours.text,
    true,
  );
}

export interface DrawInputs {
  readonly id: string;
  readonly viewport: Viewport;
  readonly placement: Placement;
  readonly edges: readonly PlacedEdge[];
  readonly title: TextMetrics | undefined;
  readonly palette: PaletteColours;
  readonly colours: DiagramColours;
  readonly background: Required<ArchiMatePluginOptions>['background'];
}

export function drawDiagram(
  svg: SVGSVGElement,
  { id, viewport, placement, edges, title, palette, colours, background }: DrawInputs,
): void {
  const { width, height, graphWidth, left, top, titleOffset, padding } = viewport;
  const prefix = `archimate-${Array.from(id, (char) => char.codePointAt(0)?.toString(16)).join('-')}`;
  const defs = append(svg, 'defs');
  if (background === 'theme') {
    append(svg, 'rect', { width, height, fill: colours.canvas, 'aria-hidden': 'true' });
  }
  const graph = append(svg, 'g', {
    transform: `translate(${(width - graphWidth) / 2 - left} ${titleOffset - top})`,
  });

  // Child routes need to be visible against their container backgrounds.
  for (const { appearance, box, compound } of placement.elements) {
    if (compound || appearance.notesHeight > 0) drawNode(graph, appearance, box, compound, palette);
  }
  // Outlines of a bundle go below all of its lines, so one member's outline cannot cut a sibling's branch.
  const drawnBundles = new Set<string>();
  for (const { appearance, points, bundle } of edges) {
    if (!bundle) {
      drawEdge(graph, defs, prefix, appearance, points, colours, 'both', undefined);
      continue;
    }
    if (drawnBundles.has(bundle.id)) continue;
    drawnBundles.add(bundle.id);
    const members = edges.filter((edge) => edge.bundle?.id === bundle.id);
    for (const pass of ['outline', 'line'] as const) {
      for (const member of members)
        drawEdge(graph, defs, prefix, member.appearance, member.points, colours, pass, bundle);
    }
  }
  for (const { appearance, box, compound } of placement.elements) {
    if (!compound && appearance.notesHeight === 0) drawNode(graph, appearance, box, false, palette);
  }
  for (const { appearance, box } of placement.notes) {
    drawNote(graph, appearance, box, palette.note);
  }
  for (const { appearance, labelPosition } of edges) {
    if (appearance.label && labelPosition) {
      drawEdgeLabel(graph, appearance.label, labelPosition, colours);
    }
  }
  if (title) {
    drawText(svg, title, titleClass, width / 2, padding + title.height / 2, colours.text);
  }
}
