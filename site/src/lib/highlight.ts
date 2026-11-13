import { getElementType } from 'archimaid/language';

type ElementCategory = NonNullable<ReturnType<typeof getElementType>>['category'];

export type TokenKind =
  | 'plain'
  | 'keyword'
  | 'identifier'
  | 'relationshipId'
  | 'relationshipType'
  | 'operator'
  | 'string'
  | 'comment'
  | `layer-${ElementCategory}`;

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

const statementKeywords = new Set([
  'archimate-beta',
  'layout',
  'direction',
  'element',
  'relationship',
  'nest',
  'note',
  'description',
  'click',
]);
const freeTextKeywords = new Set(['title:', 'accTitle:', 'accDescr:']);
const modifierKeywords = new Set(['on', 'in', 'via', 'access', 'read', 'write', 'readWrite', 'directed']);

const tokenPattern = /(?<space>\s+)|(?<string>"(?:\\.|[^"\\])*"?)|(?<comment>%%.*)|(?<word>[\w-]+:?)|(?<symbol>[^\s\w"]+)/g;

function classifyWord(word: string, index: number, statement: string | undefined): TokenKind {
  if (index === 0 && statementKeywords.has(word)) return 'keyword';
  if (modifierKeywords.has(word)) return 'keyword';
  if (statement === 'element' && index === 1) {
    const definition = getElementType(word);
    return definition ? `layer-${definition.category}` : 'identifier';
  }
  if (statement === 'relationship' && index === 1) return 'relationshipType';
  if (statement === 'relationship' && index === 2) return 'relationshipId';
  return 'identifier';
}

function highlightLine(line: string): Token[] {
  const indent = /^\s*/.exec(line)?.[0] ?? '';
  const body = line.slice(indent.length);
  const leading: Token[] = indent ? [{ text: indent, kind: 'plain' }] : [];

  const freeText = /^(\S+)(\s.*)?$/.exec(body);
  if (freeText?.[1] && freeTextKeywords.has(freeText[1])) {
    return [...leading, { text: freeText[1], kind: 'keyword' }, { text: freeText[2] ?? '', kind: 'string' }];
  }

  const tokens: Token[] = [...leading];
  let wordIndex = 0;
  let statement: string | undefined;
  for (const match of body.matchAll(tokenPattern)) {
    const { space, string, comment, word, symbol } = match.groups ?? {};
    if (space !== undefined) tokens.push({ text: space, kind: 'plain' });
    else if (string !== undefined) {
      tokens.push({ text: string, kind: 'string' });
      wordIndex += 1;
    } else if (comment !== undefined) tokens.push({ text: comment, kind: 'comment' });
    else if (word !== undefined) {
      if (wordIndex === 0) statement = word;
      tokens.push({ text: word, kind: classifyWord(word, wordIndex, statement) });
      wordIndex += 1;
    } else if (symbol !== undefined) tokens.push({ text: symbol, kind: 'operator' });
  }
  return tokens;
}

export function highlightArchiMate(source: string): Token[][] {
  return source.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(highlightLine);
}
