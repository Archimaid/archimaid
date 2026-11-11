import assert from 'node:assert/strict';
import test from 'node:test';
import { withMermaidPage } from '../../scripts/mermaid-browser.mjs';

test('Mermaid renders nested components and connects notes at their visible outlines', async () => {
  const source = `archimate-beta
direction LR
element applicationComponent suite "Suite"
element applicationComponent inner "Order management"
element applicationComponent external "External system"
element dataObject record "Order record"
relationship composition contains suite -> inner
relationship access reads inner -> record access read label "Read only"
nest inner in suite via contains
nest record in inner via reads
note attached "Draft\\nNeeds review" on inner
note floating "More context"
relationship association integration inner -> external directed label "Connects"
relationship triggering warning attached -> external
relationship access context external -> floating access write
relationship influence clarification floating -> attached
`;

  await withMermaidPage(async (page) => {
    const rendered = await page.evaluate(async (source) => {
      const mermaid = await globalThis.archimateHost;
      const { svg } = await mermaid.render('nested-notes', source);
      const container = document.createElement('div');
      container.innerHTML = svg;
      document.body.append(container);
      const element = (id) => container.querySelector(`[data-archimate-element="${id}"]`);
      const note = (id) => container.querySelector(`[data-archimate-note="${id}"]`);
      const edge = (id) => container.querySelector(`[data-archimate-relationship="${id}"]`);
      const box = (group, selector = '.archimate-outline, .archimate-note-outline') => {
        const { x, y, width, height } = group.querySelector(selector).getBBox();
        const transform = group.transform.baseVal.consolidate().matrix;
        return { left: x + transform.e, top: y + transform.f,
          right: x + transform.e + width, bottom: y + transform.f + height };
      };
      const endpoints = (path) => {
        const { x: startX, y: startY } = path.getPointAtLength(0);
        const { x: endX, y: endY } = path.getPointAtLength(path.getTotalLength());
        return { start: [startX, startY], end: [endX, endY] };
      };
      const iconInsets = (group) => {
        const shape = group.querySelector('.archimate-outline').getBoundingClientRect();
        const icon = group.querySelector('.archimate-icon').getBoundingClientRect();
        return { top: icon.top - shape.top, right: shape.right - icon.right };
      };
      return {
        suite: box(element('suite')),
        inner: box(element('inner')),
        record: box(element('record')),
        suiteLabel: box(element('suite'), 'text'),
        innerLabel: box(element('inner'), 'text'),
        suiteIconInsets: iconInsets(element('suite')),
        innerIconInsets: iconInsets(element('inner')),
        recordLabel: box(element('record'), 'text'),
        external: box(element('external')),
        attached: box(note('attached')),
        floating: box(note('floating')),
        noteLines: Array.from(note('attached').querySelectorAll('tspan'), (span) => span.textContent),
        dashed: note('attached').querySelector('.archimate-note-outline').getAttribute('stroke-dasharray'),
        textColour: getComputedStyle(note('attached').querySelector('text')).fill,
        contains: edge('contains') !== null,
        labels: Array.from(container.querySelectorAll('.archimate-edge-label'), (text) => text.textContent),
        reads: endpoints(edge('reads')),
        integration: endpoints(edge('integration')),
        warning: endpoints(edge('warning')),
        context: endpoints(edge('context')),
        clarification: endpoints(edge('clarification')),
      };
    }, source);

    const contains = (outer, inner) => outer.left < inner.left && outer.top < inner.top
      && outer.right > inner.right && outer.bottom > inner.bottom;
    const onOutline = ({ left, top, right, bottom }, [x, y], folded = false) => {
      const tolerance = 0.1;
      const inBounds = x >= left - tolerance && x <= right + tolerance
        && y >= top - tolerance && y <= bottom + tolerance;
      const boundary = [x - left, x - right, y - top, y - bottom]
        .some((distance) => Math.abs(distance) < tolerance);
      const fold = folded && Math.abs(right - x + y - top - 12) < tolerance;
      return inBounds && (boundary || fold);
    };

    assert.ok(contains(rendered.suite, rendered.inner));
    assert.ok(contains(rendered.inner, rendered.record));
    assert.ok(rendered.suiteLabel.top >= rendered.suite.top
      && rendered.suiteLabel.top - rendered.suite.top <= 16);
    assert.ok(rendered.innerLabel.top >= rendered.inner.top
      && rendered.innerLabel.top - rendered.inner.top <= 16);
    assert.ok(rendered.attached.bottom < rendered.innerLabel.top);
    for (const edge of ['top', 'right']) {
      assert.ok(rendered.innerIconInsets[edge] > 0 && rendered.innerIconInsets[edge] <= 6);
      assert.ok(Math.abs(rendered.innerIconInsets[edge] - rendered.suiteIconInsets[edge]) < 0.1);
    }
    const centreY = ({ top, bottom }) => (top + bottom) / 2;
    assert.ok(Math.abs(centreY(rendered.recordLabel) - centreY(rendered.record)) <= 2);
    assert.ok(rendered.attached.top < rendered.inner.top
      && rendered.attached.bottom > rendered.inner.top);
    assert.ok(rendered.attached.left > rendered.inner.left
      && rendered.attached.right < rendered.inner.right);
    assert.deepEqual(rendered.noteLines, ['Draft', 'Needs review']);
    assert.ok(rendered.dashed);
    assert.equal(rendered.textColour, 'rgb(0, 0, 0)');
    assert.equal(rendered.contains, false);
    assert.ok(rendered.labels.includes('Read only'));
    assert.ok(rendered.labels.includes('Connects'));
    assert.ok(onOutline(rendered.inner, rendered.reads.start));
    assert.ok(onOutline(rendered.record, rendered.reads.end));
    assert.ok(onOutline(rendered.inner, rendered.integration.start));
    assert.ok(onOutline(rendered.external, rendered.integration.end));
    assert.ok(onOutline(rendered.attached, rendered.warning.start, true));
    assert.ok(onOutline(rendered.external, rendered.warning.end));
    assert.ok(onOutline(rendered.external, rendered.context.start));
    assert.ok(onOutline(rendered.floating, rendered.context.end, true));
    assert.ok(onOutline(rendered.floating, rendered.clarification.start, true));
    assert.ok(onOutline(rendered.attached, rendered.clarification.end, true));
  });
});

test('top-to-bottom nesting reserves room for the parent title and attached note', async () => {
  const source = `archimate-beta
element applicationComponent suite "A wide title for the order management application suite"
element applicationComponent inner "Orders"
relationship composition contains suite -> inner
nest inner in suite via contains
note attached "A note that is wider than the nested element" on suite
`;

  await withMermaidPage(async (page) => {
    const geometry = await page.evaluate(async (source) => {
      const mermaid = await globalThis.archimateHost;
      const { svg } = await mermaid.render('vertical-nesting', source);
      const container = document.createElement('div');
      container.innerHTML = svg;
      document.body.append(container);
      const suite = container.querySelector('[data-archimate-element="suite"]');
      const note = container.querySelector('[data-archimate-note="attached"]');
      const outline = suite.querySelector('.archimate-outline').getBoundingClientRect();
      const label = suite.querySelector('text').getBoundingClientRect();
      const noteOutline = note.querySelector('.archimate-note-outline').getBoundingClientRect();
      return {
        titleFits: label.left >= outline.left && label.right <= outline.right,
        noteFits: noteOutline.left >= outline.left && noteOutline.right <= outline.right,
      };
    }, source);
    assert.deepEqual(geometry, { titleFits: true, noteFits: true });
  });
});
