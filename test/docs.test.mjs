import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isArchiMateSource } from '../dist/cli/sources.js';
import { validateArchiMate } from '../dist/language.js';

const documents = ['README.md', 'skills/archimaid/SKILL.md'];

function fencedBlocks(markdown) {
  const blocks = [];
  const pattern = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1[ \t]*$/gmu;
  for (const match of markdown.matchAll(pattern)) {
    const line = markdown.slice(0, match.index).split('\n').length;
    blocks.push({ line, source: match[2] });
  }
  return blocks;
}

test('every archimate-beta example in the README and the agent skill is valid', async () => {
  let checked = 0;
  for (const document of documents) {
    const markdown = await readFile(new URL(`../${document}`, import.meta.url), 'utf8');
    for (const { line, source } of fencedBlocks(markdown).filter(({ source }) => isArchiMateSource(source))) {
      const errors = validateArchiMate(source).diagnostics.filter(({ severity }) => severity === 'error');
      assert.deepEqual(
        errors.map(({ message }) => message),
        [],
        `${document}:${line}`,
      );
      checked++;
    }
  }
  assert.ok(checked >= 4, `only ${checked} examples found`);
});
