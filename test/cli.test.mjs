import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
