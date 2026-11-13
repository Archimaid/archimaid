import type { IToken } from 'chevrotain';
import { elementTypes, getElementType, getRelationshipNotation, relationshipTypes } from './catalogue.js';
import type { AccessMode } from './catalogue.js';
import type { DiagnosticCollector, Report } from './diagnostics.js';
import type { ConnectorDeclaration, Declaration, RelationshipDeclaration } from './grammar.js';
import { accDescrBlock, connectorNotations, metadata, quotedTextPattern } from './lexer.js';
import type {
  ArchiMateDirection,
  ArchiMateElement,
  ArchiMateLayout,
  ArchiMateModel,
  ArchiMateNesting,
  ArchiMateNote,
  ArchiMateRelationship,
} from './model.js';
import { validateNesting } from './nesting.js';
import type { NestingDeclaration } from './nesting.js';
import { withSuggestion } from './suggestions.js';

type MetadataKey = 'title' | 'accTitle' | 'accDescription';
type ElementDeclaration = Extract<Declaration, { kind: 'element' }>;
type DescriptionDeclaration = Extract<Declaration, { kind: 'description' }>;
type NoteDeclaration = Extract<Declaration, { kind: 'note' }>;
type EntityDeclaration = ElementDeclaration | RelationshipDeclaration | NoteDeclaration;

const directionKeys = ['TB', 'TD', 'BT', 'LR', 'RL'];
const layoutKeys: readonly ArchiMateLayout[] = ['architecture', 'framework', 'graph'];
const accessModes: readonly AccessMode[] = ['read', 'write', 'readWrite', 'unspecified'];

function readDirection(token: IToken, report: Report): ArchiMateDirection | undefined {
  switch (token.image) {
    case 'TD':
    case 'TB':
      return 'TB';
    case 'BT':
    case 'LR':
    case 'RL':
      return token.image;
    default:
      report(
        'INVALID_DIRECTION',
        token,
        withSuggestion('Expected direction TB, TD, BT, LR, or RL.', token.image, directionKeys),
      );
      return undefined;
  }
}

function readLayout(token: IToken, report: Report): ArchiMateLayout | undefined {
  const value = layoutKeys.find((key) => key === token.image);
  if (!value) {
    report(
      'INVALID_LAYOUT',
      token,
      withSuggestion('Expected layout architecture, framework, or graph.', token.image, layoutKeys),
    );
  }
  return value;
}

function readAccessMode(token: IToken, report: Report): AccessMode | undefined {
  const value = accessModes.find((mode) => mode === token.image);
  if (!value) {
    report(
      'INVALID_RELATIONSHIP_PROPERTY',
      token,
      withSuggestion('Expected access mode read, write, readWrite, or unspecified.', token.image, accessModes),
    );
  }
  return value;
}

function checkXmlText(value: string, token: IToken, report: Report): string | undefined {
  // XML 1.0 excludes control characters and unpaired UTF-16 surrogate code units.
  // eslint-disable-next-line no-control-regex -- Allows tab, line feed and carriage return as the only control characters.
  if (/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(value)) {
    report('INVALID_TEXT', token, 'Text contains a character that cannot be written to SVG.');
    return undefined;
  }
  return value;
}

interface QuotedTextOptions {
  // Text that must not be blank names what is missing; omitting it allows blank text.
  readonly emptyMessage?: string;
  // Metadata values are quoted text inside a larger token, so they pass the quoted part separately.
  readonly image?: string;
}

function readQuotedText(token: IToken, report: Report, options: QuotedTextOptions = {}): string | undefined {
  const { emptyMessage, image = token.image } = options;
  const value: unknown = JSON.parse(image);
  if (typeof value !== 'string') throw new Error('Invalid ArchiMate quoted token.');
  if (emptyMessage !== undefined && value.trim() === '') {
    report('INVALID_TEXT', token, emptyMessage);
    return undefined;
  }
  return checkXmlText(value, token, report);
}

function readMetadata(token: IToken): { name: string; key: MetadataKey; value: string } {
  if (token.tokenType === accDescrBlock) {
    const value = token.image
      .slice(token.image.indexOf('{') + 1, -1)
      .trim()
      .replace(/[ \t]*(?:\r\n|\r|\n)[ \t]*/g, '\n');
    return { name: 'accDescr', key: 'accDescription', value };
  }
  const separator = token.image.indexOf(':');
  const name = token.image.slice(0, separator).trim();
  const key = name === 'title' ? 'title' : name === 'accTitle' ? 'accTitle' : 'accDescription';
  return { name, key, value: token.image.slice(separator + 1).trim() };
}

// A fully quoted metadata value is decoded like other text, so it can hold " %%" or escapes such as \u0025.
const wholeQuotedText = new RegExp('^' + quotedTextPattern.source + '$');

interface DiagramSettings {
  directionDeclared: boolean;
  layoutDeclared: boolean;
  direction: ArchiMateDirection | undefined;
  layout: ArchiMateLayout | undefined;
  readonly declaredMetadata: Set<MetadataKey>;
  readonly metadata: Partial<Record<MetadataKey, string>>;
}

interface CollectedDeclarations {
  readonly settings: DiagramSettings;
  readonly entities: Map<string, EntityDeclaration>;
  readonly descriptions: Map<string, DescriptionDeclaration>;
  readonly elements: ElementDeclaration[];
  readonly relationships: (RelationshipDeclaration | ConnectorDeclaration)[];
  readonly notes: NoteDeclaration[];
  readonly nesting: NestingDeclaration[];
}

interface ValidationContext {
  readonly diagnostics: DiagnosticCollector;
  readonly report: Report;
  readonly entities: ReadonlyMap<string, EntityDeclaration>;
  // Generated shorthand IDs must avoid every declared ID and every ID generated before them.
  readonly usedIds: Set<string>;
  readonly invalidRelationshipIds: Set<string>;
  readonly unknownEndpointIds: Set<string>;
  readonly shorthandStatements: Map<string, ConnectorDeclaration>;
}

function collectSetting(
  statement: Extract<Declaration, { kind: 'direction' | 'layout' | 'metadata' }>,
  settings: DiagramSettings,
  report: Report,
): void {
  switch (statement.kind) {
    case 'direction':
      if (settings.directionDeclared) {
        report('DUPLICATE_DECLARATION', statement.value, 'Direction is already set.');
        return;
      }
      settings.directionDeclared = true;
      settings.direction = readDirection(statement.value, report);
      return;
    case 'layout':
      if (settings.layoutDeclared) {
        report('DUPLICATE_DECLARATION', statement.value, 'Layout is already set.');
        return;
      }
      settings.layoutDeclared = true;
      settings.layout = readLayout(statement.value, report);
      return;
    case 'metadata': {
      const { name, key, value } = readMetadata(statement.value);
      if (settings.declaredMetadata.has(key)) {
        report('DUPLICATE_DECLARATION', statement.value, name + ' is already set.');
        return;
      }
      settings.declaredMetadata.add(key);
      const text =
        statement.value.tokenType === metadata && wholeQuotedText.test(value)
          ? readQuotedText(statement.value, report, { emptyMessage: name + ' must not be empty.', image: value })
          : checkXmlText(value, statement.value, report);
      if (text !== undefined) settings.metadata[key] = text;
      return;
    }
  }
}

function collectEntity(statement: EntityDeclaration, collected: CollectedDeclarations, report: Report): void {
  if (collected.entities.has(statement.id.image)) {
    report('DUPLICATE_ID', statement.id, 'ID "' + statement.id.image + '" is already declared.');
    return;
  }
  collected.entities.set(statement.id.image, statement);
  if (statement.kind === 'element') {
    if (!getElementType(statement.type.image)) {
      report(
        'UNKNOWN_ELEMENT_TYPE',
        statement.type,
        withSuggestion(
          'Unknown element type "' + statement.type.image + '".',
          statement.type.image,
          Object.keys(elementTypes),
        ),
      );
    }
    collected.elements.push(statement);
  } else if (statement.kind === 'relationship') {
    collected.relationships.push(statement);
  } else {
    collected.notes.push(statement);
  }
}

function collectDeclarations(declarations: readonly Declaration[], report: Report): CollectedDeclarations {
  const collected: CollectedDeclarations = {
    settings: {
      directionDeclared: false,
      layoutDeclared: false,
      direction: undefined,
      layout: undefined,
      declaredMetadata: new Set(),
      metadata: {},
    },
    entities: new Map(),
    descriptions: new Map(),
    elements: [],
    relationships: [],
    notes: [],
    nesting: [],
  };
  for (const statement of declarations) {
    switch (statement.kind) {
      case 'direction':
      case 'layout':
      case 'metadata':
        collectSetting(statement, collected.settings, report);
        break;
      case 'description':
        if (collected.descriptions.has(statement.id.image)) {
          report('DUPLICATE_DECLARATION', statement.id, 'Description is already set for "' + statement.id.image + '".');
          break;
        }
        collected.descriptions.set(statement.id.image, statement);
        break;
      case 'element':
      case 'relationship':
      case 'note':
        collectEntity(statement, collected, report);
        break;
      case 'connector':
        collected.relationships.push(statement);
        break;
      case 'nesting':
        collected.nesting.push(statement);
        break;
    }
  }
  return collected;
}

function checkDescriptionTargets(collected: CollectedDeclarations, report: Report): void {
  for (const [id, statement] of collected.descriptions) {
    if (collected.entities.get(id)?.kind !== 'element') {
      report('UNKNOWN_ELEMENT', statement.id, 'Description refers to an undeclared element "' + id + '".');
    }
  }
}

function buildNotes(collected: CollectedDeclarations, report: Report): ArchiMateNote[] {
  const notes: ArchiMateNote[] = [];
  for (const statement of collected.notes) {
    if (statement.anchor && collected.entities.get(statement.anchor.image)?.kind !== 'element') {
      report('INVALID_NOTE_TARGET', statement.anchor, 'A note must be placed on a declared ArchiMate element.');
    }
    const text = readQuotedText(statement.text, report, { emptyMessage: 'Note text must not be empty.' });
    if (text !== undefined) {
      notes.push({ id: statement.id.image, text, ...(statement.anchor && { on: statement.anchor.image }) });
    }
  }
  return notes;
}

function buildElements(collected: CollectedDeclarations, report: Report): ArchiMateElement[] {
  const elements: ArchiMateElement[] = [];
  for (const statement of collected.elements) {
    const name = readQuotedText(statement.name, report, { emptyMessage: 'Element name must not be empty.' });
    const elementDescription = collected.descriptions.get(statement.id.image);
    const descriptionText = elementDescription && readQuotedText(elementDescription.value, report);
    if (name !== undefined) {
      elements.push({
        id: statement.id.image,
        type: statement.type.image,
        name,
        ...(descriptionText !== undefined && { description: descriptionText }),
      });
    }
  }
  return elements;
}

function resolveEndpoint(context: ValidationContext, token: IToken): ElementDeclaration | NoteDeclaration | undefined {
  const entity = context.entities.get(token.image);
  if (!entity) {
    context.unknownEndpointIds.add(token.image);
    context.report('UNKNOWN_ELEMENT', token, 'Unknown element or note "' + token.image + '".');
    return undefined;
  }
  if (entity.kind === 'relationship') {
    context.report('UNSUPPORTED_ENDPOINT', token, 'Relationship endpoints must be elements or notes.');
    return undefined;
  }
  return entity;
}

function readLabel(context: ValidationContext, token: IToken | undefined): string | undefined {
  return (
    token &&
    readQuotedText(token, context.report, {
      emptyMessage: 'Relationship label must not be empty. Omit the label instead.',
    })
  );
}

function generateRelationshipId(context: ValidationContext, source: string, type: string, target: string): string {
  const base = source + '__' + type + '__' + target;
  let id = base;
  for (let suffix = 2; context.usedIds.has(id); suffix++) id = `${base}_${suffix}`;
  context.usedIds.add(id);
  return id;
}

function warnOnRepeatedShorthand(
  context: ValidationContext,
  statement: ConnectorDeclaration,
  labelText: string | undefined,
): void {
  const key = JSON.stringify([
    statement.source.image,
    statement.connector.tokenType.name,
    statement.target.image,
    labelText ?? null,
  ]);
  const original = context.shorthandStatements.get(key);
  if (!original) {
    context.shorthandStatements.set(key, statement);
    return;
  }
  context.diagnostics.warning(
    'DUPLICATE_RELATIONSHIP',
    statement.source,
    statement.label ?? statement.target,
    `This relationship repeats the one on line ${context.diagnostics.line(original.source)}. ` +
      'Remove the copy, or use the long form with distinct IDs if both are intended.',
  );
}

// Both notations map to this before resolution, so endpoint, label and identity rules exist once.
interface RelationshipSpecification {
  readonly notation: 'longForm' | 'shorthand';
  readonly type: string;
  readonly source: IToken;
  readonly target: IToken;
  readonly access: AccessMode | undefined;
  readonly directed: boolean;
  readonly label: IToken | undefined;
  readonly declaredId: IToken | undefined;
  readonly knownType: boolean;
  readonly shorthand: ConnectorDeclaration | undefined;
}

function specifyShorthand(statement: ConnectorDeclaration): RelationshipSpecification {
  const notation = connectorNotations.get(statement.connector.tokenType);
  if (!notation) throw new Error('Unknown ArchiMate connector token "' + statement.connector.image + '".');
  return {
    notation: 'shorthand',
    type: notation.type,
    source: statement.source,
    target: statement.target,
    access: notation.access,
    directed: notation.directed === true,
    label: statement.label,
    declaredId: undefined,
    knownType: true,
    shorthand: statement,
  };
}

// Property errors are reported here, before endpoints and labels, to keep the established diagnostic order.
function specifyLongForm(context: ValidationContext, statement: RelationshipDeclaration): RelationshipSpecification {
  const { report } = context;
  const type = statement.type.image;
  const knownType = getRelationshipNotation(type) !== undefined;
  if (!knownType) {
    report(
      'UNKNOWN_RELATIONSHIP_TYPE',
      statement.type,
      withSuggestion('Unknown relationship type "' + type + '".', type, relationshipTypes),
    );
  }
  if (statement.mode && type !== 'access') {
    report('INVALID_RELATIONSHIP_PROPERTY', statement.mode, 'Access mode is only valid on access relationships.');
  }
  if (statement.directed && type !== 'association') {
    report(
      'INVALID_RELATIONSHIP_PROPERTY',
      statement.directed,
      '"directed" is only valid on association relationships.',
    );
  }
  return {
    notation: 'longForm',
    type,
    source: statement.source,
    target: statement.target,
    access: statement.mode && readAccessMode(statement.mode, report),
    directed: statement.directed !== undefined,
    label: statement.label,
    declaredId: statement.id,
    knownType,
    shorthand: undefined,
  };
}

function resolveRelationship(
  context: ValidationContext,
  specification: RelationshipSpecification,
): ArchiMateRelationship {
  const endpointsValid = [
    resolveEndpoint(context, specification.source),
    resolveEndpoint(context, specification.target),
  ].every(Boolean);
  const labelText = readLabel(context, specification.label);
  const source = specification.source.image;
  const target = specification.target.image;
  const id = specification.declaredId?.image ?? generateRelationshipId(context, source, specification.type, target);
  const labelRejected = specification.label !== undefined && labelText === undefined;
  if (!endpointsValid || !specification.knownType) {
    context.invalidRelationshipIds.add(id);
  } else if (specification.shorthand && !labelRejected) {
    warnOnRepeatedShorthand(context, specification.shorthand, labelText);
  }
  const access = specification.access === 'unspecified' ? undefined : specification.access;
  return {
    id,
    type: specification.type,
    source,
    target,
    ...(access && { access }),
    ...(specification.directed && { directed: true }),
    ...(labelText !== undefined && { label: labelText }),
  };
}

function buildModel(
  settings: DiagramSettings,
  parts: Pick<ArchiMateModel, 'elements' | 'relationships'> & {
    readonly notes: readonly ArchiMateNote[];
    readonly nesting: readonly ArchiMateNesting[];
  },
): ArchiMateModel {
  const selectedLayout = settings.layout ?? (settings.direction === undefined ? 'architecture' : undefined);
  return {
    direction: settings.direction ?? 'TB',
    ...(selectedLayout && { layout: selectedLayout }),
    ...settings.metadata,
    elements: parts.elements,
    relationships: parts.relationships,
    ...(parts.notes.length > 0 && { notes: parts.notes }),
    ...(parts.nesting.length > 0 && { nesting: parts.nesting }),
  };
}

// The checks run in a fixed order because parseArchiMate throws the first error found.
export function validateDeclarations(
  declarations: Declaration[],
  diagnostics: DiagnosticCollector,
): ArchiMateModel | undefined {
  const report: Report = (code, token, message) => {
    diagnostics.error(code, token, message);
  };
  const collected = collectDeclarations(declarations, report);
  checkDescriptionTargets(collected, report);
  const notes = buildNotes(collected, report);
  const context: ValidationContext = {
    diagnostics,
    report,
    entities: collected.entities,
    usedIds: new Set(collected.entities.keys()),
    invalidRelationshipIds: new Set(),
    unknownEndpointIds: new Set(),
    shorthandStatements: new Map(),
  };
  const relationships = collected.relationships.map((statement) =>
    resolveRelationship(
      context,
      statement.kind === 'connector' ? specifyShorthand(statement) : specifyLongForm(context, statement),
    ),
  );
  const nesting = validateNesting(collected.nesting, collected.entities, {
    relationships,
    relationshipsById: new Map(relationships.map((entry) => [entry.id, entry])),
    invalidRelationshipIds: context.invalidRelationshipIds,
    unknownEndpointIds: context.unknownEndpointIds,
    report,
  });
  const elements = buildElements(collected, report);
  if (diagnostics.hasErrors) return undefined;
  return buildModel(collected.settings, { elements, relationships, notes, nesting });
}
