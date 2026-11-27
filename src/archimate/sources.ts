import type { IToken } from 'chevrotain';
import type { ArchiMateSourceRange } from './diagnostics.js';
import type {
  ConnectorDeclaration,
  Declaration,
  ElementPositionEntry,
  AnchorEntry,
  RelationshipDeclaration,
  TokenBounds,
} from './grammar.js';
import type { PositionStatements } from './positions.js';

/**
 * A range that also carries 0-based UTF-16 offsets into the source string passed to `validateArchiMate`,
 * with `endOffset` exclusive, so `source.slice(offset, endOffset)` is the text it covers.
 */
export interface ArchiMateSourceSpan extends ArchiMateSourceRange {
  readonly offset: number;
  readonly endOffset: number;
}

export interface ArchiMateDescriptionSource {
  readonly statement: ArchiMateSourceSpan;
  readonly value: ArchiMateSourceSpan;
}

export interface ArchiMateLinkSource {
  readonly statement: ArchiMateSourceSpan;
  readonly url: ArchiMateSourceSpan;
  readonly tooltip?: ArchiMateSourceSpan;
  readonly target?: ArchiMateSourceSpan;
}

export interface ArchiMateElementSource {
  // Includes the element's block and everything declared in it.
  readonly statement: ArchiMateSourceSpan;
  readonly type: ArchiMateSourceSpan;
  readonly id: ArchiMateSourceSpan;
  readonly name: ArchiMateSourceSpan;
  readonly description?: ArchiMateDescriptionSource;
  readonly link?: ArchiMateLinkSource;
}

// Optional clauses such as `label "…"` or `: "…"` cover their keyword or marker as well as the value.
export interface ArchiMateLongFormRelationshipSource {
  readonly notation: 'longForm';
  readonly statement: ArchiMateSourceSpan;
  readonly type: ArchiMateSourceSpan;
  readonly id: ArchiMateSourceSpan;
  readonly source: ArchiMateSourceSpan;
  readonly target: ArchiMateSourceSpan;
  readonly access?: ArchiMateSourceSpan;
  readonly directed?: ArchiMateSourceSpan;
  readonly label?: ArchiMateSourceSpan;
}

export interface ArchiMateShorthandRelationshipSource {
  readonly notation: 'shorthand';
  readonly statement: ArchiMateSourceSpan;
  readonly source: ArchiMateSourceSpan;
  readonly connector: ArchiMateSourceSpan;
  readonly target: ArchiMateSourceSpan;
  readonly label?: ArchiMateSourceSpan;
}

export type ArchiMateRelationshipSource = ArchiMateLongFormRelationshipSource | ArchiMateShorthandRelationshipSource;

export interface ArchiMateNoteSource {
  readonly statement: ArchiMateSourceSpan;
  readonly id: ArchiMateSourceSpan;
  readonly text: ArchiMateSourceSpan;
  readonly on?: ArchiMateSourceSpan;
}

export interface ArchiMatePositionSource {
  readonly statement: ArchiMateSourceSpan;
  readonly id: ArchiMateSourceSpan;
  readonly x: ArchiMateSourceSpan;
  readonly y: ArchiMateSourceSpan;
  readonly size?: ArchiMateSourceSpan;
}

export interface ArchiMateAnchorSource {
  readonly statement: ArchiMateSourceSpan;
  readonly from?: ArchiMateSourceSpan;
  readonly to?: ArchiMateSourceSpan;
}

/**
 * Where each part of the model is written. Elements, relationships and notes are keyed by ID, including the
 * generated IDs of shorthand relationships; positions by element or note ID; anchors by relationship ID.
 */
export interface ArchiMateSourceMap {
  readonly elements: ReadonlyMap<string, ArchiMateElementSource>;
  readonly relationships: ReadonlyMap<string, ArchiMateRelationshipSource>;
  readonly notes: ReadonlyMap<string, ArchiMateNoteSource>;
  readonly positionsBlock?: ArchiMateSourceSpan;
  readonly positions: ReadonlyMap<string, ArchiMatePositionSource>;
  readonly anchors: ReadonlyMap<string, ArchiMateAnchorSource>;
}

type Statement<Kind extends Declaration['kind']> = Extract<Declaration, { kind: Kind }>;

export interface SourceStatements {
  readonly elements: readonly Statement<'element'>[];
  readonly descriptions: ReadonlyMap<string, Statement<'description'>>;
  readonly clicks: ReadonlyMap<string, Statement<'click'>>;
  readonly relationships: readonly {
    readonly id: string;
    readonly statement: RelationshipDeclaration | ConnectorDeclaration;
  }[];
  readonly notes: readonly Statement<'note'>[];
  readonly positions: PositionStatements;
}

export interface SourceLocation {
  // Lines the host removed before the text this parser sees, as in ArchiMateParseOptions.
  readonly lineOffset: number;
  // Characters removed before the first token: a byte order mark and blanked frontmatter.
  readonly offsetShift: number;
}

export function locateSources(statements: SourceStatements, location: SourceLocation): ArchiMateSourceMap {
  const span = (first: IToken, last: IToken = first): ArchiMateSourceSpan => {
    const { startLine, startColumn, startOffset } = first;
    const { endLine, endColumn, endOffset } = last;
    if (startLine === undefined || startColumn === undefined || endLine === undefined || endColumn === undefined) {
      throw new Error(`Token "${first.image}" has no source position.`);
    }
    if (endOffset === undefined) throw new Error(`Token "${last.image}" has no end offset.`);
    return {
      line: startLine + location.lineOffset,
      column: startColumn,
      endLine: endLine + location.lineOffset,
      endColumn: endColumn + 1,
      offset: startOffset + location.offsetShift,
      endOffset: endOffset + 1 + location.offsetShift,
    };
  };
  const statementSpan = ({ first, last }: TokenBounds): ArchiMateSourceSpan => span(first, last);
  const optional = (first: IToken | undefined, last: IToken | undefined): ArchiMateSourceSpan | undefined =>
    first && last ? span(first, last) : undefined;

  const elements = new Map<string, ArchiMateElementSource>();
  for (const statement of statements.elements) {
    const id = statement.id.image;
    const description = statements.descriptions.get(id);
    const click = statements.clicks.get(id);
    elements.set(id, {
      statement: statementSpan(statement.bounds),
      type: span(statement.type),
      id: span(statement.id),
      name: span(statement.name),
      ...(description && {
        description: { statement: statementSpan(description.bounds), value: span(description.value) },
      }),
      ...(click && {
        link: {
          statement: statementSpan(click.bounds),
          url: span(click.url),
          ...(click.tooltip && { tooltip: span(click.tooltip) }),
          ...(click.target && { target: span(click.target) }),
        },
      }),
    });
  }

  const relationships = new Map<string, ArchiMateRelationshipSource>();
  for (const { id, statement } of statements.relationships) {
    const label = optional(statement.labelMarker, statement.label);
    if (statement.kind === 'connector') {
      relationships.set(id, {
        notation: 'shorthand',
        statement: statementSpan(statement.bounds),
        source: span(statement.source),
        connector: span(statement.connector),
        target: span(statement.target),
        ...(label && { label }),
      });
      continue;
    }
    const access = optional(statement.accessKeyword, statement.mode);
    relationships.set(id, {
      notation: 'longForm',
      statement: statementSpan(statement.bounds),
      type: span(statement.type),
      id: span(statement.id),
      source: span(statement.source),
      target: span(statement.target),
      ...(access && { access }),
      ...(statement.directed && { directed: span(statement.directed) }),
      ...(label && { label }),
    });
  }

  const notes = new Map<string, ArchiMateNoteSource>();
  for (const statement of statements.notes) {
    const on = optional(statement.on, statement.anchor);
    notes.set(statement.id.image, {
      statement: statementSpan(statement.bounds),
      id: span(statement.id),
      text: span(statement.text),
      ...(on && { on }),
    });
  }

  const positionSource = (entry: ElementPositionEntry): ArchiMatePositionSource => {
    const size = optional(entry.sizeKeyword, entry.size);
    return {
      statement: statementSpan(entry.bounds),
      id: span(entry.id),
      x: span(entry.x),
      y: span(entry.y),
      ...(size && { size }),
    };
  };
  const anchorSource = (entry: AnchorEntry): ArchiMateAnchorSource => {
    const from = optional(entry.fromKeyword, entry.sourceSide);
    const to = optional(entry.toKeyword, entry.targetSide);
    return { statement: statementSpan(entry.bounds), ...(from && { from }), ...(to && { to }) };
  };
  const { block } = statements.positions;
  return {
    elements,
    relationships,
    notes,
    ...(block && { positionsBlock: statementSpan(block.bounds) }),
    positions: new Map(Array.from(statements.positions.positions, ([id, entry]) => [id, positionSource(entry)])),
    anchors: new Map(Array.from(statements.positions.anchors, ([id, entry]) => [id, anchorSource(entry)])),
  };
}
