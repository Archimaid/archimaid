import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { elementTypes } from 'archimate-for-mermaid/language';
import { renderStandaloneSvg, withMermaidPage } from '../../scripts/mermaid-browser.mjs';

const example = (name) =>
  readFile(new URL(`../../examples/${name}.mmd`, import.meta.url), 'utf8');

function render(page, id, source) {
  return page.evaluate(async ({ id, source }) => {
    const mermaid = await globalThis.archimateHost;
    const { svg } = await mermaid.render(id, source);
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const outline = (id) => document.querySelector(
      `[data-archimate-element="${id}"] .archimate-outline`,
    )?.getAttribute('fill');
    const line = (id) => {
      const edge = document.querySelector(`[data-archimate-relationship="${id}"]`);
      return {
        start: edge?.getAttribute('marker-start'),
        end: edge?.getAttribute('marker-end'),
        dash: edge?.getAttribute('stroke-dasharray'),
      };
    };
    return {
      svg,
      title: document.querySelector('title')?.textContent,
      description: document.querySelector('desc')?.textContent,
      viewBox: document.documentElement.getAttribute('viewBox'),
      roleColour: outline('clerk'),
      applicationColour: outline('oms'),
      assignment: line('clerk_to_fulfil'),
      access: line('manage__access__order'),
      markerIds: Array.from(document.querySelectorAll('marker'), (marker) => marker.id),
    };
  }, { id, source });
}

test('Mermaid registers, validates and renders ArchiMate diagrams in the same host', async () => {
  const [fulfilment, management] = await Promise.all([
    example('order-fulfilment'),
    example('order-management'),
  ]);
  await withMermaidPage(async (page) => {
    const first = await render(page, 'fulfilment', fulfilment);
    assert.equal(first.title, 'Order fulfilment responsibilities');
    assert.match(first.description, /fulfilment clerk/);
    assert.ok(first.viewBox);
    assert.equal(first.roleColour, '#faf087');
    assert.match(first.assignment.start, /-filledDot\)$/);
    assert.match(first.assignment.end, /-filledArrow\)$/);

    const invalid = fulfilment.replace('clerk -> fulfil', 'clerk -> missing');
    await assert.rejects(
      page.evaluate(async (source) => {
        const mermaid = await globalThis.archimateHost;
        await mermaid.parse(source);
      }, invalid),
      /Unknown element or note "missing"/,
    );

    const second = await render(page, 'management', management);
    assert.equal(second.title, 'Application support for order fulfilment');
    assert.equal(second.applicationColour, '#b8e7fc');
    assert.equal(second.roleColour, undefined);
    assert.match(second.access.start, /-openArrow\)$/);
    assert.equal(second.access.end, null);
    assert.ok(second.access.dash);
    assert.ok(second.markerIds.length);
    assert.ok(first.markerIds.every((id) => !second.markerIds.includes(id)));
    assert.doesNotMatch(second.svg, /Fulfilment clerk/);
  });
});

test('all catalogue entries render with centred labels and corner icons', async () => {
  const elements = Object.entries(elementTypes).map(([type, { name }], index) => ({
    id: `element_${index}`,
    type,
    name: index === 0 ? `${name} < & > "quoted"\nA second line` : name,
  }));
  const source = [
    'archimate-beta',
    ...elements.map(({ type, id, name }) => `element ${type} ${id} ${JSON.stringify(name)}`),
  ].join('\n');
  const rendered = await withMermaidPage((page) =>
    page.evaluate(async (source) => {
      const mermaid = await globalThis.archimateHost;
      const { svg } = await mermaid.render('element-catalogue', source);
      const container = document.createElement('div');
      container.innerHTML = svg;
      document.body.append(container);
      return Array.from(container.querySelectorAll('[data-archimate-element]'), (group) => {
        const outline = group.querySelector('.archimate-outline');
        const label = group.querySelector('text');
        const icon = group.querySelector('.archimate-icon');
        const shape = outline.getBBox();
        const lines = Array.from(label.querySelectorAll('tspan'));
        const centreX = shape.x + shape.width / 2;
        const centreY = shape.y + shape.height / 2;
        const lineYs = lines.map((line) => Number(line.getAttribute('y')));
        const iconBox = icon.getBBox();
        const iconMatrix = icon.transform.baseVal.consolidate().matrix;
        return {
          id: group.getAttribute('data-archimate-element'),
          type: group.getAttribute('data-archimate-type'),
          name: lines.map((line) => line.textContent).join('\n'),
          hasIcon: icon.querySelector('path') !== null,
          centred: lines.every((line) => Number(line.getAttribute('x')) === centreX)
            && (Math.min(...lineYs) + Math.max(...lineYs)) / 2 === centreY,
          topIconGap: iconMatrix.f + iconBox.y * iconMatrix.d - shape.y,
          rightIconGap: centreX + shape.width / 2
            - (iconMatrix.e + (iconBox.x + iconBox.width) * iconMatrix.a),
          colours: [getComputedStyle(outline).fill, getComputedStyle(outline).stroke,
            getComputedStyle(label).fill, getComputedStyle(icon).stroke],
        };
      });
    }, source),
  );
  assert.equal(rendered.length, 60);
  assert.deepEqual(
    rendered.map(({ id, type, name, hasIcon, centred }) => ({ id, type, name, hasIcon, centred })),
    elements.map((element) => ({ ...element, hasIcon: true, centred: true })),
  );
  const component = rendered.find(({ type }) => type === 'applicationComponent');
  assert.ok(component.topIconGap > 0 && component.topIconGap <= 6);
  assert.ok(component.rightIconGap > 0 && component.rightIconGap <= 6);
  assert.deepEqual(component.colours, [
    'rgb(184, 231, 252)', 'rgb(82, 176, 217)', 'rgb(5, 76, 108)', 'rgb(5, 76, 108)',
  ]);
});

test('standalone SVG preserves literal entity-like text and nonbreaking spaces', async () => {
  const label = 'Order\u00a0Management #123;, #copy;, and %%{wrap}%%';
  const quotedLabel = JSON.stringify(label).replaceAll('%', '\\u0025');
  const source = [
    '---', 'title: Release review', '---', '%% A diagram comment',
    'archimate-beta', `element applicationComponent work ${quotedLabel}`,
  ].join('\n');
  await withMermaidPage(async (page) => {
    const svg = await renderStandaloneSvg(page, 'literal-text', source);
    const rendered = await page.evaluate((source) => {
      const document = new DOMParser().parseFromString(source, 'image/svg+xml');
      return {
        valid: !document.querySelector('parsererror'),
        title: document.querySelector('title')?.textContent,
        label: document.querySelector('[data-archimate-element] text')?.textContent,
      };
    }, svg);
    assert.deepEqual(rendered, { valid: true, title: 'Release review', label });
  });
});
