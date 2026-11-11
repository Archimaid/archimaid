import assert from 'node:assert/strict';
import { test } from 'node:test';
import { relationshipTypes } from '../dist/archimate/catalogue.js';
import { ArchiMateError, parseArchiMate, relationshipConnectors } from '../dist/archimate/parser.js';

test('parses forward references, comments, CRLF, metadata and quoted Unicode text', () => {
  const diagram = [
    '%% Generated for a design review',
    'archimate-beta',
    '  title: Order fulfilment',
    '  accTitle: Orders: responsibilities',
    '  accDescr: Role and process',
    '  direction LR',
    '  description fulfil "Pick, pack and dispatch."',
    '  relationship assignment clerk_to_fulfil clerk -> fulfil label "performs"',
    '  element businessRole clerk "Fulfilment clerk"',
    '  element businessProcess fulfil "Fulfil \\"priority\\" order 📦" %% element comment',
  ].join('\r\n');

  assert.deepEqual(parseArchiMate(diagram), {
    direction: 'LR',
    title: 'Order fulfilment',
    accTitle: 'Orders: responsibilities',
    accDescription: 'Role and process',
    elements: [
      { id: 'clerk', type: 'businessRole', name: 'Fulfilment clerk' },
      {
        id: 'fulfil',
        type: 'businessProcess',
        name: 'Fulfil "priority" order 📦',
        description: 'Pick, pack and dispatch.',
      },
    ],
    relationships: [
      {
        id: 'clerk_to_fulfil',
        type: 'assignment',
        source: 'clerk',
        target: 'fulfil',
        label: 'performs',
      },
    ],
  });
});

test('selects architecture layout by default and respects explicit graph directions', () => {
  assert.equal(parseArchiMate('archimate-beta').layout, 'architecture');
  assert.equal(parseArchiMate('archimate-beta\ndirection BT').layout, undefined);
  assert.equal(parseArchiMate('archimate-beta\nlayout graph').direction, 'TB');
  assert.equal(parseArchiMate('archimate-beta\nlayout graph').layout, 'graph');
  assert.equal(parseArchiMate('archimate-beta\ndirection BT\nlayout architecture').layout, 'architecture');
  assert.equal(parseArchiMate('archimate-beta\ndirection BT\nlayout framework').layout, 'framework');
  assert.throws(
    () => parseArchiMate('archimate-beta\nlayout radial'),
    { code: 'INVALID_LAYOUT', line: 2, column: 8 },
  );
  assert.throws(
    () => parseArchiMate('archimate-beta\nlayout graph\nlayout architecture'),
    { code: 'DUPLICATE_DECLARATION', line: 3, column: 8 },
  );
});

test('preserves semantic direction when specifying access markers and Association direction', () => {
  const result = parseArchiMate([
    'archimate-beta',
    'element applicationFunction read_orders "Read orders"',
    'element dataObject orders "Orders"',
    'relationship access reads read_orders -> orders access read',
    'relationship association reference orders -> read_orders directed',
  ].join('\n'));

  assert.deepEqual(result.relationships, [
    { id: 'reads', type: 'access', source: 'read_orders', target: 'orders', access: 'read' },
    { id: 'reference', type: 'association', source: 'orders', target: 'read_orders', directed: true },
  ]);
});

test('preserves declared relationship endpoints without checking the element type pair', () => {
  const source = [
    'archimate-beta',
    'element businessRole clerk "Fulfilment clerk"',
    'element businessProcess fulfil "Fulfil order"',
    'relationship assignment reversed fulfil -> clerk',
  ].join('\n');
  assert.deepEqual(parseArchiMate(source).relationships, [
    { id: 'reversed', type: 'assignment', source: 'fulfil', target: 'clerk' },
  ]);
});

test('detects ID collisions between elements and relationships, including prototype names', () => {
  const source = [
    'archimate-beta',
    'element businessRole __proto__ "Clerk"',
    'element businessProcess fulfil "Fulfil order"',
    'relationship assignment __proto__ __proto__ -> fulfil',
  ].join('\n');
  assert.throws(
    () => parseArchiMate(source),
    (error) => error instanceof ArchiMateError && error.code === 'DUPLICATE_ID' && error.line === 4,
  );
});

test('rejects relationship endpoints at the endpoint location, including the host line offset', () => {
  const source = [
    'archimate-beta',
    'element businessRole clerk "Fulfilment clerk"',
    'element businessProcess fulfil "Fulfil order"',
    'relationship assignment assigns clerk -> fulfil',
    'relationship association relates assigns -> clerk',
  ].join('\n');
  assert.throws(
    () => parseArchiMate(source, { lineOffset: 3 }),
    (error) => error instanceof ArchiMateError
      && error.code === 'UNSUPPORTED_ENDPOINT'
      && error.line === 8
      && error.column === 34,
  );
});

test('reports incomplete declarations at the source end and can parse subsequent documents', () => {
  assert.throws(
    () => parseArchiMate('archimate-beta\nelement businessRole clerk'),
    (error) => error instanceof ArchiMateError && error.code === 'SYNTAX_ERROR'
      && error.line === 2 && error.column === 27,
  );
  assert.equal(parseArchiMate('archimate-beta\nelement businessRole clerk "Clerk"').elements.length, 1);
});

test('notes can sit on an element and take any relationship in either direction', () => {
  const relationships = relationshipTypes.flatMap((type) => [
    'relationship ' + type + ' from_' + type + ' annotation -> application',
    'relationship ' + type + ' to_' + type + ' application -> annotation',
  ]);
  const model = parseArchiMate([
    'archimate-beta',
    ...relationships,
    'note annotation "Record a decision" on application',
    'note reminder "Review in November"',
    'element applicationComponent application "Order management"',
  ].join('\n'));
  assert.deepEqual(model.notes, [
    { id: 'annotation', text: 'Record a decision', on: 'application' },
    { id: 'reminder', text: 'Review in November' },
  ]);
  assert.equal(model.relationships.length, 2 * relationshipTypes.length);
  assert.equal(model.elements.length, 1);
});

test('reports a note anchor that names a note instead of an element', () => {
  assert.throws(
    () => parseArchiMate('archimate-beta\nnote first "Review" on second\nnote second "Draft"'),
    (error) => error instanceof ArchiMateError
      && error.code === 'INVALID_NOTE_TARGET' && error.line === 2 && error.column === 24,
  );
});

test('retains composition and specialization relationships behind nested elements', () => {
  const model = parseArchiMate([
    'archimate-beta',
    'nest inventory in suite via includes',
    'nest retail in inventory via specializes',
    'element applicationComponent suite "Operations suite"',
    'element applicationComponent inventory "Inventory"',
    'element applicationComponent retail "Retail inventory"',
    'relationship composition includes suite -> inventory',
    'relationship specialization specializes retail -> inventory',
  ].join('\n'));
  assert.deepEqual(model.nesting, [
    { child: 'inventory', parent: 'suite', relationship: 'includes' },
    { child: 'retail', parent: 'inventory', relationship: 'specializes' },
  ]);
  assert.deepEqual(model.relationships.map(({ id }) => id), ['includes', 'specializes']);
});

test('rejects invalid nesting direction, relation type, and containment cycles', () => {
  const declarations = [
    'archimate-beta',
    'element applicationComponent suite "Operations suite"',
    'element applicationComponent inventory "Inventory"',
    'relationship composition includes suite -> inventory',
    'relationship composition inverse inventory -> suite',
    'relationship association mentions suite -> inventory',
  ];
  for (const [nesting, message] of [
    [['nest suite in inventory via includes'], /does not support nesting/],
    [['nest inventory in suite via mentions'], /does not support nesting/],
    [['nest inventory in suite via missing'], /Unknown relationship/],
    [['nest suite in suite via includes'], /inside itself/],
    [['nest inventory in suite via includes', 'nest inventory in suite via includes'], /already has a nesting parent/],
    [['nest inventory in suite via includes', 'nest suite in inventory via inverse'], /cycle/],
  ]) {
    assert.throws(
      () => parseArchiMate([...declarations, ...nesting].join('\n')),
      (error) => error instanceof ArchiMateError
        && error.code === 'INVALID_NESTING' && message.test(error.detail),
    );
  }
});

test('connector shorthand covers every relationship type, access mode and association direction', () => {
  const connectors = Object.keys(relationshipConnectors);
  const model = parseArchiMate([
    'archimate-beta',
    'element applicationComponent a "A"',
    'element dataObject b "B"',
    ...connectors.map((glyph) => 'a ' + glyph + ' b'),
  ].join('\n'));

  assert.deepEqual(
    new Set(model.relationships.map(({ type }) => type)),
    new Set(relationshipTypes),
  );
  assert.deepEqual(
    model.relationships.filter(({ type }) => type === 'access').map(({ access }) => access),
    [undefined, 'read', 'write', 'readWrite'],
  );
  assert.deepEqual(
    model.relationships.filter(({ type }) => type === 'association').map(({ directed }) => directed),
    [undefined, true],
  );
  assert.ok(model.relationships.every(({ source, target }) => source === 'a' && target === 'b'));
});

test('connector shorthand matches the long form and generates unique, stable IDs', () => {
  const model = parseArchiMate([
    'archimate-beta',
    'element applicationFunction manage "Manage orders"',
    'element dataObject order "Order record"',
    'element dataObject manage__access__order "Collides with a generated ID"',
    'manage <.. order : "Reads order record"',
    'manage <.. order',
    'relationship access reads manage -> order access read label "Reads order record"',
  ].join('\n'));

  assert.deepEqual(model.relationships, [
    { id: 'manage__access__order_2', type: 'access', source: 'manage', target: 'order', access: 'read', label: 'Reads order record' },
    { id: 'manage__access__order_3', type: 'access', source: 'manage', target: 'order', access: 'read' },
    { id: 'reads', type: 'access', source: 'manage', target: 'order', access: 'read', label: 'Reads order record' },
  ]);
});

test('connector shorthand tokenizes hyphenated IDs, unspaced glyphs and metadata-like IDs', () => {
  const model = parseArchiMate([
    'archimate-beta',
    'title: Orders',
    'element businessObject order-item "Order item"',
    'element businessObject o "O"',
    'element businessObject title "Title"',
    'order-item-->o',
    'o---order-item',
    'o o-- title : "contains"',
    'title-.->o',
  ].join('\n'));

  assert.equal(model.title, 'Orders');
  assert.deepEqual(
    model.relationships.map(({ type, source, target, label }) => [type, source, target, label]),
    [
      ['serving', 'order-item', 'o', undefined],
      ['association', 'o', 'order-item', undefined],
      ['aggregation', 'o', 'title', 'contains'],
      ['influence', 'title', 'o', undefined],
    ],
  );
});

test('connector shorthand reports unknown endpoints and unknown glyphs at their location', () => {
  assert.throws(
    () => parseArchiMate('archimate-beta\nelement node server "Server"\nserver --> missing'),
    (error) => error instanceof ArchiMateError
      && error.code === 'UNKNOWN_ELEMENT' && error.line === 3 && error.column === 12,
  );
  assert.throws(
    () => parseArchiMate('archimate-beta\nelement node a "A"\nelement node b "B"\na -- b'),
    (error) => error instanceof ArchiMateError && error.code === 'LEXICAL_ERROR' && error.line === 4,
  );
});

test('infers the nesting relationship when "via" is omitted and rejects ambiguity', () => {
  const declarations = [
    'archimate-beta',
    'element applicationComponent suite "Operations suite"',
    'element applicationComponent billing "Billing"',
    'suite *-- billing',
    'nest billing in suite',
  ];
  assert.deepEqual(parseArchiMate(declarations.join('\n')).nesting, [
    { child: 'billing', parent: 'suite', relationship: 'suite__composition__billing' },
  ]);
  for (const [extra, message] of [
    [['suite o-- billing'], /Several relationships/],
    [['nest suite in billing'], /No relationship supports/],
  ]) {
    assert.throws(
      () => parseArchiMate([...declarations.slice(0, 3), ...extra, ...declarations.slice(3)].join('\n')),
      (error) => error instanceof ArchiMateError
        && error.code === 'INVALID_NESTING' && message.test(error.detail),
    );
  }
});
