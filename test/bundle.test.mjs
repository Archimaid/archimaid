import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { resolveElkConstructor } from '../dist/mermaid/archimateRenderer.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('the browser host loads ELK in its own chunk, apart from the renderer', async () => {
  const { metafile } = await build({
    stdin: {
      resolveDir: root,
      sourcefile: 'archimate-browser-host.js',
      contents: `
        import mermaid from 'mermaid';
        import { archimate } from 'archimate-for-mermaid';
        mermaid.initialize({ startOnLoad: false });
        await mermaid.registerExternalDiagrams([archimate]);
      `,
    },
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    outdir: 'out',
    write: false,
    metafile: true,
  });
  const chunks = Object.entries(metafile.outputs).map(([path, { inputs, entryPoint }]) => ({
    path, entryPoint, inputs: Object.keys(inputs),
  }));
  const holding = (pattern) => chunks.filter(({ inputs }) => inputs.some((input) => pattern.test(input)));
  const elk = holding(/elkjs\/lib\/elk\.bundled\.js$/);
  const renderer = holding(/dist\/mermaid\/archimateRenderer\.js$/);
  assert.equal(elk.length, 1);
  assert.equal(renderer.length, 1);
  assert.notEqual(elk[0].path, renderer[0].path);
  assert.equal(elk[0].entryPoint, undefined);
  assert.ok(elk[0].inputs.every((input) => /elkjs/.test(input)), elk[0].inputs.join(', '));
});

test('resolves the ELK constructor from either module shape', () => {
  class Layout {}
  assert.equal(resolveElkConstructor(Layout), Layout);
  assert.equal(resolveElkConstructor({ default: Layout }), Layout);
  assert.equal(resolveElkConstructor({ default: { default: Layout } }), Layout);
  assert.throws(() => resolveElkConstructor({ default: {} }), /did not provide its layout constructor/);
  assert.throws(() => resolveElkConstructor(undefined), /did not provide its layout constructor/);
});
