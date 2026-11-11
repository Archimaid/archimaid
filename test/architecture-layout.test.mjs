import assert from 'node:assert/strict';
import test from 'node:test';
import { placeArchitecture } from '../dist/mermaid/architectureLayout.js';
import { routeArchitecture } from '../dist/mermaid/orthogonalRouter.js';

const options = {
  rowOrder: ['strategy', 'business', 'application', 'technology', 'implementationAndMigration'],
  padding: 24,
  labelHeight: 0,
};

test('framework aligns occupied aspects and layers independently of declaration order', () => {
  const types = [
    ['hardware', { row: 'technology', column: 'activeStructure' }],
    ['change', { row: 'implementationAndMigration', column: 'behavior' }],
    ['service', { row: 'application', column: 'behavior' }],
    ['goal', { row: 'motivation', column: null }],
    ['records', { row: 'business', column: 'passiveStructure' }],
    ['capability', { row: 'strategy', column: 'behavior' }],
    ['software', { row: 'technology', column: 'activeStructure' }],
  ];
  const placements = new Map(types.map(([id, type]) => [id, { ...type, headerHeight: 54 }]));
  const measured = [...placements.keys()].map((id) => ({ id, width: 120, height: 54 }));
  const render = (nodes) => placeArchitecture(nodes, placements, [], { ...options, framework: true });
  const byId = ({ children }) => Object.fromEntries(children.map((node) => [node.id, node]));
  const boxes = byId(render(measured));
  const { hardware, change, service, goal, records, capability, software } = boxes;
  assert.ok(capability.y + capability.height < records.y);
  assert.ok(records.y + records.height < service.y);
  assert.ok(service.y + service.height < Math.min(hardware.y, software.y));
  assert.ok(Math.max(hardware.y + hardware.height, software.y + software.height) < change.y);
  assert.equal(service.x, capability.x);
  assert.equal(hardware.x, software.x);
  assert.ok(records.x + records.width < service.x);
  assert.ok(service.x + service.width < software.x);
  assert.ok(software.x + software.width < goal.x);
  assert.equal(goal.y, capability.y);
  const reversed = byId(render(measured.toReversed()));
  for (const id of ['records', 'capability', 'service', 'goal', 'change']) {
    assert.deepEqual(boxes[id], reversed[id]);
  }
  assert.deepEqual(render([]), { width: 48, height: 48, children: [] });
});

test('keeps mixed groups intact and places all process children when a flow cycles', () => {
  const element = (id) => ({ id, width: 120, height: 54 });
  const nodes = [
    { ...element('mixed'), children: [element('data'), element('device')] },
    { ...element('process'), children: [element('loop'), element('other'), element('first')] },
  ];
  const types = [
    ['mixed', { row: null, column: null }],
    ['data', { row: 'application', column: 'passiveStructure' }],
    ['device', { row: 'technology', column: 'activeStructure' }],
    ...['process', 'loop', 'other', 'first'].map((id) => [id, { row: 'business', column: 'behavior' }]),
  ];
  const placements = new Map(types.map(([id, type]) => [id, { ...type, headerHeight: 54 }]));
  const flows = [
    { source: 'loop', target: 'loop', type: 'triggering' },
    { source: 'first', target: 'other', type: 'triggering' },
  ];
  const { children: [mixed, process] } = placeArchitecture(nodes, placements, flows, options);
  const [loop, other, first] = process.children;
  assert.ok(first.x + first.width < other.x);
  assert.ok(other.x + other.width < loop.x);
  assert.ok(process.y + process.height < mixed.y);
  for (const parent of [mixed, process]) {
    for (const child of parent.children) {
      assert.ok(child.x > parent.x && child.x + child.width < parent.x + parent.width);
      assert.ok(child.y > parent.y + 54 && child.y + child.height < parent.y + parent.height);
    }
  }
});

test('places same-layer triggering across containers and aligns the service with its nested consumer', () => {
  const element = (id) => ({ id, width: 120, height: 54 });
  const nodes = [
    { ...element('delivery'), children: [element('deliver')] },
    element('service'),
    { ...element('sales'), children: [element('sell')] },
  ];
  const placements = new Map([
    ['sales', { row: 'business', column: 'activeStructure', headerHeight: 54 }],
    ['delivery', { row: 'business', column: 'activeStructure', headerHeight: 54 }],
    ['sell', { row: 'business', column: 'behavior', headerHeight: 54 }],
    ['deliver', { row: 'business', column: 'behavior', headerHeight: 54 }],
    ['service', { row: 'application', column: 'behavior', headerHeight: 54 }],
  ]);
  const edges = [
    { source: 'sell', target: 'deliver', type: 'triggering' },
    { source: 'service', target: 'deliver', type: 'serving' },
  ];
  const { children: [delivery, service, sales] } = placeArchitecture(nodes, placements, edges, options);
  const [deliver] = delivery.children;
  const [sell] = sales.children;
  assert.ok(sell.x + sell.width < deliver.x);
  assert.equal(sell.y, deliver.y);
  assert.equal(deliver.x + deliver.width / 2, service.x + service.width / 2);
  assert.ok(delivery.y + delivery.height < service.y);
});

test('routes aligned shapes straight and separates parallel arrowheads', () => {
  const nodes = new Map([
    ['a', { box: { x: 0, y: 0, width: 120, height: 60 } }],
    ['b', { box: { x: 20, y: 160, width: 80, height: 60 } }],
    ['side', { box: { x: 200, y: 0, width: 120, height: 60 } }],
  ]);
  const edges = [
    { id: 'side', source: 'a', target: 'side' },
    { id: 'direct', source: 'a', target: 'b' },
    { id: 'back', source: 'b', target: 'a' },
  ];
  const routes = routeArchitecture(nodes, edges);
  assert.deepEqual(routes.get('direct'), [{ x: 60, y: 60 }, { x: 60, y: 160 }]);
  const back = routes.get('back');
  assert.equal(back.length, 2);
  assert.equal(back[0].x, back[1].x);
  assert.ok(Math.abs(back[0].x - 60) >= 8);
});

test('keeps motivation and deployment aligned with their respective application branches', () => {
  const types = [
    ['requirementA', 'motivation', null],
    ['requirementB', 'motivation', null],
    ['serviceA', 'application', 'behavior'],
    ['serviceB', 'application', 'behavior'],
    ['artifactB', 'technology', 'passiveStructure'],
    ['artifactA', 'technology', 'passiveStructure'],
  ];
  const nodes = types.map(([id]) => ({ id, width: 120, height: 54 }));
  const placements = new Map(types.map(([id, row, column]) => [id, { row, column, headerHeight: 54 }]));
  const edges = ['A', 'B'].flatMap((suffix) => [
    { source: 'service' + suffix, target: 'requirement' + suffix, type: 'realization' },
    { source: 'artifact' + suffix, target: 'service' + suffix, type: 'realization' },
  ]);
  const { children } = placeArchitecture(nodes, placements, edges, options);
  const byId = new Map(children.map((node) => [node.id, node]));
  for (const suffix of ['A', 'B']) {
    const requirement = byId.get('requirement' + suffix);
    const service = byId.get('service' + suffix);
    const artifact = byId.get('artifact' + suffix);
    assert.ok(requirement.y < service.y && service.y < artifact.y);
    assert.equal(requirement.x, service.x);
    assert.equal(service.x, artifact.x);
  }
});

test('routes separate parallel edges and a self-loop between placed shapes', () => {
  const nodes = new Map([
    ['a', { box: { x: 0, y: 0, width: 100, height: 64 } }],
    ['b', { box: { x: 400, y: 0, width: 100, height: 64 } }],
    ['obstacle', { box: { x: 200, y: -50, width: 100, height: 164 } }],
  ]);
  const edges = [
    { id: 'first', source: 'a', target: 'b' },
    { id: 'reverse', source: 'b', target: 'a' },
    { id: 'loop', source: 'a', target: 'a' },
  ];
  const result = routeArchitecture(nodes, edges);
  assert.deepEqual(result, routeArchitecture(nodes, edges));
  assert.ok(result.get('loop').length >= 4);
  assert.notDeepEqual(result.get('first'), result.get('reverse').toReversed());
  for (const points of result.values()) {
    for (let index = 1; index < points.length; index++) {
      const [from, to] = points.slice(index - 1, index + 1);
      assert.ok(from.x === to.x || from.y === to.y);
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      assert.ok(mid.x <= 200 || mid.x >= 300 || mid.y <= -50 || mid.y >= 114);
    }
  }
});
