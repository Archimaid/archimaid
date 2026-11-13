import { createToken, Lexer } from 'chevrotain';
import type { TokenType } from 'chevrotain';
import type { AccessMode, RelationshipType } from './catalogue.js';

const space = createToken({ name: 'Space', pattern: /[ \t]+/, group: Lexer.SKIPPED });
const comment = createToken({ name: 'Comment', pattern: /%%[^\r\n]*/, group: Lexer.SKIPPED });
export const newline = createToken({ name: 'Newline', pattern: /\r\n|\r|\n/, line_breaks: true });
const metadataPattern = /(?:title|accTitle|accDescr)[ \t]*:[^\r\n]*/y;
const accDescrBlockPattern = /accDescr[ \t]*\{[^}]*\}/y;
const aggregationPattern = /o--(?![->|/])/y;

function startsStatement(text: string, offset: number): boolean {
  for (let index = offset - 1; index >= 0 && text[index] !== '\n' && text[index] !== '\r'; index--) {
    if (text[index] !== ' ' && text[index] !== '\t') return false;
  }
  return true;
}

// A "%%" after whitespace starts a trailing comment, as on every other statement. Double quotes keep it literal.
function metadataValueEnd(image: string): number {
  let quoted = false;
  for (let index = image.indexOf(':') + 1; index < image.length; index++) {
    const character = image[index];
    if (quoted && character === '\\') {
      index++;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === '%' && image[index + 1] === '%' && /[ \t]/.test(image[index - 1] ?? '')) {
      return index;
    }
  }
  return image.length;
}

// Metadata only starts a line, so an element named "title" can still precede a ": label".
function matchMetadata(text: string, offset: number): [string] | null {
  if (!startsStatement(text, offset)) return null;
  metadataPattern.lastIndex = offset;
  const match = metadataPattern.exec(text);
  return match ? [match[0].slice(0, metadataValueEnd(match[0]))] : null;
}

function matchAccDescrBlock(text: string, offset: number): RegExpExecArray | null {
  if (!startsStatement(text, offset)) return null;
  accDescrBlockPattern.lastIndex = offset;
  return accDescrBlockPattern.exec(text);
}

// An ID "o" at the start of "o--b" must not lex as the Aggregation glyph, so the glyph needs a source before it.
function matchAggregation(text: string, offset: number): RegExpExecArray | null {
  if (startsStatement(text, offset) || !/[ \t]/.test(text[offset - 1] ?? '')) return null;
  aggregationPattern.lastIndex = offset;
  return aggregationPattern.exec(text);
}

const openBracePattern = /\{/y;

// After "accDescr" a brace starts an accessible description, which has its own token and its own error message.
function matchOpenBrace(text: string, offset: number): RegExpExecArray | null {
  const lineStart = Math.max(text.lastIndexOf('\n', offset - 1), text.lastIndexOf('\r', offset - 1)) + 1;
  if (/^[ \t]*accDescr[ \t]*$/.test(text.slice(lineStart, offset))) return null;
  openBracePattern.lastIndex = offset;
  return openBracePattern.exec(text);
}

export const openBrace = createToken({
  name: 'OpenBrace',
  pattern: { exec: matchOpenBrace },
  line_breaks: false,
  start_chars_hint: ['{'],
  label: '"{"',
});
export const closeBrace = createToken({ name: 'CloseBrace', pattern: /\}/, label: '"}"' });

export const accDescrBlock = createToken({
  name: 'AccDescrBlock',
  pattern: { exec: matchAccDescrBlock },
  line_breaks: true,
  start_chars_hint: ['a'],
});
export const metadata = createToken({
  name: 'Metadata',
  pattern: { exec: matchMetadata },
  line_breaks: false,
  start_chars_hint: ['t', 'a'],
});
// eslint-disable-next-line no-control-regex -- JSON strings exclude unescaped control characters.
export const quotedTextPattern = /"(?:[^"\\\u0000-\u001F]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"/;
export const quoted = createToken({
  name: 'QuotedText',
  pattern: quotedTextPattern,
  line_breaks: false,
  label: 'quoted text',
});
export const arrow = createToken({ name: 'Arrow', pattern: /->/, label: '"->"' });
export const colon = createToken({ name: 'Colon', pattern: /:/, label: '":"' });
export const identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_]\w*(?:-\w+)*/, label: 'identifier' });
export const header = createToken({ name: 'Header', pattern: /archimate-beta(?![\w-])/, categories: identifier });

function keyword(name: string, text: string): TokenType {
  return createToken({ name, pattern: new RegExp(text), longer_alt: identifier, categories: identifier });
}

export const direction = keyword('Direction', 'direction');
export const layout = keyword('Layout', 'layout');
export const element = keyword('Element', 'element');
export const description = keyword('Description', 'description');
export const relationship = keyword('Relationship', 'relationship');
export const access = keyword('Access', 'access');
export const directed = keyword('Directed', 'directed');
export const label = keyword('Label', 'label');
export const note = keyword('Note', 'note');
export const on = keyword('On', 'on');
export const nest = keyword('Nest', 'nest');
export const inside = keyword('In', 'in');
export const via = keyword('Via', 'via');

export interface ConnectorNotation {
  readonly type: RelationshipType;
  readonly access?: AccessMode;
  readonly directed?: true;
}

// The left endpoint is always the model source; glyphs mirror the rendered markers.
export const relationshipConnectors = {
  '*--': { type: 'composition' },
  'o--': { type: 'aggregation' },
  '@==>': { type: 'assignment' },
  '..|>': { type: 'realization' },
  '-->': { type: 'serving' },
  '..': { type: 'access', access: 'unspecified' },
  '<..': { type: 'access', access: 'read' },
  '..>': { type: 'access', access: 'write' },
  '<..>': { type: 'access', access: 'readWrite' },
  '-.->': { type: 'influence' },
  '---': { type: 'association' },
  '--/': { type: 'association', directed: true },
  '==>': { type: 'triggering' },
  '-.=>': { type: 'flow' },
  '--|>': { type: 'specialization' },
} as const satisfies Record<string, ConnectorNotation>;

export const connector = createToken({ name: 'Connector', pattern: Lexer.NA, label: 'relationship connector' });
export const connectorNotations = new Map<TokenType, ConnectorNotation>();
const connectorTokens = Object.entries(relationshipConnectors)
  .sort(([left], [right]) => right.length - left.length)
  .map(([glyph, notation], index) => {
    const tokenLabel = '"' + glyph + '"';
    const token =
      glyph === 'o--'
        ? createToken({
            name: `Connector${index}`,
            pattern: { exec: matchAggregation },
            line_breaks: false,
            start_chars_hint: ['o'],
            label: tokenLabel,
            categories: connector,
          })
        : createToken({
            name: `Connector${index}`,
            pattern: new RegExp(glyph.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')),
            label: tokenLabel,
            categories: connector,
          });
    connectorNotations.set(token, notation);
    return token;
  });

export const tokens = [
  space,
  comment,
  newline,
  header,
  accDescrBlock,
  metadata,
  quoted,
  connector,
  ...connectorTokens,
  arrow,
  colon,
  openBrace,
  closeBrace,
  direction,
  layout,
  element,
  description,
  relationship,
  access,
  directed,
  label,
  note,
  on,
  nest,
  inside,
  via,
  identifier,
];
export const lexer = new Lexer(tokens);

// eslint-disable-next-line no-control-regex -- JSON strings exclude unescaped control characters.
const quotedTextPrefix = /(?:[^"\\\u0000-\u001F]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*/y;

function describeInvalidQuotedText(text: string, offset: number): string {
  quotedTextPrefix.lastIndex = offset + 1;
  quotedTextPrefix.exec(text);
  const end = quotedTextPrefix.lastIndex;
  const character = text[end];
  if (character === undefined || character === '\n' || character === '\r') {
    return 'Text is missing its closing double quote.';
  }
  if (character === '\\') {
    return 'Text contains the invalid escape sequence "' + text.slice(end, end + 2) + '". Use "\\\\" for a backslash.';
  }
  return 'Text contains a control character. Use an escape sequence such as "\\t" instead.';
}

export function describeLexicalError(text: string, offset: number, length: number): string {
  const skipped = text.slice(offset, offset + length);
  const first = String.fromCodePoint(text.codePointAt(offset) ?? 0xfffd);
  if (first === "'") return 'Unexpected character "\'". Use double quotes for text.';
  if (first === '"') return describeInvalidQuotedText(text, offset);
  if (first === '{' && /(?:^|[\r\n])[ \t]*accDescr[ \t]*$/.test(text.slice(0, offset))) {
    return 'The accDescr block is missing its closing "}".';
  }
  if (/^[-.=<>@*|/]+$/.test(skipped)) return '"' + skipped + '" is not a relationship connector.';
  return 'Unexpected character "' + first + '".';
}
