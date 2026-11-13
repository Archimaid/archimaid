import { after } from 'node:test';
import { closeMermaidBrowser, renderStandaloneSvg, withMermaidPage } from '../../scripts/mermaid-browser.mjs';

after(closeMermaidBrowser);

export { renderStandaloneSvg, withMermaidPage };

// Pixel thresholds shared by the geometry tests.
export const POSITION_TOLERANCE = 0.01;
export const INTERIOR_INSET = 0.5;
export const DEFAULT_MAX_ROW_WIDTH = 1200;

// Renders a diagram and reads its geometry in the coordinates of the diagram's graph group, which elements,
// notes and relationships share. Boxes add each group's translation to its outline's box; relationship points
// are the raw path data, so equal coordinates compare exactly.
export function renderGeometry(page, id, source) {
  return page.evaluate(async ({ id, source }) => {
    const mermaid = await globalThis.archimateHost;
    const { svg } = await mermaid.render(id, source);
    const container = document.createElement('div');
    container.innerHTML = svg;
    document.body.append(container);
    try {
      const root = container.querySelector('svg');
      const box = (group, selector) => {
        const { x, y, width, height } = group.querySelector(selector).getBBox();
        const { e, f } = group.transform.baseVal.consolidate()?.matrix ?? { e: 0, f: 0 };
        return { left: x + e, top: y + f, right: x + e + width, bottom: y + f + height };
      };
      const elements = {};
      const titles = {};
      for (const group of container.querySelectorAll('[data-archimate-element]')) {
        elements[group.dataset.archimateElement] = box(group, '.archimate-outline');
        titles[group.dataset.archimateElement] = box(group, 'text');
      }
      const notes = Object.fromEntries(Array.from(container.querySelectorAll('[data-archimate-note]'),
        (group) => [group.dataset.archimateNote, box(group, '.archimate-note-outline')]));
      const edges = Object.fromEntries(Array.from(container.querySelectorAll('[data-archimate-relationship]'), (edge) => [
        edge.dataset.archimateRelationship,
        {
          type: edge.dataset.archimateType,
          points: edge.getAttribute('d').slice(2).split(' L ').map((pair) => {
            const [x, y] = pair.split(' ').map(Number);
            return { x, y };
          }),
          markerStart: edge.hasAttribute('marker-start'),
          markerEnd: edge.hasAttribute('marker-end'),
          dashOffset: edge.getAttribute('stroke-dashoffset'),
          length: edge.getTotalLength(),
        },
      ]));
      const labels = Array.from(container.querySelectorAll('.archimate-edge-label'), (label) => {
        const backing = label.previousElementSibling;
        const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((name) => Number(backing.getAttribute(name)));
        return { text: label.textContent, left: x, top: y, right: x + width, bottom: y + height };
      });
      const { width, height } = root.viewBox.baseVal;
      return { width, height, elements, titles, notes, edges, labels };
    } finally {
      container.remove();
    }
  }, { id, source });
}

export const segments = (points) => points.slice(1).map((end, index) => [points[index], end]);

export const orthogonal = (points) => segments(points).every(([a, b]) =>
  Math.abs(a.x - b.x) < POSITION_TOLERANCE || Math.abs(a.y - b.y) < POSITION_TOLERANCE);

export function segmentEntersInterior([a, b], { left, top, right, bottom }, inset = INTERIOR_INSET) {
  return Math.min(a.x, b.x) < right - inset && Math.max(a.x, b.x) > left + inset
    && Math.min(a.y, b.y) < bottom - inset && Math.max(a.y, b.y) > top + inset;
}

// A hub realizing 14 services: one rank too wide for a single row.
export const hubSource = ['archimate-beta', 'element applicationComponent hub "Hub"',
  ...Array.from({ length: 14 }, (_, index) =>
    `element applicationService s${index} "Service ${index}"\nhub ..|> s${index}`)].join('\n');
