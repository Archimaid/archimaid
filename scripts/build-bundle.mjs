import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const outdir = fileURLToPath(new URL('dist/bundle/', root));

await rm(outdir, { recursive: true, force: true });
await build({
  entryPoints: { 'archimate-mermaid.esm.min': fileURLToPath(new URL('dist/index.js', root)) },
  outdir,
  outExtension: { '.js': '.mjs' },
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  sourcemap: false,
  external: ['mermaid'],
  logLevel: 'warning',
});
