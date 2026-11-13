import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { withMermaidPage } from './helpers.mjs';

const example = (name) => readFile(new URL(`../../examples/${name}.mmd`, import.meta.url), 'utf8');

// Playwright's role selectors do not cover the Graphics ARIA roles, so read Chromium's computed tree.
async function accessibleSymbols(page, id, source) {
  await page.evaluate(
    async ({ id, source }) => {
      const mermaid = await globalThis.archimateHost;
      const { svg } = await mermaid.render(id, source);
      document.body.replaceChildren();
      const container = document.createElement('div');
      container.innerHTML = svg;
      document.body.append(container);
    },
    { id, source },
  );
  const session = await page.context().newCDPSession(page);
  try {
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    const visible = nodes.filter(({ ignored }) => !ignored);
    return {
      symbols: visible
        .filter(({ role }) => role?.value === 'graphics-symbol')
        .map(({ name, properties }) => ({
          name: name?.value,
          roleDescription: properties?.find((property) => property.name === 'roledescription')?.value?.value,
        })),
      text: visible.filter(({ role }) => role?.value === 'StaticText').map(({ name }) => name?.value),
    };
  } finally {
    await session.detach();
  }
}

test('relationships, elements and notes expose accessible names and roles', async () => {
  const management = await example('order-management');
  await withMermaidPage(async (page) => {
    const { symbols, text } = await accessibleSymbols(page, 'accessible-management', management);
    assert.deepEqual(
      symbols
        .filter(({ roleDescription }) => roleDescription === 'relationship')
        .map(({ name }) => name)
        .sort(),
      [
        'Manage orders — Access (read) → Order record',
        'Manage orders — Realization → Order management',
        'Order management system — Assignment → Manage orders',
        'Order management — Serving → Fulfil order',
      ],
    );
    assert.deepEqual(
      symbols.find(({ name }) => name === 'Order management system'),
      { name: 'Order management system', roleDescription: 'Application Component' },
    );
    assert.deepEqual(text, [], 'element names are announced once, through their group');

    const labelled = await accessibleSymbols(
      page,
      'accessible-labels',
      `archimate-beta
element businessRole clerk "Clerk"
element businessObject order "Order"
note hint "Check stock" on clerk
relationship association links clerk -> order directed label "Handles"
relationship access writes clerk -> order access write
hint --- order`,
    );
    const names = labelled.symbols.map(({ name, roleDescription }) => `${roleDescription}: ${name}`);
    for (const expected of [
      'relationship: Clerk — Association (directed) → Order: Handles',
      'relationship: Clerk — Access (write) → Order',
      'relationship: Check stock — Association → Order',
      'note: Check stock',
      'Business Role: Clerk',
      'Business Object: Order',
    ]) {
      assert.ok(names.includes(expected), `missing ${expected} in ${names.join(', ')}`);
    }
  });
});

test('a linked element is wrapped in a link and its title carries the tooltip or description', async () => {
  const source = [
    'archimate-beta',
    'element applicationComponent billing "Billing"',
    'element applicationComponent orders "Orders"',
    'click billing href "https://example.com/billing" "Open the runbook" _blank',
    'description orders "Takes orders."',
  ].join('\n');
  const rendered = await withMermaidPage((page) =>
    page.evaluate(async (source) => {
      const mermaid = await globalThis.archimateHost;
      const { svg } = await mermaid.render('linked', source);
      const container = document.createElement('div');
      container.innerHTML = svg;
      const title = (id) => container.querySelector(`[data-archimate-element="${id}"] > title`).textContent;
      const link = container.querySelector('a.archimate-link');
      return {
        href: link?.getAttribute('href'),
        rel: link?.getAttribute('rel'),
        wraps: link?.querySelector('[data-archimate-element]')?.dataset.archimateElement,
        billing: title('billing'),
        orders: title('orders'),
      };
    }, source),
  );
  assert.deepEqual(rendered, {
    href: 'https://example.com/billing',
    rel: 'noopener noreferrer',
    wraps: 'billing',
    billing: 'Application Component: Billing\nOpen the runbook',
    orders: 'Application Component: Orders\nTakes orders.',
  });
});
