import type { ElkPoint } from 'elkjs/lib/elk.bundled.js';
import type { DiagramLayout } from './layout.js';
import type { PlacedEdge } from './labels.js';
import { edgeLabelPadding, layoutPadding, markerReach, strokeGutter, titleGap, type TextMetrics } from './shared.js';

export interface Viewport {
  readonly width: number;
  readonly height: number;
  // The drawing's own extent, centred within the width when the title is wider.
  readonly graphWidth: number;
  readonly left: number;
  readonly top: number;
  readonly titleOffset: number;
  readonly padding: number;
}

export function computeViewport(
  layout: DiagramLayout,
  edges: readonly PlacedEdge[],
  title: TextMetrics | undefined,
  diagramPadding: number,
): Viewport {
  // ELK's fixed gutter keeps routing independent of the requested outer margin.
  let left = Math.min(layoutPadding, layout.width / 2);
  let top = Math.min(layoutPadding, layout.height / 2);
  let right = layout.width - left;
  let bottom = layout.height - top;
  const markerAnchors: ElkPoint[] = [];
  for (const { appearance, points, labelPosition } of edges) {
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
    if (start && appearance.notation.start !== 'none') markerAnchors.push(start);
    if (end && appearance.notation.end !== 'none') markerAnchors.push(end);
  }
  const padding = Math.max(strokeGutter, diagramPadding);
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
  const width = Math.max(graphWidth, (title?.width ?? 0) + 2 * padding);
  const titleOffset = title ? title.height + titleGap : 0;
  const height = Math.max(2 * padding, bottom - top + titleOffset);
  return { width, height, graphWidth, left, top, titleOffset, padding };
}

export function applyViewport(svg: SVGSVGElement, { width, height }: Viewport, useMaxWidth: boolean): void {
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (useMaxWidth) {
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${width}px`;
    svg.style.height = 'auto';
  } else {
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
  }
}
