import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const example = fileURLToPath(new URL('../examples/order-fulfilment.mmd', import.meta.url));

test('the CLI accepts the documented diagram', () => {
  const result = spawnSync(process.execPath, [cli, 'validate', example], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /diagram syntax and structure checks passed/);
});

test('the CLI rejects an unknown endpoint from stdin and reports its location', () => {
  const result = spawnSync(process.execPath, [cli, 'validate', '-'], {
    encoding: 'utf8',
    input: [
      'archimate-beta',
      'element businessRole clerk "Fulfilment clerk"',
      'element businessProcess fulfil "Fulfil order"',
      'relationship assignment assigns clerk -> missing',
    ].join('\n'),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /<stdin>:4:\d+:/);
  assert.match(result.stderr, /Unknown element or note "missing"/);
});

test('the CLI skips frontmatter and a byte order mark from stdin and files', () => {
  const source = '---\nconfig:\n  theme: dark\n---\narchimate-beta\n  element applicationComponent billing "Billing"\n';
  const fromStdin = spawnSync(process.execPath, [cli, 'validate', '-'], { encoding: 'utf8', input: source });
  assert.equal(fromStdin.status, 0, fromStdin.stderr);

  const directory = mkdtempSync(join(tmpdir(), 'archimate-cli-'));
  try {
    const file = join(directory, 'diagram.mmd');
    writeFileSync(file, '\uFEFF' + source + '  billing --> missing\n');
    const fromFile = spawnSync(process.execPath, [cli, 'validate', file], { encoding: 'utf8' });
    assert.equal(fromFile.status, 1);
    assert.equal(fromFile.stderr.trim(), file + ':7:15: Unknown element or note "missing".');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function validateStdin(lines) {
  return spawnSync(process.execPath, [cli, 'validate', '-'], { encoding: 'utf8', input: lines.join('\n') });
}

test('the CLI prints warnings and still passes a diagram without errors', () => {
  const result = validateStdin([
    'archimate-beta',
    'element businessRole a "A"',
    'element businessRole b "B"',
    'a --> b',
    'a --> b',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stderr,
    '<stdin>:5:1: warning: This relationship repeats the one on line 4. '
      + 'Remove the copy, or use the long form with distinct IDs if both are intended.\n',
  );
  assert.match(result.stdout, /^<stdin>: diagram syntax and structure checks passed$/m);
});

test('the CLI prints every independent error and fails', () => {
  const result = validateStdin([
    'archimate-beta',
    'element busnessRole a "A"',
    'element businessRole b "B"',
    'a --> missing',
  ]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.deepEqual(result.stderr.trimEnd().split('\n'), [
    '<stdin>:2:9: Unknown element type "busnessRole". Did you mean "businessRole"?',
    '<stdin>:4:7: Unknown element or note "missing".',
  ]);
});
