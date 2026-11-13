const yamlWhitespace = /\s/;

function isLineBreak(character: string | undefined): boolean {
  return character === '\n' || character === '\r';
}

function isYamlWhitespace(character: string | undefined): boolean {
  return character !== undefined && yamlWhitespace.test(character);
}

function lastLineBreakInWhitespaceRun(text: string, from: number): number {
  let lineBreak = -1;
  for (let index = from; isYamlWhitespace(text[index]); index++) {
    if (isLineBreak(text[index])) lineBreak = index;
  }
  return lineBreak;
}

type FrontmatterMatch =
  | { readonly kind: 'none' }
  | { readonly kind: 'closed'; readonly length: number }
  | { readonly kind: 'unclosed'; readonly column: number };

// Mirrors matchFrontMatter in Mermaid 12.3.0 so the validator skips exactly the blocks a Mermaid host strips.
// Like Mermaid, it expects line breaks already normalized to "\n".
function matchFrontmatter(text: string): FrontmatterMatch {
  let cursor = 0;
  while (isYamlWhitespace(text[cursor]) && !isLineBreak(text[cursor])) cursor++;
  if (!text.startsWith('---', cursor)) return { kind: 'none' };
  const openingEnds: number[] = [];
  for (let index = cursor + 3; isYamlWhitespace(text[index]); index++) {
    if (isLineBreak(text[index])) openingEnds.push(index);
  }
  const [firstOpeningEnd] = openingEnds;
  if (firstOpeningEnd === undefined) return { kind: 'none' };

  const closingFence = text.slice(0, cursor) + '---';
  const closingEnd = (index: number): number =>
    isLineBreak(text[index]) && text.startsWith(closingFence, index + 1)
      ? lastLineBreakInWhitespaceRun(text, index + 1 + closingFence.length)
      : -1;
  let lastClosingFence = -1;
  for (let index = firstOpeningEnd + 1; index < text.length; index++) {
    if (closingEnd(index) !== -1) lastClosingFence = index;
  }
  const openingEnd = openingEnds.filter((candidate) => candidate < lastClosingFence).at(-1) ?? firstOpeningEnd;
  for (let index = openingEnd + 1; index <= lastClosingFence; index++) {
    const end = closingEnd(index);
    if (end !== -1) return { kind: 'closed', length: end + 1 };
  }
  return { kind: 'unclosed', column: cursor + 1 };
}

// Blanking frontmatter instead of removing it keeps every later token on its original line.
export function blankFrontmatter(text: string): FrontmatterMatch & { readonly text: string } {
  const normalized = text.replace(/\r\n?/g, '\n');
  const match = matchFrontmatter(normalized);
  if (match.kind !== 'closed') return { ...match, text };
  const lineBreaks = normalized.slice(0, match.length).split('\n').length - 1;
  const end = text.split(/(?<=\r\n|\r(?!\n)|\n)/).slice(0, lineBreaks).join('').length;
  return { ...match, text: text.slice(0, end).replace(/[^\r\n]/g, '') + text.slice(end) };
}
