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
        canvas: svg.querySelector(':scope > rect[aria-hidden="true"]') ? style(':scope > rect[aria-hidden="true"]').fill
          : null,
        fontSize: style('[data-archimate-element="suite"] text').fontSize,
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

test('the base theme takes colours and font size from theme variables', async () => {
  const source = `${nested}
title: Order fulfilment
element applicationService service "Order service"
relationship realization realizes billing -> service`;
  const based = (variables) => `---\nconfig:\n  theme: base\n  themeVariables:\n${
    Object.entries(variables).map(([key, value]) => `    ${key}: '${value}'`).join('\n')}\n---\n${source}`;
  const luminance = (rgb) => {
    const [red, green, blue] = rgb.match(/\d+/g).map(Number).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  await withMermaidPage(async (page) => {
    const dark = await paints(page, 'base-dark', based({ background: '#1e1e2e' }));
    assert.equal(dark.canvas, 'rgb(30, 30, 46)');
    assert.ok(luminance(dark.edge) > 0.5, `relationship stroke ${dark.edge} is not light`);
    assert.ok(dark.hollowMarker.some(({ fill }) => fill === 'rgb(30, 30, 46)'));
    assert.equal(dark.label.backing, 'rgb(30, 30, 46)');
    assert.ok(luminance(dark.label.ink) > 0.5, `label ink ${dark.label.ink} is not light`);

    const declared = await paints(page, 'base-declared', based({
      background: '#2a2a2a', lineColor: '#ff8080', textColor: '#80ff80', fontSize: '18px',
    }));
    assert.equal(declared.edge, 'rgb(255, 128, 128)');
    assert.equal(declared.label.ink, 'rgb(128, 255, 128)');
    assert.equal(declared.fontSize, '18px');
    const flagged = await paints(page, 'base-flagged', based({ background: '#808080' }).replace(
      '    background:', '    darkMode: true\n    background:'));
    assert.equal(flagged.canvas, 'rgb(128, 128, 128)');
    assert.ok(flagged.hollowMarker.length === 2, 'dark mode draws marker outlines');

    const light = await paints(page, 'base-light', based({ background: '#ffffff', lineColor: '#123456' }));
    assert.equal(light.canvas, 'rgb(255, 255, 255)');
    assert.equal(light.edge, 'rgb(18, 52, 86)');
    for (const paint of [dark, light]) assert.equal(paint.element, 'rgb(184, 231, 252)');
  });
});

test('base theme backgrounds in named, alpha and transparent forms keep lines and labels readable', async () => {
  const source = `${nested}
title: Order fulfilment
element applicationService service "Order service"
relationship realization realizes billing -> service`;
  const based = (background) => `---\nconfig:\n  theme: base\n  themeVariables:\n    background: '${background}'\n---\n${source}`;
  const parse = (colour) => {
    const [red = 0, green = 0, blue = 0, alpha = 1] = (colour.match(/[\d.]+/g) ?? [0, 0, 0, 0]).map(Number);
    return { red, green, blue, alpha };
  };
  const luminance = (colour) => {
    const { red, green, blue } = parse(colour);
    const [r, g, b] = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };
  await withMermaidPage(async (page) => {
    for (const [background, canvas] of [
      ['navy', 'rgb(0, 0, 128)'], ['#1e1e2eff', 'rgb(30, 30, 46)'], ['transparent', 'rgb(255, 255, 255)'],
    ]) {
      const paint = await paints(page, `base-${background.replace(/\W/g, '')}`, based(background));
      assert.equal(paint.canvas, canvas, background);
      assert.ok(contrast(paint.edge, paint.canvas) >= 4.5, `${background}: line ${paint.edge} on ${paint.canvas}`);
      assert.equal(parse(paint.label.backing).alpha, 1, `${background}: label backing ${paint.label.backing}`);
      assert.ok(contrast(paint.label.ink, paint.label.backing) >= 4.5,
        `${background}: label ${paint.label.ink} on ${paint.label.backing}`);
      assert.ok(paint.hollowMarker.some(({ fill }) => parse(fill).alpha === 1), `${background}: hollow marker fill`);
    }
  });
});

test('a transparent background omits the canvas and keeps label backings', async () => {
  const transparent = await withMermaidPage((page) => paints(page, 'transparent', `${nested}
title: Order fulfilment
element applicationService service "Order service"
relationship realization realizes billing -> service`), { background: 'transparent' });
  assert.equal(transparent.canvas, null);
  assert.equal(transparent.label.backing, 'rgb(255, 255, 255)');
  assert.equal(transparent.edge, 'rgb(0, 0, 0)');
  assert.equal(transparent.fontSize, '14px');
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
