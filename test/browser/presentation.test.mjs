import assert from 'node:assert/strict';
import test from 'node:test';
import { withMermaidPage } from '../../scripts/mermaid-browser.mjs';

const nested = `archimate-beta
direction LR
element applicationComponent suite "Order management"
element applicationComponent orders "Orders"
element applicationComponent billing "Billing"
relationship composition includesOrders suite -> orders
relationship composition includesBilling suite -> billing
nest orders in suite via includesOrders
nest billing in suite via includesBilling
relationship flow handoff orders -> billing label "Send order"
note review "Confirm retry behaviour" on suite`;

function paints(page, id, source) {
  return page.evaluate(async ({ id, source }) => {
    const mermaid = await globalThis.archimateHost;
    const { svg: markup } = await mermaid.render(id, source);
    const container = document.createElement('div');
    container.innerHTML = markup;
    document.body.append(container);
    try {
      const svg = container.querySelector('svg');
      const style = (selector) => getComputedStyle(svg.querySelector(selector));
      const markerPaint = (edge) => {
        const markerEnd = svg.querySelector(`[data-archimate-relationship="${edge}"]`).getAttribute('marker-end');
        const markerId = markerEnd.match(/#([^)]*)\)/)[1];
        return Array.from(svg.querySelectorAll(`marker#${CSS.escape(markerId)} path`), (path) => {
          const { fill, stroke } = getComputedStyle(path);
          return { fill, stroke };
        });
      };
      const label = svg.querySelector('.archimate-edge-label');
      return {
        canvas: style(':scope > rect[aria-hidden="true"]').fill,
        title: style('.archimate-title').fill,
        element: style('[data-archimate-element="suite"] .archimate-outline').fill,
        note: style('[data-archimate-note="review"] .archimate-note-outline').fill,
        noteText: style('[data-archimate-note="review"] text').fill,
        edge: style('[data-archimate-relationship="handoff"]').stroke,
        filledMarker: markerPaint('handoff'),
        hollowMarker: markerPaint('realizes'),
        label: {
          text: label.textContent,
          ink: getComputedStyle(label).fill,
          backing: getComputedStyle(label.previousElementSibling).fill,
        },
      };
    } finally {
      container.remove();
    }
  }, { id, source });
}

test('the Mermaid dark theme changes diagram paint and keeps ArchiMate element and note colours', async () => {
  const source = `${nested}
title: Order fulfilment
element applicationService service "Order service"
relationship realization realizes billing -> service`;
  const themedSource = (theme) => `---\nconfig:\n  theme: ${theme}\n---\n${source}`;
  const black = 'rgb(0, 0, 0)';
  const white = 'rgb(255, 255, 255)';
  const darkCanvas = 'rgb(51, 51, 51)';
  await withMermaidPage(async (page) => {
    const light = await paints(page, 'paint-light', source);
    const dark = await paints(page, 'paint-dark', themedSource('dark'));
    const neoDark = await paints(page, 'paint-neo-dark', themedSource('neo-dark'));
    const restored = await paints(page, 'paint-restored', source);

    assert.deepEqual(restored, light);
    assert.deepEqual(neoDark, dark);
    assert.equal(light.canvas, white);
    assert.equal(light.edge, black);
    assert.ok(light.filledMarker.some(({ fill, stroke }) => fill === black && stroke === black));
    assert.ok(light.hollowMarker.some(({ fill, stroke }) => fill === white && stroke === black));
    assert.equal(dark.canvas, darkCanvas);
    assert.equal(dark.title, white);
    assert.equal(dark.edge, white);
    assert.ok(dark.filledMarker.some(({ fill }) => fill === white));
    assert.ok(dark.hollowMarker.some(({ fill, stroke }) => fill === darkCanvas && stroke === white));
    assert.equal(dark.label.text, 'Send order');
    assert.equal(dark.label.backing, darkCanvas);
    assert.equal(dark.label.ink, white);
    for (const paint of [light, dark]) {
      assert.equal(paint.element, 'rgb(184, 231, 252)');
      assert.equal(paint.note, 'rgb(255, 248, 203)');
      assert.equal(paint.noteText, black);
    }
  });
});

function viewport(page) {
  return page.evaluate(async (source) => {
    const mermaid = await globalThis.archimateHost;
    const { svg: markup } = await mermaid.render('viewport-options', source);
    const container = document.createElement('div');
    container.style.width = '180px';
    container.innerHTML = markup;
    document.body.append(container);
    try {
      const svg = container.querySelector('svg');
      const fromScreen = svg.getCTM().inverse();
      const bounds = (id) => {
        const outline = svg.querySelector(`[data-archimate-element="${id}"] .archimate-outline`);
        const { x, y, width, height } = outline.getBBox();
        const toSvg = fromScreen.multiply(outline.getCTM());
        const leftTop = new DOMPoint(x, y).matrixTransform(toSvg);
        const rightBottom = new DOMPoint(x + width, y + height).matrixTransform(toSvg);
        return { left: leftTop.x, top: leftTop.y, right: rightBottom.x, bottom: rightBottom.y };
      };
      const suite = bounds('suite');
      const orders = bounds('orders');
      const billing = bounds('billing');
      return {
        width: svg.getAttribute('width'),
        height: svg.getAttribute('height'),
        maxWidth: svg.style.maxWidth,
        naturalWidth: svg.viewBox.baseVal.width,
        naturalHeight: svg.viewBox.baseVal.height,
        renderedWidth: svg.getBoundingClientRect().width,
        gaps: [orders.left - suite.left, orders.top - suite.top, billing.left - orders.right,
          suite.right - billing.right, suite.bottom - billing.bottom],
      };
    } finally {
      container.remove();
    }
  }, nested);
}

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.05, `${label} was ${actual}, expected ${expected}`);
}

test('registration options control viewport size without changing nested spacing', async () => {
  const narrowPadding = 8;
  const widePadding = 40;
  const [responsive, fixed] = await Promise.all([
    withMermaidPage(viewport, { diagramPadding: narrowPadding, useMaxWidth: true }),
    withMermaidPage(viewport, { diagramPadding: widePadding, useMaxWidth: false }),
  ]);
  assert.equal(responsive.width, '100%');
  assert.match(responsive.maxWidth, /px$/);
  assertClose(Number.parseFloat(responsive.maxWidth), responsive.naturalWidth, 'responsive maximum width');
  assertClose(responsive.renderedWidth, 180, 'responsive rendered width');
  assertClose(Number(fixed.width), fixed.naturalWidth, 'fixed width attribute');
  assertClose(Number(fixed.height), fixed.naturalHeight, 'fixed height attribute');
  assertClose(fixed.renderedWidth, fixed.naturalWidth, 'fixed rendered width');
  const marginDifference = 2 * (widePadding - narrowPadding);
  assertClose(fixed.naturalWidth - responsive.naturalWidth, marginDifference, 'viewport width difference');
  assertClose(fixed.naturalHeight - responsive.naturalHeight, marginDifference, 'viewport height difference');
  assert.ok(fixed.gaps.every((gap) => gap > 0));
  fixed.gaps.forEach((gap, index) => assertClose(gap, responsive.gaps[index], `nested gap ${index + 1}`));
});
