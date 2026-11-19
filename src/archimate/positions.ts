import type { IToken } from 'chevrotain';
import type { DiagnosticCollector, Report } from './diagnostics.js';
import type { AnchorEntry, Declaration, ElementPositionEntry, PositionsDeclaration } from './grammar.js';
import { connectorNotations } from './lexer.js';
import type {
  ArchiMateAnchor,
  ArchiMateLayout,
  ArchiMateNesting,
  ArchiMatePosition,
  ArchiMateRelationship,
  ArchiMateSide,
} from './model.js';
import { withSuggestion } from './suggestions.js';

type PositionedEntity = Extract<Declaration, { kind: 'element' | 'relationship' | 'note' }>;

const sides: readonly ArchiMateSide[] = ['T', 'R', 'B', 'L'];
// The smallest element or note, 124 by 54 pixels, rounded up to 20-pixel grid units.
const smallestFootprint = { width: 7, height: 3 };
// Room for a lead, a marker and clearance on both sides of a relationship between neighbours.
const minimumGap = 2;
// A container's title row and padding around its children, in grid units, rounded up.
const containerInset = { horizontal: 3, vertical: 6 };

export interface PositionContext {
  readonly blocks: readonly PositionsDeclaration[];
  readonly layout: ArchiMateLayout | undefined;
  readonly layoutToken: IToken | undefined;
  readonly entities: ReadonlyMap<string, PositionedEntity>;
  readonly relationships: readonly ArchiMateRelationship[];
  readonly nesting: readonly ArchiMateNesting[];
  readonly diagnostics: DiagnosticCollector;
  readonly report: Report;
}

export interface ValidatedPositions {
  readonly positions: readonly ArchiMatePosition[];
  readonly anchors: readonly ArchiMateAnchor[];
}

function lastToken(entry: ElementPositionEntry | AnchorEntry): IToken {
  return entry.kind === 'elementPosition'
    ? (entry.size ?? entry.y)
    : (entry.targetSide ?? entry.sourceSide ?? entry.target ?? entry.subject);
}

function readCoordinate(token: IToken, report: Report): number | undefined {
  const value = Number(token.image);
  if (Number.isSafeInteger(value)) return value;
  report('INVALID_POSITION', token, 'Coordinate "' + token.image + '" is too large.');
  return undefined;
}

function readSize(token: IToken, report: Report): { width: number; height: number } | undefined {
  const [width, height] = token.image.split('x').map(Number);
  if (width !== undefined && height !== undefined && width >= 1 && height >= 1) return { width, height };
  report('INVALID_POSITION', token, 'Size must be at least 1x1.');
  return undefined;
}

function readSide(token: IToken | undefined, report: Report): ArchiMateSide | undefined {
  if (!token) return undefined;
  const side = sides.find((candidate) => candidate === token.image);
  if (!side) report('INVALID_POSITION', token, withSuggestion('Expected side T, R, B, or L.', token.image, sides));
  return side;
}

function readElementPosition(
  entry: ElementPositionEntry,
  context: PositionContext,
  placed: Map<string, ElementPositionEntry>,
): ArchiMatePosition | undefined {
  const { report, diagnostics } = context;
  const id = entry.id.image;
  const entity = context.entities.get(id);
  if (!entity) {
    diagnostics.warning(
      'UNKNOWN_POSITION_TARGET',
      entry.id,
      lastToken(entry),
      `Position refers to an undeclared element or note "${id}" and is ignored.`,
    );
    return undefined;
  }
  if (entity.kind === 'relationship') {
    report('INVALID_POSITION', entry.id, `"${id}" is a relationship. Anchor it with "from" or "to" instead.`);
    return undefined;
  }
  if (placed.has(id)) {
    report('DUPLICATE_DECLARATION', entry.id, `Position is already set for "${id}".`);
    return undefined;
  }
  placed.set(id, entry);
  if (entity.kind === 'note' && entity.anchor) {
    diagnostics.warning(
      'IGNORED_POSITION',
      entry.id,
      lastToken(entry),
      `Note "${id}" sits on "${entity.anchor.image}" and moves with it, so its position is ignored.`,
    );
    return undefined;
  }
  const x = readCoordinate(entry.x, report);
  const y = readCoordinate(entry.y, report);
  const size = entry.size && readSize(entry.size, report);
  if (x === undefined || y === undefined || (entry.size && !size)) return undefined;
  return { id, x, y, ...size };
}

function sameNotation(relationship: ArchiMateRelationship, connector: IToken): boolean {
  const notation = connectorNotations.get(connector.tokenType);
  if (!notation) throw new Error('Unknown ArchiMate connector token "' + connector.image + '".');
  const access = 'access' in notation ? notation.access : undefined;
  const directed = 'directed' in notation && notation.directed;
  return (
    relationship.type === notation.type &&
    (relationship.access ?? 'unspecified') === (access ?? 'unspecified') &&
    (relationship.directed ?? false) === directed
  );
}

function resolveAnchoredRelationship(entry: AnchorEntry, context: PositionContext): ArchiMateRelationship | undefined {
  const { report, diagnostics } = context;
  const subject = entry.subject.image;
  if (entry.connector && entry.target) {
    const target = entry.target.image;
    const { connector } = entry;
    const matches = context.relationships.filter(
      (relationship) =>
        relationship.source === subject && relationship.target === target && sameNotation(relationship, connector),
    );
    const written = `${subject} ${connector.image} ${target}`;
    if (matches.length > 1) {
      report('INVALID_POSITION', entry.subject, `Several relationships match "${written}". Name one by its ID.`);
      return undefined;
    }
    if (!matches[0]) {
      diagnostics.warning(
        'UNKNOWN_POSITION_TARGET',
        entry.subject,
        lastToken(entry),
        `Anchor refers to an undeclared relationship "${written}" and is ignored.`,
      );
    }
    return matches[0];
  }
  const entity = context.entities.get(subject);
  if (entity && entity.kind !== 'relationship') {
    report(
      'INVALID_POSITION',
      entry.subject,
      `"${subject}" is not a relationship. Write "${subject} at x y" to position it.`,
    );
    return undefined;
  }
  const found = context.relationships.find(({ id }) => id === subject);
  if (!found) {
    diagnostics.warning(
      'UNKNOWN_POSITION_TARGET',
      entry.subject,
      lastToken(entry),
      `Anchor refers to an undeclared relationship "${subject}" and is ignored.`,
    );
  }
  return found;
}

function readAnchor(entry: AnchorEntry, context: PositionContext, anchored: Set<string>): ArchiMateAnchor | undefined {
  const source = readSide(entry.sourceSide, context.report);
  const target = readSide(entry.targetSide, context.report);
  const relationship = resolveAnchoredRelationship(entry, context);
  if (!relationship) return undefined;
  if (anchored.has(relationship.id)) {
    context.report('DUPLICATE_DECLARATION', entry.subject, `Anchors are already set for "${relationship.id}".`);
    return undefined;
  }
  anchored.add(relationship.id);
  if ((entry.sourceSide && !source) || (entry.targetSide && !target)) return undefined;
  return { relationship: relationship.id, ...(source && { source }), ...(target && { target }) };
}

interface Footprint {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// Element sizes depend on text measurement, so crowding is checked against the smallest size each can have.
function warnOnCrowding(
  positions: readonly ArchiMatePosition[],
  parents: ReadonlyMap<string, string>,
  entries: ReadonlyMap<string, ElementPositionEntry>,
  diagnostics: DiagnosticCollector,
): void {
  const footprints = new Map<string, Footprint>();
  const children = new Map<string | undefined, ArchiMatePosition[]>();
  for (const position of positions) {
    const parent = parents.get(position.id);
    children.set(parent, [...(children.get(parent) ?? []), position]);
  }
  function footprint(position: ArchiMatePosition): Footprint {
    const known = footprints.get(position.id);
    if (known) return known;
    const inner = (children.get(position.id) ?? []).map(footprint);
    const result = {
      x: position.x,
      y: position.y,
      width: Math.max(
        position.width ?? smallestFootprint.width,
        ...inner.map((child) => child.x + child.width + containerInset.horizontal),
      ),
      height: Math.max(
        position.height ?? smallestFootprint.height,
        ...inner.map((child) => child.y + child.height + containerInset.vertical),
      ),
    };
    footprints.set(position.id, result);
    return result;
  }
  for (const siblings of children.values()) {
    for (const [index, position] of siblings.entries()) {
      const box = footprint(position);
      const neighbour = siblings.slice(0, index).find((other) => {
        const near = footprint(other);
        return (
          box.x < near.x + near.width + minimumGap &&
          near.x < box.x + box.width + minimumGap &&
          box.y < near.y + near.height + minimumGap &&
          near.y < box.y + box.height + minimumGap
        );
      });
      const entry = entries.get(position.id);
      if (neighbour && entry) {
        diagnostics.warning(
          'CROWDED_POSITION',
          entry.id,
          lastToken(entry),
          `"${position.id}" is closer than ${minimumGap} grid units to "${neighbour.id}", ` +
            'so relationships between them may route poorly.',
        );
      }
    }
  }
}

// Layout warnings only matter where the positions are used, so they wait for custom layout.
function warnOnCustomLayout(
  context: PositionContext,
  positions: readonly ArchiMatePosition[],
  entries: ReadonlyMap<string, ElementPositionEntry>,
): void {
  const { diagnostics } = context;
  const parents = new Map(context.nesting.map(({ child, parent }) => [child, parent]));
  // A position with an error is still declared, so it does not also count as missing.
  const positioned = new Set(entries.keys());
  for (const [id, entity] of context.entities) {
    if (entity.kind === 'relationship' || (entity.kind === 'note' && entity.anchor)) continue;
    const parent = parents.get(id);
    if (!positioned.has(id) && (parent === undefined || positioned.has(parent))) {
      diagnostics.warning(
        'MISSING_POSITION',
        entity.id,
        entity.id,
        `"${id}" has no position, so architecture layout places it.`,
      );
    }
  }
  const usable: ArchiMatePosition[] = [];
  for (const position of positions) {
    let unplacedParent: string | undefined;
    for (let parent = parents.get(position.id); parent !== undefined; parent = parents.get(parent)) {
      if (!positioned.has(parent)) unplacedParent = parent;
    }
    const entry = entries.get(position.id);
    if (unplacedParent === undefined) usable.push(position);
    else if (entry) {
      diagnostics.warning(
        'IGNORED_POSITION',
        entry.id,
        lastToken(entry),
        `The position of "${position.id}" is ignored because "${unplacedParent}" has no position.`,
      );
    }
  }
  warnOnCrowding(usable, parents, entries, diagnostics);
}

// The block is checked in every layout, so it stays correct while a diagram uses automatic layout.
export function validatePositions(context: PositionContext): ValidatedPositions {
  const [block, ...repeated] = context.blocks;
  for (const extra of repeated) {
    context.report('DUPLICATE_DECLARATION', extra.keyword, 'Positions are already declared.');
  }
  if (!block) {
    if (context.layout === 'custom' && context.layoutToken) {
      context.diagnostics.warning(
        'MISSING_POSITION',
        context.layoutToken,
        context.layoutToken,
        'Custom layout has no positions block, so architecture layout places every element.',
      );
    }
    return { positions: [], anchors: [] };
  }
  const placed = new Map<string, ElementPositionEntry>();
  const anchored = new Set<string>();
  const positions: ArchiMatePosition[] = [];
  const anchors: ArchiMateAnchor[] = [];
  for (const entry of block.entries) {
    if (entry.kind === 'elementPosition') {
      const position = readElementPosition(entry, context, placed);
      if (position) positions.push(position);
    } else {
      const anchor = readAnchor(entry, context, anchored);
      if (anchor) anchors.push(anchor);
    }
  }
  if (context.layout === 'custom') warnOnCustomLayout(context, positions, placed);
  return { positions, anchors };
}
