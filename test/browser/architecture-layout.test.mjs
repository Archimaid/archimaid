import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseArchiMate } from '../../dist/language.js';
import { withMermaidPage } from './helpers.mjs';

function countCrossings(paths) {
  const segments = paths.flatMap((points, path) =>
    points.slice(1).map((end, index) => ({
      start: points[index],
      end,
      path,
    })),
  );
  const horizontal = segments.filter(({ start, end }) => start[1] === end[1]);
  const vertical = segments.filter(({ start, end }) => start[0] === end[0]);
  const strictlyBetween = (point, a, b) => Math.min(a, b) < point && point < Math.max(a, b);
  return horizontal.reduce(
    (total, h) =>
      total +
      vertical.filter(
        (v) =>
          h.path !== v.path &&
          strictlyBetween(v.start[0], h.start[0], h.end[0]) &&
          strictlyBetween(h.start[1], v.start[1], v.end[1]),
      ).length,
    0,
  );
}

test('the default layout aligns the claims branches and preserves relationship endpoints', async () => {
  const example = await readFile(new URL('../../examples/cross-layer-relationships.mmd', import.meta.url), 'utf8');
  const source = example.replace(/^\s*layout architecture\r?\n/m, '\n');
  const { nesting, relationships } = parseArchiMate(source);
  const hidden = new Set(nesting.map(({ relationship }) => relationship));

  await withMermaidPage(async (page) => {
    const { boxes, paths } = await page.evaluate(async (source) => {
      const mermaid = await globalThis.archimateHost;
      const { svg } = await mermaid.render('architecture-claims', source);
      const container = document.createElement('div');
      container.innerHTML = svg;
      document.body.append(container);
      const boxes = Object.fromEntries(
        Array.from(container.querySelectorAll('[data-archimate-element]'), (group) => {
          const { x, y, width, height } = group.querySelector('.archimate-outline').getBBox();
          const { e, f } = group.transform.baseVal.consolidate().matrix;
          return [
            group.dataset.archimateElement,
            { left: x + e, top: y + f, right: x + e + width, bottom: y + f + height },
          ];
        }),
      );
      const paths = Object.fromEntries(
        Array.from(container.querySelectorAll('[data-archimate-relationship]'), (edge) => {
          const points = edge
            .getAttribute('d')
            .slice(2)
            .split(' L ')
            .map((pair) => pair.split(' ').map(Number));
          return [edge.dataset.archimateRelationship, points];
        }),
      );
      return { boxes, paths };
    }, source);

    const business = [
      'customer',
      'insurant',
      'archisurance',
      'insurer',
      'claims_registration',
      'claims_acceptance',
      'claims_payment',
      'process_claims',
      'customer_information',
    ];
    const application = [
      'customer_data_management',
      'payment_processing',
      'crm_system',
      'financial_application',
      'customer_data',
    ];
    const technology = [
      'database_management',
      'application_hosting',
      'customer_database_tables',
      'database_access_archive',
      'financial_application_archive',
      'database_management_system',
      'application_server',
      'blade_system',
    ];
    const before = (first, second, end, start) =>
      Math.max(...first.map((id) => boxes[id][end])) < Math.min(...second.map((id) => boxes[id][start]));
    assert.ok(before(business, application, 'bottom', 'top'));
    assert.ok(before(application, technology, 'bottom', 'top'));
    const steps = ['register', 'accept', 'adjudicate', 'pay'];
    const process = boxes.process_claims;
    for (const [index, step] of steps.entries()) {
      const box = boxes[step];
      assert.ok(
        box.left > process.left && box.right < process.right && box.top > process.top && box.bottom < process.bottom,
      );
      if (index > 0) assert.ok(boxes[steps[index - 1]].right < box.left);
    }

    const onBoundary = ({ left, right, top, bottom }, [x, y]) =>
      x >= left - 0.01 &&
      x <= right + 0.01 &&
      y >= top - 0.01 &&
      y <= bottom + 0.01 &&
      [x - left, x - right, y - top, y - bottom].some((offset) => Math.abs(offset) < 0.01);
    assert.equal(Object.keys(paths).length, 32);
    for (const id of [
      'register_then_accept',
      'accept_then_adjudicate',
      'adjudicate_then_pay',
      'register_realizes_registration',
      'accept_realizes_acceptance',
      'pay_realizes_payment',
      'customer_management_supports_register',
      'payment_processing_supports_pay',
    ]) {
      assert.equal(paths[id].length, 2, id);
    }
    const bends = Object.values(paths).reduce((sum, points) => sum + points.length - 2, 0);
    assert.ok(bends <= 26, `Expected at most 26 bends in the claims fixture, got ${bends}`);
    const crossings = countCrossings(Object.values(paths));
    assert.ok(crossings <= 10, `Expected at most 10 crossings in the claims fixture, got ${crossings}`);
    for (const relationship of relationships.filter(({ id }) => !hidden.has(id))) {
      const points = paths[relationship.id];
      assert.ok(onBoundary(boxes[relationship.source], points[0]), relationship.id);
      assert.ok(onBoundary(boxes[relationship.target], points.at(-1)), relationship.id);
      for (let index = 1; index < points.length; index++) {
        const [x, y] = points[index - 1];
        const [nextX, nextY] = points[index];
        assert.ok(x === nextX || y === nextY, relationship.id);
        for (const [id, { left, right, top, bottom }] of Object.entries(boxes)) {
          if (id === relationship.source || id === relationship.target) continue;
          if (id === 'process_claims' && [relationship.source, relationship.target].some((id) => steps.includes(id)))
            continue;
          const crosses =
            y === nextY
              ? y > top && y < bottom && Math.min(x, nextX) < right && Math.max(x, nextX) > left
              : x > left && x < right && Math.min(y, nextY) < bottom && Math.max(y, nextY) > top;
          assert.equal(crosses, false, `${relationship.id} crosses ${id}`);
        }
      }
    }
  });
});
