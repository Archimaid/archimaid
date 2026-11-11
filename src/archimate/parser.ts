import { CstParser, createToken, EOF, Lexer } from 'chevrotain';
import type { CstNode, IToken } from 'chevrotain';
import { getElementType, getRelationshipNotation } from './catalogue.js';
import type { AccessMode } from './catalogue.js';
import type {
  ArchiMateDirection,
  ArchiMateLayout,
  ArchiMateModel,
  ArchiMateNesting,
  ArchiMateNote,
  ArchiMateRelationship,
} from './model.js';

const space = createToken({ name: 'Space', pattern: /[ \t]+/, group: Lexer.SKIPPED });
const comment = createToken({ name: 'Comment', pattern: /%%[^\r\n]*/, group: Lexer.SKIPPED });
const newline = createToken({ name: 'Newline', pattern: /\r\n|\r|\n/, line_breaks: true });
const metadata = createToken({ name: 'Metadata', pattern: /(?:title|accTitle|accDescr)[ \t]*:[^\r\n]*/ });
const quoted = createToken({
  name: 'QuotedText',
  pattern: /"(?:[^"\\\u0000-\u001F]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"/,
  line_breaks: false,
  label: 'quoted text',
});
const arrow = createToken({ name: 'Arrow', pattern: /->/, label: '"->"' });
const identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_](?:[\w]|-(?!>))*/, label: 'identifier' });
const header = createToken({ name: 'Header', pattern: /archimate-beta(?![\w-])/, categories: identifier });

function keyword(name: string, text: string) {
  return createToken({ name, pattern: new RegExp(text), longer_alt: identifier, categories: identifier });
}

const direction = keyword('Direction', 'direction');
const layout = keyword('Layout', 'layout');
const element = keyword('Element', 'element');
const description = keyword('Description', 'description');
const relationship = keyword('Relationship', 'relationship');
const access = keyword('Access', 'access');
const directed = keyword('Directed', 'directed');
const label = keyword('Label', 'label');
const note = keyword('Note', 'note');
const on = keyword('On', 'on');
const nest = keyword('Nest', 'nest');
const inside = keyword('In', 'in');
const via = keyword('Via', 'via');

const tokens = [
  space, comment, newline, header, metadata, quoted, arrow, direction, layout, element,
  description, relationship, access, directed, label, note, on, nest, inside, via, identifier,
];
const lexer = new Lexer(tokens);

class ArchiMateParser extends CstParser {
  readonly document = this.RULE('document', () => {
    this.MANY(() => this.CONSUME(newline));
    this.CONSUME(header, { ERR_MSG: 'Expected the "archimate-beta" diagram header.' });
    this.MANY2(() => {
      this.CONSUME2(newline);
      this.OPTION(() => this.SUBRULE(this.statement));
    });
    this.CONSUME(EOF, {
      ERR_MSG: 'Expected a new line or an ArchiMate declaration (layout, direction, element, description, relationship, note, nest, or metadata).',
    });
  });

  private readonly statement = this.RULE('statement', () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.directionStatement) },
      { ALT: () => this.SUBRULE(this.layoutStatement) },
      { ALT: () => this.SUBRULE(this.elementStatement) },
      { ALT: () => this.SUBRULE(this.descriptionStatement) },
      { ALT: () => this.SUBRULE(this.relationshipStatement) },
      { ALT: () => this.SUBRULE(this.noteStatement) },
      { ALT: () => this.SUBRULE(this.nestingStatement) },
      { ALT: () => this.SUBRULE(this.metadataStatement) },
    ]);
  });

  private readonly directionStatement = this.RULE('directionStatement', () => {
    this.CONSUME(direction);
    this.CONSUME(identifier, { LABEL: 'value' });
  });

  private readonly layoutStatement = this.RULE('layoutStatement', () => {
    this.CONSUME(layout);
    this.CONSUME(identifier, { LABEL: 'value' });
  });

  private readonly elementStatement = this.RULE('elementStatement', () => {
    this.CONSUME(element);
    this.CONSUME(identifier, { LABEL: 'type' });
    this.CONSUME2(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'name' });
  });

  private readonly descriptionStatement = this.RULE('descriptionStatement', () => {
    this.CONSUME(description);
    this.CONSUME(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'value' });
  });

  private readonly relationshipStatement = this.RULE('relationshipStatement', () => {
    this.CONSUME(relationship);
    this.CONSUME(identifier, { LABEL: 'type' });
    this.CONSUME2(identifier, { LABEL: 'id' });
    this.CONSUME3(identifier, { LABEL: 'source' });
    this.CONSUME(arrow);
    this.CONSUME4(identifier, { LABEL: 'target' });
    this.OPTION(() => {
      this.CONSUME(access);
      this.CONSUME5(identifier, { LABEL: 'mode' });
    });
    this.OPTION2(() => this.CONSUME(directed));
    this.OPTION3(() => {
      this.CONSUME(label);
      this.CONSUME(quoted, { LABEL: 'labelText' });
    });
  });

  private readonly metadataStatement = this.RULE('metadataStatement', () => {
    this.CONSUME(metadata);
  });

  private readonly noteStatement = this.RULE('noteStatement', () => {
    this.CONSUME(note);
    this.CONSUME(identifier, { LABEL: 'id' });
    this.CONSUME(quoted, { LABEL: 'text' });
    this.OPTION(() => {
      this.CONSUME(on);
      this.CONSUME2(identifier, { LABEL: 'anchor' });
    });
  });

  private readonly nestingStatement = this.RULE('nestingStatement', () => {
    this.CONSUME(nest);
    this.CONSUME(identifier, { LABEL: 'child' });
    this.CONSUME(inside);
    this.CONSUME2(identifier, { LABEL: 'parent' });
    this.CONSUME(via);
    this.CONSUME3(identifier, { LABEL: 'relationshipId' });
  });

  constructor() {
    super(tokens);
    this.performSelfAnalysis();
  }
}

type Context = CstNode['children'];
type Declaration =
  | { kind: 'direction'; value: IToken }
  | { kind: 'layout'; value: IToken }
  | { kind: 'metadata'; value: IToken }
  | { kind: 'element'; type: IToken; id: IToken; name: IToken }
  | { kind: 'description'; id: IToken; value: IToken }
  | { kind: 'note'; id: IToken; text: IToken; anchor?: IToken }
  | { kind: 'nesting'; child: IToken; parent: IToken; relationshipId: IToken }
  | RelationshipDeclaration;

interface RelationshipDeclaration {
  kind: 'relationship';
  type: IToken;
  id: IToken;
  source: IToken;
  target: IToken;
  mode?: IToken;
  directed?: IToken;
  label?: IToken;
}

function requiredToken(ctx: Context, name: string): IToken {
  const item = ctx[name]?.[0];
  if (!item || !('tokenType' in item)) throw new Error('Incomplete ArchiMate parse tree.');
  return item;
}

const parser = new ArchiMateParser();
const BaseVisitor = parser.getBaseCstVisitorConstructor<undefined, Declaration | Declaration[]>();

class DeclarationVisitor extends BaseVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  document(ctx: Context): Declaration[] {
    return (ctx.statement ?? []).flatMap((node) => {
      if (!('children' in node)) throw new Error('Invalid ArchiMate parse tree.');
      return this.visit(node);
    });
  }

  statement(ctx: Context): Declaration | Declaration[] {
    const child = Object.values(ctx)[0]?.[0];
    if (!child || !('children' in child)) throw new Error('Incomplete ArchiMate statement.');
    return this.visit(child);
  }

  directionStatement(ctx: Context): Declaration {
    return { kind: 'direction', value: requiredToken(ctx, 'value') };
  }

  layoutStatement(ctx: Context): Declaration {
    return { kind: 'layout', value: requiredToken(ctx, 'value') };
  }

  elementStatement(ctx: Context): Declaration {
    return {
      kind: 'element',
      type: requiredToken(ctx, 'type'),
      id: requiredToken(ctx, 'id'),
      name: requiredToken(ctx, 'name'),
    };
  }

  descriptionStatement(ctx: Context): Declaration {
    return { kind: 'description', id: requiredToken(ctx, 'id'), value: requiredToken(ctx, 'value') };
  }

  relationshipStatement(ctx: Context): Declaration {
    return {
      kind: 'relationship',
      type: requiredToken(ctx, 'type'),
      id: requiredToken(ctx, 'id'),
      source: requiredToken(ctx, 'source'),
      target: requiredToken(ctx, 'target'),
      ...(ctx.mode && { mode: requiredToken(ctx, 'mode') }),
      ...(ctx.Directed && { directed: requiredToken(ctx, 'Directed') }),
      ...(ctx.labelText && { label: requiredToken(ctx, 'labelText') }),
    };
  }

  metadataStatement(ctx: Context): Declaration {
    return { kind: 'metadata', value: requiredToken(ctx, 'Metadata') };
  }

  noteStatement(ctx: Context): Declaration {
    return {
      kind: 'note',
      id: requiredToken(ctx, 'id'),
      text: requiredToken(ctx, 'text'),
      ...(ctx.anchor && { anchor: requiredToken(ctx, 'anchor') }),
    };
  }

  nestingStatement(ctx: Context): Declaration {
    return {
      kind: 'nesting',
      child: requiredToken(ctx, 'child'),
      parent: requiredToken(ctx, 'parent'),
      relationshipId: requiredToken(ctx, 'relationshipId'),
    };
  }
}

const visitor = new DeclarationVisitor();

export type ArchiMateErrorCode =
  | 'LEXICAL_ERROR'
  | 'SYNTAX_ERROR'
  | 'INVALID_TEXT'
  | 'INVALID_DIRECTION'
  | 'INVALID_LAYOUT'
  | 'DUPLICATE_DECLARATION'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_ELEMENT_TYPE'
  | 'UNKNOWN_RELATIONSHIP_TYPE'
  | 'UNKNOWN_ELEMENT'
  | 'UNSUPPORTED_ENDPOINT'
  | 'INVALID_RELATIONSHIP_PROPERTY'
  | 'INVALID_NOTE_TARGET'
  | 'INVALID_NESTING';

export class ArchiMateError extends Error {
  constructor(
    readonly code: ArchiMateErrorCode,
    readonly line: number,
    readonly column: number,
    readonly detail: string,
  ) {
    super('Line ' + line + ', column ' + column + ': ' + detail);
    this.name = 'ArchiMateError';
  }
}

export interface ArchiMateParseOptions {
  readonly lineOffset?: number;
}

type Fail = (code: ArchiMateErrorCode, token: IToken, message: string) => never;
type MetadataKey = 'title' | 'accTitle' | 'accDescription';
type ElementDeclaration = Extract<Declaration, { kind: 'element' }>;
type DescriptionDeclaration = Extract<Declaration, { kind: 'description' }>;
type NoteDeclaration = Extract<Declaration, { kind: 'note' }>;
type NestingDeclaration = Extract<Declaration, { kind: 'nesting' }>;
type EntityDeclaration = ElementDeclaration | RelationshipDeclaration | NoteDeclaration;

function readDirection(token: IToken, fail: Fail): ArchiMateDirection {
  switch (token.image) {
    case 'TD':
    case 'TB': return 'TB';
    case 'BT':
    case 'LR':
    case 'RL': return token.image;
    default: return fail('INVALID_DIRECTION', token, 'Expected direction TB, TD, BT, LR, or RL.');
  }
}

function readAccessMode(token: IToken, fail: Fail): AccessMode {
  switch (token.image) {
    case 'read':
    case 'write':
    case 'readWrite':
    case 'unspecified': return token.image;
    default: return fail(
      'INVALID_RELATIONSHIP_PROPERTY',
      token,
      'Expected access mode read, write, readWrite, or unspecified.',
    );
  }
}

function ensureXmlText(value: string, token: IToken, fail: Fail): string {
  // XML 1.0 excludes control characters and unpaired UTF-16 surrogate code units.
  if (/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u.test(value)) {
    fail('INVALID_TEXT', token, 'Text contains a character that cannot be written to SVG.');
  }
  return value;
}

function readQuotedText(token: IToken, fail: Fail): string {
  const value: unknown = JSON.parse(token.image);
  if (typeof value !== 'string') throw new Error('Invalid ArchiMate quoted token.');
  return ensureXmlText(value, token, fail);
}

const parentToChildNestingTypes = new Set([
  'composition', 'aggregation', 'assignment', 'realization', 'access',
]);

function validateNesting(
  declarations: readonly NestingDeclaration[],
  entities: ReadonlyMap<string, EntityDeclaration>,
  relationships: readonly ArchiMateRelationship[],
  fail: Fail,
): ArchiMateNesting[] {
  if (!declarations.length) return [];

  const relationshipsById = new Map(relationships.map((entry) => [entry.id, entry]));
  const parents = new Map<string, NestingDeclaration>();
  const nesting = declarations.map((statement) => {
    const child = statement.child.image;
    const parent = statement.parent.image;
    const relationshipId = statement.relationshipId.image;
    for (const token of [statement.child, statement.parent]) {
      if (entities.get(token.image)?.kind !== 'element') {
        fail('INVALID_NESTING', token, 'Nesting requires an ArchiMate element. Found "' + token.image + '".');
      }
    }
    if (child === parent) {
      fail('INVALID_NESTING', statement.child, 'An element cannot be nested inside itself.');
    }
    if (parents.has(child)) {
      fail('INVALID_NESTING', statement.child, 'Element "' + child + '" already has a nesting parent.');
    }
    const entry = relationshipsById.get(relationshipId);
    if (!entry) {
      return fail('INVALID_NESTING', statement.relationshipId, 'Unknown relationship "' + relationshipId + '".');
    }
    const valid = entry.type === 'specialization'
      ? entry.source === child && entry.target === parent
      : parentToChildNestingTypes.has(entry.type) && entry.source === parent && entry.target === child;
    if (!valid) {
      fail(
        'INVALID_NESTING',
        statement.relationshipId,
        'Relationship "' + relationshipId + '" does not support nesting "' + child + '" in "' + parent + '".',
      );
    }
    parents.set(child, statement);
    return { child, parent, relationship: relationshipId };
  });

  const checked = new Set<string>();
  for (const child of parents.keys()) {
    const visited = new Set<string>();
    let current = child;
    while (!checked.has(current)) {
      const statement = parents.get(current);
      if (!statement) break;
      if (visited.has(current)) {
        fail('INVALID_NESTING', statement.child, 'Nesting creates a cycle at "' + current + '".');
      }
      visited.add(current);
      current = statement.parent.image;
    }
    for (const id of visited) checked.add(id);
  }
  return nesting;
}

function validateDeclarations(declarations: Declaration[], fail: Fail): ArchiMateModel {
  let diagramDirection: ArchiMateDirection | undefined;
  let diagramLayout: ArchiMateLayout | undefined;
  const diagramMetadata: Partial<Record<MetadataKey, string>> = {};
  const entities = new Map<string, EntityDeclaration>();
  const descriptions = new Map<string, DescriptionDeclaration>();
  const elementDeclarations: ElementDeclaration[] = [];
  const relationshipDeclarations: RelationshipDeclaration[] = [];
  const noteDeclarations: NoteDeclaration[] = [];
  const nestingDeclarations: NestingDeclaration[] = [];

  for (const statement of declarations) {
    switch (statement.kind) {
      case 'direction':
        if (diagramDirection) fail('DUPLICATE_DECLARATION', statement.value, 'Direction is already set.');
        diagramDirection = readDirection(statement.value, fail);
        break;
      case 'layout': {
        const { value } = statement;
        if (diagramLayout) fail('DUPLICATE_DECLARATION', value, 'Layout is already set.');
        if (value.image !== 'architecture' && value.image !== 'framework' && value.image !== 'graph') {
          fail('INVALID_LAYOUT', value, 'Expected layout architecture, framework, or graph.');
        }
        diagramLayout = value.image;
        break;
      }
      case 'metadata': {
        const separator = statement.value.image.indexOf(':');
        const name = statement.value.image.slice(0, separator).trim();
        const key = name === 'title' ? 'title' : name === 'accTitle' ? 'accTitle' : 'accDescription';
        if (diagramMetadata[key] !== undefined) {
          fail('DUPLICATE_DECLARATION', statement.value, name + ' is already set.');
        }
        diagramMetadata[key] = ensureXmlText(statement.value.image.slice(separator + 1).trim(), statement.value, fail);
        break;
      }
      case 'description':
        if (descriptions.has(statement.id.image)) {
          fail('DUPLICATE_DECLARATION', statement.id, 'Description is already set for "' + statement.id.image + '".');
        }
        descriptions.set(statement.id.image, statement);
        break;
      case 'element':
      case 'relationship':
      case 'note':
        if (entities.has(statement.id.image)) {
          fail('DUPLICATE_ID', statement.id, 'ID "' + statement.id.image + '" is already declared.');
        }
        entities.set(statement.id.image, statement);
        if (statement.kind === 'element') {
          if (!getElementType(statement.type.image)) {
            fail('UNKNOWN_ELEMENT_TYPE', statement.type, 'Unknown element type "' + statement.type.image + '".');
          }
          elementDeclarations.push(statement);
        } else if (statement.kind === 'relationship') {
          relationshipDeclarations.push(statement);
        } else {
          noteDeclarations.push(statement);
        }
        break;
      case 'nesting':
        nestingDeclarations.push(statement);
        break;
    }
  }

  for (const [id, statement] of descriptions) {
    if (entities.get(id)?.kind !== 'element') {
      fail('UNKNOWN_ELEMENT', statement.id, 'Description refers to an undeclared element "' + id + '".');
    }
  }

  const notes: ArchiMateNote[] = noteDeclarations.map((statement) => {
    if (statement.anchor && entities.get(statement.anchor.image)?.kind !== 'element') {
      fail('INVALID_NOTE_TARGET', statement.anchor, 'A note must be placed on a declared ArchiMate element.');
    }
    return {
      id: statement.id.image,
      text: readQuotedText(statement.text, fail),
      ...(statement.anchor && { on: statement.anchor.image }),
    };
  });

  function endpoint(token: IToken): ElementDeclaration | NoteDeclaration {
    const entity = entities.get(token.image);
    if (!entity) return fail('UNKNOWN_ELEMENT', token, 'Unknown element or note "' + token.image + '".');
    if (entity.kind === 'relationship') {
      return fail('UNSUPPORTED_ENDPOINT', token, 'Relationship endpoints must be elements or notes.');
    }
    return entity;
  }

  const relationships: ArchiMateRelationship[] = relationshipDeclarations.map((statement) => {
    const type = statement.type.image;
    if (!getRelationshipNotation(type)) {
      fail('UNKNOWN_RELATIONSHIP_TYPE', statement.type, 'Unknown relationship type "' + type + '".');
    }
    if (statement.mode && type !== 'access') {
      fail('INVALID_RELATIONSHIP_PROPERTY', statement.mode, 'Access mode is only valid on access relationships.');
    }
    if (statement.directed && type !== 'association') {
      fail('INVALID_RELATIONSHIP_PROPERTY', statement.directed, '"directed" is only valid on association relationships.');
    }
    const mode = statement.mode && readAccessMode(statement.mode, fail);
    const source = endpoint(statement.source);
    const target = endpoint(statement.target);
    return {
      id: statement.id.image,
      type,
      source: source.id.image,
      target: target.id.image,
      ...(mode && { access: mode }),
      ...(statement.directed && { directed: true }),
      ...(statement.label && { label: readQuotedText(statement.label, fail) }),
    };
  });
  const nesting = validateNesting(nestingDeclarations, entities, relationships, fail);
  const selectedLayout = diagramLayout ?? (diagramDirection === undefined ? 'architecture' : undefined);

  return {
    direction: diagramDirection ?? 'TB',
    ...(selectedLayout && { layout: selectedLayout }),
    ...diagramMetadata,
    elements: elementDeclarations.map((statement) => {
      const elementDescription = descriptions.get(statement.id.image);
      return {
        id: statement.id.image,
        type: statement.type.image,
        name: readQuotedText(statement.name, fail),
        ...(elementDescription && { description: readQuotedText(elementDescription.value, fail) }),
      };
    }),
    relationships,
    ...(notes.length > 0 && { notes }),
    ...(nesting.length > 0 && { nesting }),
  };
}

export function parseArchiMate(source: string, options: ArchiMateParseOptions = {}): ArchiMateModel {
  const lineOffset = options.lineOffset ?? 0;
  const fail: Fail = (code, token, message) => {
    const { startLine, startColumn } = token;
    if (startLine !== undefined && startLine > 0 && startColumn !== undefined && startColumn > 0) {
      throw new ArchiMateError(code, startLine + lineOffset, startColumn, message);
    }
    const lines = source.split(/\r\n|\n|\r/);
    throw new ArchiMateError(code, lines.length + lineOffset, (lines.at(-1)?.length ?? 0) + 1, message);
  };
  const tokenized = lexer.tokenize(source);
  const lexicalError = tokenized.errors[0];
  if (lexicalError) {
    throw new ArchiMateError(
      'LEXICAL_ERROR',
      (lexicalError.line ?? 1) + lineOffset,
      lexicalError.column ?? 1,
      lexicalError.message,
    );
  }

  parser.input = tokenized.tokens;
  const tree = parser.document();
  const syntaxError = parser.errors[0];
  if (syntaxError) fail('SYNTAX_ERROR', syntaxError.token, syntaxError.message);
  const declarations = visitor.visit(tree);
  if (!Array.isArray(declarations)) throw new Error('Invalid ArchiMate document parse tree.');
  return validateDeclarations(declarations, fail);
}
