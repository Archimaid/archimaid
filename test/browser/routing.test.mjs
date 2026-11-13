import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MAX_ROW_WIDTH,
  INTERIOR_INSET,
  POSITION_TOLERANCE,
  hubSource,
  orthogonal,
  renderGeometry as geometry,
  segmentEntersInterior,
  segments,
  withMermaidPage,
} from './helpers.mjs';

function side(box, { x, y }) {
  if (Math.abs(x - box.left) < POSITION_TOLERANCE) return 'left';
  if (Math.abs(x - box.right) < POSITION_TOLERANCE) return 'right';
  if (Math.abs(y - box.top) < POSITION_TOLERANCE) return 'top';
  if (Math.abs(y - box.bottom) < POSITION_TOLERANCE) return 'bottom';
  return undefined;
}

function boxesOverlap(a, b, inset = INTERIOR_INSET) {
  return a.left < b.right - inset && a.right > b.left + inset && a.top < b.bottom - inset && a.bottom > b.top + inset;
}

test('architecture and framework layouts draw a self-relationship as a loop outside its element', async () => {
  await withMermaidPage(async (page) => {
    for (const layout of ['architecture', 'framework']) {
      const source = `archimate-beta
layout ${layout}
element businessRole a "A"
element businessProcess b "B"
element applicationComponent suite "Suite"
element applicationComponent inner "Inner"
suite *-- inner
nest inner in suite
a ==> a : "again"
a ==> a
a @==> b
inner --> inner`;
      const rendered = await geometry(page, `self-loop-${layout}`, source);
      for (const [id, owner] of [
        ['a__triggering__a', 'a'],
        ['a__triggering__a_2', 'a'],
        ['inner__serving__inner', 'inner'],
      ]) {
        const { points } = rendered.edges[id];
        const box = rendered.elements[owner];
        assert.ok(points.length >= 4, `${layout} ${id} has ${points.length} points`);
        assert.ok(orthogonal(points), `${layout} ${id}`);
        const start = side(box, points[0]);
        const end = side(box, points.at(-1));
        assert.ok(start && end && start !== end, `${layout} ${id} sides ${start} ${end}`);
        const xs = points.map(({ x }) => x);
        const ys = points.map(({ y }) => y);
        const outside = Math.max(box.left - Math.min(...xs), Math.max(...xs) - box.right);
        const above = Math.max(box.top - Math.min(...ys), Math.max(...ys) - box.bottom);
        assert.ok(outside >= 24 && above >= 24, `${layout} ${id} reaches ${outside} by ${above}`);
        for (const segment of segments(points)) {
          assert.equal(segmentEntersInterior(segment, box), false, `${layout} ${id} enters its element`);
        }
      }
      const first = rendered.edges.a__triggering__a.points;
      const second = rendered.edges.a__triggering__a_2.points;
      assert.notDeepEqual(first[0], second[0], `${layout} loops share an anchor`);
      const label = rendered.labels.find(({ text }) => text === 'again');
      const outer = first[1];
      const distance = Math.max(label.left - outer.x, outer.x - label.right, 0);
      assert.ok(distance <= 6, `${layout} loop label is ${distance} px from its outer segment`);
      assert.equal(boxesOverlap(label, rendered.elements.a), false, layout);
    }
  });
});

test('parallel relationships keep marker anchors at least 14 px apart on each element side', async () => {
  await withMermaidPage(async (page) => {
    for (const layout of ['architecture', 'framework']) {
      const source = `archimate-beta
layout ${layout}
element businessRole a "A"
element businessProcess b "B"
a @==> b
a --> b
b --> a
a --- b : "x"
a -.=> b : "y"`;
      const rendered = await geometry(page, `parallel-${layout}`, source);
      const anchors = Object.values(rendered.edges).flatMap(({ points, markerStart, markerEnd }) => [
        ...(markerStart ? [points[0]] : []),
        ...(markerEnd ? [points.at(-1)] : []),
      ]);
      assert.equal(anchors.length, 5);
      const placed = anchors.map((point) => {
        const owner = Object.entries(rendered.elements).find(([, box]) => side(box, point));
        assert.ok(owner, `${layout} marker anchor ${point.x},${point.y} is not on an element outline`);
        return { point, key: `${owner[0]}:${side(owner[1], point)}` };
      });
      for (const [index, { point, key }] of placed.entries()) {
        for (const other of placed.slice(index + 1)) {
          if (other.key !== key) continue;
          const distance = Math.hypot(point.x - other.point.x, point.y - other.point.y);
          assert.ok(distance >= 14, `${layout} ${key} anchors are ${distance} px apart`);
        }
      }
    }
  });
});

async function checkWrappedHub(maxRowWidth) {
  const rendered = await withMermaidPage(
    (page) => geometry(page, `wrapped-hub-${maxRowWidth}`, hubSource),
    maxRowWidth === undefined ? undefined : { maxRowWidth },
  );
  const limit = maxRowWidth ?? DEFAULT_MAX_ROW_WIDTH;
  assert.ok(rendered.width <= limit + 100, `diagram width was ${rendered.width} for a ${limit} px row limit`);
  const services = Object.entries(rendered.elements)
    .filter(([id]) => id !== 'hub')
    .map(([, box]) => box);
  const rows = Map.groupBy(services, ({ top }) => Math.round(top));
  assert.ok(rows.size > 1);
  for (const row of rows.values()) {
    const width = Math.max(...row.map(({ right }) => right)) - Math.min(...row.map(({ left }) => left));
    assert.ok(width <= limit, `row width was ${width}`);
  }
  for (const [id, { points }] of Object.entries(rendered.edges)) {
    assert.ok(orthogonal(points), id);
    for (const segment of segments(points)) {
      for (const [other, box] of Object.entries(rendered.elements)) {
        assert.equal(segmentEntersInterior(segment, box), false, `${id} crosses ${other}`);
      }
    }
  }
}

test('a wide rank wraps at the default maximum row width', () => checkWrappedHub(undefined));

test('the maxRowWidth option narrows wrapped ranks', () => checkWrappedHub(600));

test('maxRowWidth: Infinity keeps a wide rank on one row', async () => {
  const rendered = await withMermaidPage((page) => geometry(page, 'unwrapped-hub', hubSource), {
    maxRowWidth: Number.POSITIVE_INFINITY,
  });
  const services = Object.entries(rendered.elements)
    .filter(([id]) => id !== 'hub')
    .map(([, box]) => box);
  assert.equal(new Set(services.map(({ top }) => Math.round(top))).size, 1);
  assert.ok(rendered.width > 2000, `diagram width was ${rendered.width}`);
});

const directions = ['TB', 'BT', 'LR', 'RL'];

test('relationships of an attached note leave it orthogonally and never cross its host', async () => {
  await withMermaidPage(async (page) => {
    for (const direction of directions) {
      const source = `archimate-beta
direction ${direction}
element applicationComponent c1 "C1"
element applicationComponent c2 "C2"
element dataObject d "D"
c1 *-- c2
nest c2 in c1
note n "attached" on c2
n --- d
n --- c1
c2 ..> d`;
      const rendered = await geometry(page, `attached-note-${direction}`, source);
      for (const id of ['n__association__d', 'n__association__c1']) {
        const { points } = rendered.edges[id];
        assert.ok(orthogonal(points), `${direction} ${id} is not orthogonal`);
        assert.ok(side(rendered.notes.n, points[0]), `${direction} ${id} does not start on the note outline`);
        for (const segment of segments(points)) {
          assert.equal(segmentEntersInterior(segment, rendered.elements.c2), false, `${direction} ${id} crosses c2`);
          assert.equal(segmentEntersInterior(segment, rendered.notes.n), false, `${direction} ${id} crosses its note`);
        }
      }
      assert.ok(
        orthogonal(rendered.edges.c2__access__d.points),
        `${direction} the host's own relationship is not orthogonal`,
      );
      assert.ok(side(rendered.elements.d, rendered.edges.n__association__d.points.at(-1)), direction);
      assert.ok(side(rendered.elements.c1, rendered.edges.n__association__c1.points.at(-1)), direction);
    }
  });
});

test('attached-note relationships to nested members and other notes stay orthogonal and separate', async () => {
  await withMermaidPage(async (page) => {
    for (const direction of directions) {
      const source = `archimate-beta
direction ${direction}
element applicationComponent c1 "C1"
element applicationComponent c2 "C2"
element applicationComponent e "E"
element applicationComponent f "F"
c1 *-- c2
nest c2 in c1
note n "on parent" on c1
note m "on e" on e
n --- c2
n --- m
f --> m
m --> f`;
      const rendered = await geometry(page, `note-members-${direction}`, source);
      const solid = { c2: rendered.elements.c2, e: rendered.elements.e, f: rendered.elements.f, ...rendered.notes };
      for (const [id, { points }] of Object.entries(rendered.edges)) {
        assert.ok(orthogonal(points), `${direction} ${id} is not orthogonal`);
        for (const segment of segments(points)) {
          for (const [other, box] of Object.entries(solid)) {
            assert.equal(segmentEntersInterior(segment, box), false, `${direction} ${id} crosses ${other}`);
          }
        }
      }
      const ends = Object.values(rendered.edges)
        .flatMap(({ points }) => [points[0], points.at(-1)])
        .filter((point) => side(rendered.notes.m, point));
      assert.equal(ends.length, 3, direction);
      assert.equal(
        new Set(ends.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)).size,
        3,
        `${direction} note exits coincide`,
      );
    }
  });
});

function compoundTitles(rendered, compounds) {
  return Object.fromEntries(compounds.map((id) => [id, rendered.titles[id]]));
}

test('relationships and their labels clear attached notes and compound titles in every direction', async () => {
  const diagrams = {
    'note-on-container': {
      compounds: ['c1'],
      source: `element applicationComponent c1 "C1"
element applicationComponent c2 "C2"
element applicationComponent c3 "C3"
c1 *-- c2
nest c2 in c1
note n "attached note text here" on c1
c2 --> c3 : "serves"`,
    },
    'note-on-member': {
      compounds: ['c1'],
      source: `element applicationComponent c1 "C1"
element applicationComponent c2 "C2"
element dataObject d "D"
c1 *-- c2
nest c2 in c1
note n "attached" on c2
n --- d
n --- c1
c2 ..> d`,
    },
  };
  await withMermaidPage(async (page) => {
    for (const direction of directions) {
      for (const [name, { compounds, source }] of Object.entries(diagrams)) {
        const rendered = await geometry(
          page,
          `clearance-${name}-${direction}`,
          `archimate-beta\ndirection ${direction}\n${source}`,
        );
        const blocked = { ...rendered.notes, ...compoundTitles(rendered, compounds) };
        for (const [id, { points }] of Object.entries(rendered.edges)) {
          for (const segment of segments(points)) {
            for (const [other, box] of Object.entries(blocked)) {
              assert.equal(segmentEntersInterior(segment, box), false, `${name} ${direction}: ${id} crosses ${other}`);
            }
          }
        }
        for (const label of rendered.labels) {
          for (const [other, box] of Object.entries(blocked)) {
            assert.equal(boxesOverlap(label, box), false, `${name} ${direction}: label ${label.text} covers ${other}`);
          }
        }
      }
    }
  });
});

test('relationships of an element that carries an attached note stay orthogonal in every direction', async () => {
  await withMermaidPage(async (page) => {
    for (const direction of directions) {
      const source = `archimate-beta
direction ${direction}
element applicationComponent c1 "C1"
element applicationComponent c2 "C2"
element applicationComponent c3 "C3"
element dataObject d "D"
c1 *-- c2
nest c2 in c1
note n "attached note text here" on c1
note m "other note" on c2
c2 --> c3 : "serves"
c2 ..> d`;
      const rendered = await geometry(page, `host-relationships-${direction}`, source);
      for (const id of ['c2__serving__c3', 'c2__access__d']) {
        const { points } = rendered.edges[id];
        assert.ok(orthogonal(points), `${direction} ${id} is not orthogonal`);
        assert.ok(side(rendered.elements.c2, points[0]), `${direction} ${id} does not start on c2`);
        for (const segment of segments(points)) {
          for (const [note, box] of Object.entries(rendered.notes)) {
            assert.equal(segmentEntersInterior(segment, box), false, `${direction} ${id} crosses note ${note}`);
          }
        }
      }
    }
  });
});
