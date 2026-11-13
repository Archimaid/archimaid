import assert from 'node:assert/strict';
import { test } from 'node:test';
import { relationshipTypes } from '../dist/archimate/catalogue.js';
import { ArchiMateError, parseArchiMate, relationshipConnectors } from '../dist/archimate/parser.js';
import { validateArchiMate } from '../dist/language.js';

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
    'manage .. order',
    'relationship access touches manage -> order access unspecified',
  ].join('\n'));

  assert.deepEqual(model.relationships, [
    { id: 'manage__access__order_2', type: 'access', source: 'manage', target: 'order', access: 'read', label: 'Reads order record' },
    { id: 'manage__access__order_3', type: 'access', source: 'manage', target: 'order', access: 'read' },
    { id: 'reads', type: 'access', source: 'manage', target: 'order', access: 'read', label: 'Reads order record' },
    { id: 'manage__access__order_4', type: 'access', source: 'manage', target: 'order' },
    { id: 'touches', type: 'access', source: 'manage', target: 'order' },
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
    'element businessObject b "B"',
    'o o-- b',
    'o o--b',
    'o --> b',
    'o--> b',
  ].join('\n'));

  assert.equal(model.title, 'Orders');
  assert.deepEqual(
    model.relationships.map(({ type, source, target, label }) => [type, source, target, label]),
    [
      ['serving', 'order-item', 'o', undefined],
      ['association', 'o', 'order-item', undefined],
      ['aggregation', 'o', 'title', 'contains'],
      ['influence', 'title', 'o', undefined],
      ['aggregation', 'o', 'b', undefined],
      ['aggregation', 'o', 'b', undefined],
      ['serving', 'o', 'b', undefined],
      ['serving', 'o', 'b', undefined],
    ],
  );
  assert.throws(
    () => parseArchiMate('archimate-beta\nelement businessObject o "O"\nelement businessObject b "B"\no--b'),
    { code: 'LEXICAL_ERROR', line: 4, column: 2, detail: '"--" is not a relationship connector.' },
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

test('skips a leading frontmatter block and reports later errors at their file line', () => {
  const frontmatter = ['---', 'config:', '  theme: dark', '---'];
  const element = '  element applicationComponent billing "Billing"';
  assert.deepEqual(
    parseArchiMate([...frontmatter, 'archimate-beta', element].join('\n')).elements,
    [{ id: 'billing', type: 'applicationComponent', name: 'Billing' }],
  );
  assert.equal(parseArchiMate([...frontmatter, 'archimate-beta', element].join('\r\n')).elements.length, 1);
  assert.equal(parseArchiMate(['---', '', '---', 'archimate-beta'].join('\n')).elements.length, 0);
  assert.throws(
    () => parseArchiMate([...frontmatter, 'archimate-beta', element, '  billing --> missing'].join('\n')),
    { code: 'UNKNOWN_ELEMENT', line: 7, column: 15 },
  );
  assert.throws(
    () => parseArchiMate([...frontmatter, 'archimate-beta', 'direction up'].join('\n'), { lineOffset: 2 }),
    { code: 'INVALID_DIRECTION', line: 8, column: 11 },
  );
});

test('recognizes frontmatter fences the way Mermaid does and keeps file line numbers', () => {
  const body = ['config:', '  theme: dark'];
  const after = ['archimate-beta', 'direction up'];
  for (const [label, lines, eol] of [
    ['trailing space on the closing fence', ['---', ...body, '--- ', ...after], '\n'],
    ['trailing whitespace on the opening fence', ['--- \t', ...body, '---', ...after], '\n'],
    ['indented fences', ['  ---', ...body, '  ---', ...after], '\n'],
    ['blank lines after the closing fence', ['---', ...body, '---', '', '', ...after], '\n'],
    ['CRLF with trailing spaces', ['--- ', ...body, '---  ', ...after], '\r\n'],
    ['bare carriage returns', ['---', ...body, '---', ...after], '\r'],
  ]) {
    const expectedLine = lines.length;
    assert.throws(
      () => parseArchiMate(lines.join(eol)),
      { code: 'INVALID_DIRECTION', line: expectedLine, column: 11 },
      label,
    );
  }
});

test('reports an unclosed frontmatter block and leaves other "---" lines to the parser', () => {
  for (const [lines, column] of [
    [['---', 'title: Orders', 'archimate-beta'], 1],
    [['---', '---', 'archimate-beta'], 1],
    [['  ---', 'title: Orders', '---', 'archimate-beta'], 3],
  ]) {
    assert.throws(
      () => parseArchiMate(lines.join('\n')),
      { code: 'SYNTAX_ERROR', line: 1, column, detail: 'The frontmatter block is missing its closing "---" line.' },
    );
  }
  assert.throws(
    () => parseArchiMate(['--- x', 'title: Orders', '---', 'archimate-beta'].join('\n')),
    { code: 'SYNTAX_ERROR', line: 1, detail: 'Expected the "archimate-beta" diagram header.' },
  );
  assert.throws(
    () => parseArchiMate(['----', 'title: Orders', '---', 'archimate-beta'].join('\n')),
    { code: 'LEXICAL_ERROR', line: 1 },
  );
  assert.throws(
    () => parseArchiMate(['archimate-beta', '---', 'title: Orders', '---'].join('\n')),
    (error) => error instanceof ArchiMateError && error.line === 2,
  );
});

test('ignores one leading byte order mark without shifting line 1 columns', () => {
  assert.deepEqual(
    parseArchiMate('\uFEFFarchimate-beta\n  element businessRole a "A"').elements,
    [{ id: 'a', type: 'businessRole', name: 'A' }],
  );
  assert.throws(
    () => parseArchiMate('\uFEFFarchimate-beta x'),
    { code: 'SYNTAX_ERROR', line: 1, column: 16 },
  );
  assert.throws(() => parseArchiMate('\uFEFF\uFEFFarchimate-beta'), { code: 'LEXICAL_ERROR', line: 1, column: 1 });
});

test('accepts the accDescr block form and rejects it alongside accDescr:', () => {
  const block = ['archimate-beta', '  accDescr {', '    Billing serves', '    the order clerk.  ', '  }'];
  const model = parseArchiMate([...block, '  element applicationComponent billing "Billing"'].join('\r\n'));
  assert.equal(model.accDescription, 'Billing serves\nthe order clerk.');
  assert.equal(parseArchiMate('archimate-beta\naccDescr{ One line } %% comment').accDescription, 'One line');
  assert.throws(
    () => parseArchiMate([...block, '  accDescr: Again'].join('\n')),
    { code: 'DUPLICATE_DECLARATION', line: 6, detail: 'accDescr is already set.' },
  );
  assert.throws(
    () => parseArchiMate(['archimate-beta', 'accDescr: First', 'accDescr {', 'Second', '}'].join('\n')),
    { code: 'DUPLICATE_DECLARATION', line: 3, column: 1 },
  );
  assert.throws(
    () => parseArchiMate('archimate-beta\naccDescr {\n  Unfinished'),
    { code: 'LEXICAL_ERROR', line: 2, column: 10, detail: 'The accDescr block is missing its closing "}".' },
  );
});

test('ends metadata values at a trailing comment', () => {
  assert.equal(parseArchiMate('archimate-beta\ntitle: Foo %% bar').title, 'Foo');
  assert.equal(parseArchiMate('archimate-beta\naccTitle: Foo\t%% bar').accTitle, 'Foo');
  assert.equal(parseArchiMate('archimate-beta\ntitle: Load 100%% %% bar').title, 'Load 100%%');
  assert.equal(parseArchiMate('archimate-beta\ntitle: Say "a %% b" %% bar').title, 'Say "a %% b"');
});

test('rejects empty element names, note text and relationship labels at the quoted text', () => {
  const elements = 'archimate-beta\nelement businessRole a "A"\nelement businessRole b "B"\n';
  for (const [source, line, column, detail] of [
    ['archimate-beta\nelement businessRole a ""', 2, 24, 'Element name must not be empty.'],
    ['archimate-beta\nelement businessRole a " \\t\\n"', 2, 24, 'Element name must not be empty.'],
    [elements + 'a --> b : ""', 4, 11, 'Relationship label must not be empty. Omit the label instead.'],
    [elements + 'relationship serving r a -> b label " "', 4, 37, 'Relationship label must not be empty. Omit the label instead.'],
    ['archimate-beta\nnote n "  "', 2, 8, 'Note text must not be empty.'],
  ]) {
    assert.throws(() => parseArchiMate(source), { code: 'INVALID_TEXT', line, column, detail });
  }
  assert.equal(parseArchiMate('archimate-beta\nelement businessRole a "A"\ndescription a ""').elements[0].description, '');
});

test('warns about repeated shorthand relationships without rejecting them', () => {
  const source = [
    'archimate-beta',
    'element businessRole a "A"',
    'element businessRole b "B"',
    'a --> b',
    'a --> b : "uses"',
    'relationship serving explicit a -> b',
    '  a --> b',
  ].join('\n');
  assert.equal(parseArchiMate(source).relationships.length, 4);
  const { model, diagnostics } = validateArchiMate(source);
  assert.equal(model?.relationships.length, 4);
  assert.deepEqual(diagnostics, [{
    severity: 'warning',
    code: 'DUPLICATE_RELATIONSHIP',
    message: 'This relationship repeats the one on line 4. Remove the copy, or use the long form with distinct IDs if both are intended.',
    line: 7,
    column: 3,
    endLine: 7,
    endColumn: 10,
  }]);
  assert.deepEqual(validateArchiMate(source.replace('a --> b : "uses"', 'a --> b : "uses"\na --> b : "uses"')).diagnostics
    .map(({ line, endColumn }) => [line, endColumn]), [[6, 17], [8, 10]]);
});

test('replaces parser internals with plain messages and suggestions', () => {
  const element = 'archimate-beta\nelement businessRole a "A"\n';
  for (const [source, code, detail] of [
    ["archimate-beta\nelement businessRole a 'A'", 'LEXICAL_ERROR', 'Unexpected character "\'". Use double quotes for text.'],
    ['archimate-beta\nelement businessRole a "A', 'LEXICAL_ERROR', 'Text is missing its closing double quote.'],
    ['archimate-beta\nelement businessRole a "A\\q"', 'LEXICAL_ERROR', 'Text contains the invalid escape sequence "\\q". Use "\\\\" for a backslash.'],
    ['archimate-beta\nelement businessRole a "A\tB"', 'LEXICAL_ERROR', 'Text contains a control character. Use an escape sequence such as "\\t" instead.'],
    ['archimate-beta\nelement businessRole a "A" #', 'LEXICAL_ERROR', 'Unexpected character "#".'],
    ['archimate-beta\nelement busnessRole a "A"', 'UNKNOWN_ELEMENT_TYPE', 'Unknown element type "busnessRole". Did you mean "businessRole"?'],
    ['archimate-beta\nelement BusinessRole a "A"', 'UNKNOWN_ELEMENT_TYPE', 'Unknown element type "BusinessRole". Did you mean "businessRole"?'],
    ['archimate-beta\nelement spaceship a "A"', 'UNKNOWN_ELEMENT_TYPE', 'Unknown element type "spaceship".'],
    [element + 'relationship association r a -> a label "x" directed', 'SYNTAX_ERROR', '"directed" must come before "label".'],
    [element + 'relationship access r a -> a label "x" access read', 'SYNTAX_ERROR', '"access" must come before "label".'],
    [element + 'relationship access r a -> a directed access read', 'SYNTAX_ERROR', '"access" must come before "directed".'],
    [element + 'relationship acess r a -> a', 'UNKNOWN_RELATIONSHIP_TYPE', 'Unknown relationship type "acess". Did you mean "access"?'],
    [element + 'relationship access r a -> a access Read', 'INVALID_RELATIONSHIP_PROPERTY', 'Expected access mode read, write, readWrite, or unspecified. Did you mean "read"?'],
    ['archimate-beta\ndirection lr', 'INVALID_DIRECTION', 'Expected direction TB, TD, BT, LR, or RL. Did you mean "LR"?'],
    ['archimate-beta\ndirection up', 'INVALID_DIRECTION', 'Expected direction TB, TD, BT, LR, or RL.'],
    ['archimate-beta\nlayout framwork', 'INVALID_LAYOUT', 'Expected layout architecture, framework, or graph. Did you mean "framework"?'],
  ]) {
    assert.throws(() => parseArchiMate(source), { code, detail });
  }
});

test('validateArchiMate collects independent semantic errors with their ranges', () => {
  const source = [
    'archimate-beta',
    'element businessRole b ""',
    'element busnessRole a "A"',
    'b --> missing',
    'direction lr',
  ].join('\n');
  const { model, diagnostics } = validateArchiMate(source, { lineOffset: 1 });
  assert.equal(model, undefined);
  assert.deepEqual(diagnostics.map(({ severity, code, line, column, endLine, endColumn }) =>
    [severity, code, line, column, endLine, endColumn]), [
    ['error', 'INVALID_TEXT', 3, 24, 3, 26],
    ['error', 'UNKNOWN_ELEMENT_TYPE', 4, 9, 4, 20],
    ['error', 'UNKNOWN_ELEMENT', 5, 7, 5, 14],
    ['error', 'INVALID_DIRECTION', 6, 11, 6, 13],
  ]);
  assert.throws(() => parseArchiMate(source), { code: 'UNKNOWN_ELEMENT_TYPE', line: 3 });

  const valid = validateArchiMate('archimate-beta\nelement businessRole a "A"');
  assert.deepEqual(valid.diagnostics, []);
  assert.deepEqual(valid.model, parseArchiMate('archimate-beta\nelement businessRole a "A"'));
});

test('validateArchiMate spans multi-line tokens and stops after the first syntax error', () => {
  const block = validateArchiMate('archimate-beta\naccDescr {\n  A\n}\naccDescr: B');
  assert.deepEqual(block.diagnostics.map(({ line, column, endLine, endColumn }) => [line, column, endLine, endColumn]),
    [[5, 1, 5, 12]]);
  const syntax = validateArchiMate('archimate-beta\nelement businessRole\nelement x y z');
  assert.equal(syntax.diagnostics.length, 1);
  assert.equal(syntax.diagnostics[0].code, 'SYNTAX_ERROR');
  assert.equal(syntax.model, undefined);
  const end = validateArchiMate('archimate-beta\nelement businessRole clerk').diagnostics[0];
  assert.deepEqual([end.line, end.column, end.endLine, end.endColumn], [2, 27, 2, 27]);
});

test('validateArchiMate avoids follow-on nesting errors for an invalid relationship', () => {
  const source = [
    'archimate-beta',
    'element applicationComponent suite "Suite"',
    'element applicationComponent billing "Billing"',
    'relationship compositon includes suite -> billing',
    'nest billing in suite via includes',
    'element applicationComponent other "Other"',
    'relationship composition holds suite -> ghost',
    'nest other in suite',
  ].join('\n');
  assert.deepEqual(validateArchiMate(source).diagnostics.map(({ code, line }) => [code, line]), [
    ['UNKNOWN_RELATIONSHIP_TYPE', 4],
    ['UNKNOWN_ELEMENT', 7],
    ['INVALID_NESTING', 8],
  ]);
});

test('validateArchiMate does not repeat an unknown endpoint as a nesting error', () => {
  const source = [
    'archimate-beta',
    'element grouping g "G"',
    'g *-- missing',
    'nest missing in g',
  ].join('\n');
  assert.deepEqual(validateArchiMate(source).diagnostics, [{
    severity: 'error',
    code: 'UNKNOWN_ELEMENT',
    message: 'Unknown element or note "missing".',
    line: 3,
    column: 7,
    endLine: 3,
    endColumn: 14,
  }]);
  assert.deepEqual(
    validateArchiMate(source.replace('nest missing in g', 'nest absent in g')).diagnostics.map(({ code, line }) => [code, line]),
    [['UNKNOWN_ELEMENT', 3], ['INVALID_NESTING', 4]],
  );
});

test('validateArchiMate does not report a rejected label as a repeated relationship', () => {
  const source = [
    'archimate-beta',
    'element businessRole a "A"',
    'element businessRole b "B"',
    'a --> b',
    'a --> b : ""',
  ].join('\n');
  assert.deepEqual(validateArchiMate(source).diagnostics, [{
    severity: 'error',
    code: 'INVALID_TEXT',
    message: 'Relationship label must not be empty. Omit the label instead.',
    line: 5,
    column: 11,
    endLine: 5,
    endColumn: 13,
  }]);
});

test('decodes a fully quoted metadata value like other quoted text', () => {
  const metadata = (line) => parseArchiMate('archimate-beta\n' + line);
  assert.equal(metadata('title: "Load %% budget" %% comment').title, 'Load %% budget');
  assert.equal(metadata('title: "100\\u0025 \\"done\\""').title, '100% "done"');
  assert.equal(metadata('accTitle: "Say \\"a %% b\\""').accTitle, 'Say "a %% b"');
  assert.equal(metadata('title: He said "hi" twice').title, 'He said "hi" twice');
  assert.equal(metadata('title: "a" and "b"').title, '"a" and "b"');
  assert.equal(metadata('title:').title, '');
  assert.throws(() => metadata('title: ""'), { code: 'INVALID_TEXT', line: 2, column: 1, detail: 'title must not be empty.' });
  assert.throws(() => metadata('accDescr: "  "'), { code: 'INVALID_TEXT', detail: 'accDescr must not be empty.' });
  assert.throws(() => metadata('title: "\\u0007"'), { code: 'INVALID_TEXT', detail: 'Text contains a character that cannot be written to SVG.' });
});
