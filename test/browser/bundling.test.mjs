import assert from 'node:assert/strict';
import test from 'node:test';
import { withMermaidPage } from '../../scripts/mermaid-browser.mjs';

// Elements and relationships share the graph group's coordinates, so raw path data compares exactly.
function geometry(page, id, source) {
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
        const { e, f } = group.transform.baseVal.consolidate().matrix;
        return { left: x + e, top: y + f, right: x + e + width, bottom: y + f + height };
      };
      const elements = Object.fromEntries(Array.from(container.querySelectorAll('[data-archimate-element]'),
        (group) => [group.dataset.archimateElement, box(group, '.archimate-outline')]));
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
          dashOffset: edge.getAttribute('stroke-dashoffset'),
          length: edge.getTotalLength(),
        },
      ]));
      const labels = Array.from(container.querySelectorAll('.archimate-edge-label'), (label) => {
        const backing = label.previousElementSibling;
        const [x, y, width, height] = ['x', 'y', 'width', 'height'].map((name) => Number(backing.getAttribute(name)));
        return { text: label.textContent, left: x, top: y, right: x + width, bottom: y + height };
      });
      return { width: root.viewBox.baseVal.width, elements, notes, edges, labels };
    } finally {
      container.remove();
    }
  }, { id, source });
}

const segments = (points) => points.slice(1).map((end, index) => [points[index], end]);
const horizontal = ([a, b]) => a.y === b.y;

function entersBox([a, b], { left, top, right, bottom }) {
  return Math.min(a.x, b.x) < right - 0.5 && Math.max(a.x, b.x) > left + 0.5
    && Math.min(a.y, b.y) < bottom - 0.5 && Math.max(a.y, b.y) > top + 0.5;
}

// Collinear segments that share more than a point.
function overlapLength([a, b], [c, d]) {
  if (horizontal([a, b]) && horizontal([c, d]) && a.y === c.y) {
    return Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
  }
  if (!horizontal([a, b]) && !horizontal([c, d]) && a.x === c.x) {
    return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
  }
  return 0;
}

function properCrossing(first, second) {
  const [h, v] = horizontal(first) ? [first, second] : [second, first];
  if (!horizontal(h) || horizontal(v)) return false;
  const between = (value, a, b) => Math.min(a, b) < value && value < Math.max(a, b);
  return between(v[0].x, h[0].x, h[1].x) && between(h[0].y, v[0].y, v[1].y);
}

function sideOf(box, { x, y }) {
  if (x === box.left) return 'left';
  if (x === box.right) return 'right';
  if (y === box.top) return 'top';
  if (y === box.bottom) return 'bottom';
  return undefined;
}

function assertClearOfElements(rendered, label, ignore = () => false) {
  for (const [id, { points }] of Object.entries(rendered.edges)) {
    for (const segment of segments(points)) {
      for (const [element, box] of Object.entries(rendered.elements)) {
        if (ignore(id, element)) continue;
        assert.equal(entersBox(segment, box), false, `${label}: ${id} crosses ${element}`);
      }
    }
  }
}

const hubSource = ['archimate-beta', 'element applicationComponent hub "Hub"',
  ...Array.from({ length: 14 }, (_, index) =>
    `element applicationService s${index} "Service ${index}"\nhub ..|> s${index}`)].join('\n');

const mixedSource = `archimate-beta
element applicationComponent hub "Hub"
${Array.from({ length: 8 }, (_, index) => `element businessProcess a${index + 1} "App ${index + 1}"`).join('\n')}
relationship association r1 hub -> a1
relationship serving r2 hub -> a2
relationship flow r3 hub -> a3
relationship serving r4 hub -> a4
relationship flow r5 hub -> a5
relationship influence r6 hub -> a6
relationship triggering r7 hub -> a7
relationship realization r8 hub -> a8`;

test('one relationship type from a hub shares at most three anchors and its trunks', async () => {
  const rendered = await withMermaidPage((page) => geometry(page, 'bundle-hub', hubSource));
  const hub = rendered.elements.hub;
  assert.ok(rendered.width <= 1300, `width was ${rendered.width}`);
  const paths = Object.values(rendered.edges).map(({ points }) => points);
  assert.equal(paths.length, 14);
  const anchors = new Map(paths.map(([start]) => [`${start.x},${start.y}`, sideOf(hub, start)]));
  assert.ok(anchors.size <= 3, `hub anchors: ${[...anchors.keys()].join(' ')}`);
  assert.deepEqual([...new Set(anchors.values())].sort(), ['left', 'right', 'top']);
  for (const points of paths) {
    assert.ok(points.length >= 2);
    for (const [index, segment] of segments(points).entries()) {
      assert.ok(segment[0].x === segment[1].x || segment[0].y === segment[1].y, `segment ${index} is not orthogonal`);
    }
  }
  assertClearOfElements(rendered, 'hub');
  for (const [index, first] of paths.entries()) {
    for (const second of paths.slice(index + 1)) {
      if (first[0].x === second[0].x && first[0].y === second[0].y) continue;
      for (const a of segments(first)) {
        assert.ok(segments(second).every((b) => overlapLength(a, b) <= 0), 'separate bundles overlap');
      }
    }
  }
  const trunkSharers = paths.filter((points) => paths.some((other) => other !== points
    && overlapLength(segments(points)[0], segments(other)[0]) > 0));
  assert.ok(trunkSharers.length >= 12, `${trunkSharers.length} paths share their first segment`);
});

test('relationships of different types from a hub get their own nested anchors', async () => {
  const rendered = await withMermaidPage((page) => geometry(page, 'bundle-mixed', mixedSource),
    { maxRowWidth: 640 });
  const hub = rendered.elements.hub;
  const appRows = new Set(Object.entries(rendered.elements).filter(([id]) => id !== 'hub').map(([, box]) => box.top));
  assert.equal(appRows.size, 2, 'the apps form two rows above the hub');
  const starts = Object.entries(rendered.edges).map(([id, { type, points }]) => ({ id, type, points }));
  const byAnchor = Map.groupBy(starts, ({ points: [start] }) => `${start.x},${start.y}`);
  for (const members of byAnchor.values()) {
    assert.equal(new Set(members.map(({ type }) => type)).size, 1, 'an anchor serves one relationship type');
  }
  for (const [first, second] of starts.flatMap((a, index) => starts.slice(index + 1).map((b) => [a, b]))) {
    if (first.type !== second.type) {
      assert.notDeepEqual(first.points[0], second.points[0], `${first.id} and ${second.id} share an anchor`);
    }
    const sameSide = sideOf(hub, first.points[0]) === sideOf(hub, second.points[0]);
    if (!sameSide) continue;
    for (const a of segments(first.points)) {
      for (const b of segments(second.points)) {
        assert.equal(properCrossing(a, b), false, `${first.id} crosses ${second.id}`);
        if (first.type !== second.type) assert.ok(overlapLength(a, b) <= 0, `${first.id} overlaps ${second.id}`);
      }
    }
  }
  assertClearOfElements(rendered, 'mixed');
  for (const { id, points } of starts) {
    const target = rendered.elements[`a${id.slice(1)}`];
    assert.equal(sideOf(target, points.at(-1)), 'bottom', `${id} enters its target from the side facing the hub`);
  }
});

test('relationships converging on one element share its anchor, keep dashes in phase and label their branches', async () => {
  const source = `archimate-beta
element applicationService service "Order service"
${Array.from({ length: 5 }, (_, index) => `element applicationComponent c${index} "Client ${index}"`).join('\n')}
${Array.from({ length: 5 }, (_, index) =>
    `relationship realization f${index} c${index} -> service${index === 1 ? ' label "Orders"' : ''}`).join('\n')}`;
  const rendered = await withMermaidPage((page) => geometry(page, 'bundle-converging', source));
  const flows = Object.values(rendered.edges);
  const ends = Map.groupBy(flows, ({ points }) => `${points.at(-1).x},${points.at(-1).y}`);
  assert.ok(ends.size < flows.length, 'converging flows share an anchor');
  for (const { points, dashOffset, length } of flows) {
    const shared = ends.get(`${points.at(-1).x},${points.at(-1).y}`).length > 1;
    if (!shared) continue;
    assert.ok(Math.abs(Number(dashOffset) + length) < 0.5, `dash offset ${dashOffset} for length ${length}`);
  }
  const label = rendered.labels.find(({ text }) => text === 'Orders');
  const own = rendered.edges.f1.points;
  const others = ['f0', 'f2', 'f3', 'f4'].map((id) => rendered.edges[id].points);
  const shared = segments(own).filter((segment) => others.some((points) =>
    segments(points).some((other) => overlapLength(segment, other) > 0)));
  assert.ok(shared.length > 0, 'the labelled relationship shares part of its route');
  const gap = ([a, b]) => Math.max(label.left - Math.max(a.x, b.x), Math.min(a.x, b.x) - label.right,
    label.top - Math.max(a.y, b.y), Math.min(a.y, b.y) - label.bottom, 0);
  const nearestShared = Math.min(...shared.map(gap));
  const nearestOwn = Math.min(...segments(own).filter((segment) => !shared.includes(segment)).map(gap));
  assert.ok(nearestOwn <= 6, `the label is ${nearestOwn} px from its own branch`);
  assert.ok(nearestShared > nearestOwn, 'the label sits beside its own branch rather than the shared trunk');
  assertClearOfElements(rendered, 'converging');
});

test('bundles work inside a container, and self-relationships and attached notes stay unbundled', async () => {
  const source = `archimate-beta
element applicationComponent suite "Suite"
element applicationComponent hub "Hub"
${Array.from({ length: 4 }, (_, index) => `element applicationService s${index} "Service ${index}"`).join('\n')}
suite *-- hub
nest hub in suite
${Array.from({ length: 4 }, (_, index) => `suite *-- s${index}\nnest s${index} in suite\nhub --> s${index}`).join('\n')}
hub --> hub
note n "Review" on hub
n --- s0`;
  const rendered = await withMermaidPage((page) => geometry(page, 'bundle-nested', source));
  const { suite, hub } = rendered.elements;
  const serving = Object.entries(rendered.edges).filter(([id]) => /^hub__serving__s\d$/u.test(id));
  assert.equal(serving.length, 4);
  const anchors = new Set(serving.map(([, { points: [start] }]) => `${start.x},${start.y}`));
  assert.ok(anchors.size < serving.length, 'the serving relationships inside the container share an anchor');
  for (const [id, { points }] of serving) {
    for (const { x, y } of points) {
      assert.ok(x > suite.left && x < suite.right && y > suite.top && y < suite.bottom, `${id} leaves its container`);
    }
  }
  const loop = rendered.edges.hub__serving__hub.points;
  assert.ok(loop.length >= 4);
  assert.ok(sideOf(hub, loop[0]) && sideOf(hub, loop.at(-1)));
  for (const [, { points }] of serving) {
    for (const segment of segments(loop)) {
      assert.ok(segments(points).every((other) => overlapLength(segment, other) <= 0), 'the loop is not bundled');
    }
  }
  const note = rendered.edges.n__association__s0.points;
  assert.ok(sideOf(rendered.notes.n, note[0]), 'the note relationship starts at the note');
  assertClearOfElements(rendered, 'nested', (_, element) => element === 'suite');
});
