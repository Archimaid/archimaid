import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const example = fileURLToPath(new URL('../../examples/order-management.mmd', import.meta.url));

test('archimate render draws a diagram from the prebuilt browser bundle, without a bundler', () => {
  const directory = mkdtempSync(join(tmpdir(), 'archimate-render-'));
  try {
    const output = join(directory, 'diagram.svg');
    const result = spawnSync(process.execPath, [cli, 'render', '--theme', 'dark', example, output], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const svg = readFileSync(output, 'utf8');
    assert.match(svg, /^<svg[^>]+aria-roledescription="archimate"/);
    assert.match(svg, /aria-label="Order management system — Assignment → Manage orders"/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
