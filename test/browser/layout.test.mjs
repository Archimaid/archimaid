import assert from 'node:assert/strict';
import test from 'node:test';
import { withMermaidPage } from './helpers.mjs';

const directions = ['TB', 'BT', 'LR', 'RL'];

test('relationship labels stay next to their nested routes in each direction', async () => {
  await withMermaidPage(async (page) => {
    for (const direction of directions) {
      const source = `archimate-beta
direction ${direction}
element applicationComponent parent "Application"
element applicationComponent child "Child"
relationship composition contains parent -> child label "Contains the child"
nest child in parent via contains`;
      const geometry = await page.evaluate(async ({ direction, source }) => {
        const mermaid = await globalThis.archimateHost;
        const { svg } = await mermaid.render(`nested-label-${direction}`, source);
        const container = document.createElement('div');
        container.innerHTML = svg;
        document.body.append(container);
        const path = container.querySelector('[data-archimate-relationship="contains"]');
        const { x, y, width, height } = container.querySelector('.archimate-edge-label')
          .previousElementSibling.getBBox();
        const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
        const overlaps = (id, selector) => {
          const element = container.querySelector(`[data-archimate-element="${id}"]`);
          const { e, f } = element.transform.baseVal.consolidate().matrix;
          const bounds = element.querySelector(selector).getBBox();
          const left = e + bounds.x;
          const top = f + bounds.y;
          return x < left + bounds.width && x + width > left && y < top + bounds.height && y + height > top;
        };
        const overlapsParentTitle = overlaps('parent', 'text');
        const overlapsChild = overlaps('child', '.archimate-outline');
        container.remove();
        const distance = Math.hypot(
          Math.max(x - midpoint.x, midpoint.x - x - width, 0),
          Math.max(y - midpoint.y, midpoint.y - y - height, 0),
        );
        return { distance, overlapsParentTitle, overlapsChild };
      }, { direction, source });
      const { distance, overlapsParentTitle, overlapsChild } = geometry;
      assert.ok(distance >= 2 && distance <= 6, `${direction} label distance was ${distance}`);
      assert.equal(overlapsParentTitle, false, direction);
      assert.equal(overlapsChild, false, direction);
    }
  });
});

test('relationships within one attached-note group clear all note outlines', async () => {
  await withMermaidPage(async (page) => {
    for (const direction of directions) {
      const source = `archimate-beta
direction ${direction}
element applicationComponent host "Application"
note first "First note" on host
note middle "An unrelated note" on host
note last "Last note" on host
relationship association hostToNote host -> first directed
relationship association noteToHost last -> host directed
relationship association noteToNote first -> last directed label "Review"`;
      const geometry = await page.evaluate(async ({ direction, source }) => {
        const mermaid = await globalThis.archimateHost;
        const { svg } = await mermaid.render(`note-lanes-${direction}`, source);
        const container = document.createElement('div');
        container.innerHTML = svg;
        document.body.append(container);
        const box = (group) => {
          const outline = group.querySelector('.archimate-outline, .archimate-note-outline');
          const { width, height } = outline.getBBox();
          const { e: left, f: top } = group.transform.baseVal.consolidate().matrix;
          return { left, top, right: left + width, bottom: top + height };
        };
        const notes = Array.from(container.querySelectorAll('[data-archimate-note]'), box);
        const ends = [box(container.querySelector('[data-archimate-element="host"]')), notes[0], notes[2]];
        const { x, y, width, height } = container.querySelector('.archimate-edge-label')
          .previousElementSibling.getBBox();
        const labelOverlapsNote = notes.some(({ left, top, right, bottom }) =>
          x < right && x + width > left && y < bottom && y + height > top);
        const links = ['hostToNote', 'noteToHost', 'noteToNote'];
        const edges = links.map((id) => {
          const edge = container.querySelector(`[data-archimate-relationship="${id}"]`);
          const length = edge.getTotalLength();
          const start = edge.getPointAtLength(0);
          const finish = edge.getPointAtLength(length);
          const samples = Math.ceil(length);
          let intersectsNote = false;
          for (let step = 1; step < samples; step++) {
            const { x, y } = edge.getPointAtLength(length * step / samples);
            if (notes.some(({ left, top, right, bottom }) => x > left + 0.1 && x < right - 0.1
              && y > top + 0.1 && y < bottom - 0.1)) {
              intersectsNote = true;
              break;
            }
          }
          return {
            start: [start.x, start.y], finish: [finish.x, finish.y],
            lane: edge.getBBox().x + edge.getBBox().width,
            intersectsNote,
            directed: edge.hasAttribute('marker-end'),
          };
        });
        container.remove();
        return { ends, edges, labelOverlapsNote };
      }, { direction, source });
      const atRight = ({ right, top, bottom }, [x, y]) => Math.abs(x - right) < 0.1 && y > top && y < bottom;
      const endpoints = [[0, 1], [2, 0], [1, 2]];
      for (const [index, { start, finish, intersectsNote, directed }] of geometry.edges.entries()) {
        const [from, to] = endpoints[index];
        assert.ok(atRight(geometry.ends[from], start) && atRight(geometry.ends[to], finish), direction);
        assert.equal(intersectsNote, false, direction);
        assert.equal(directed, true, direction);
      }
      assert.equal(new Set(geometry.edges.map(({ lane }) => lane)).size, 3, direction);
      assert.equal(geometry.labelOverlapsNote, false, direction);
    }
  });
});
