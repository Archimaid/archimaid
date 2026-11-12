import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);
const consumers = fileURLToPath(new URL('../consumers/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const page = `<!doctype html><meta charset="utf-8"><title>ArchiMate consumer</title>
<body data-status="loading"><div id="diagram"></div><script type="module" src="/main.js"></script></body>`;

function serve(directory) {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname));
    const file = join(directory, path === '/' ? 'index.html' : path);
    if (!file.startsWith(directory)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch (error) {
      if (path !== '/' || error?.code !== 'ENOENT') {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html' }).end(page);
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

for (const bundler of ['vite', 'webpack', 'rollup']) {
  const fixture = join(consumers, bundler);
  const installed = existsSync(join(fixture, 'node_modules'));
  const install = `run "npm install --no-package-lock" in test/consumers/${bundler} first`;
  // Locally a missing install is a skip; in CI it means the install step was lost, which must not pass quietly.
  test(`a ${bundler} build renders a graph-layout diagram`, {
    skip: !installed && !process.env.CI && install,
    timeout: 240_000,
  }, async () => {
    assert.ok(installed, install);
    await run('npm', ['run', 'build', '--silent'], { cwd: fixture, maxBuffer: 16 * 1024 * 1024 });
    const server = await serve(join(fixture, 'dist'));
    const browser = await chromium.launch();
    try {
      const { port } = server.address();
      const tab = await browser.newPage();
      const errors = [];
      tab.on('pageerror', (error) => errors.push(error.message));
      await tab.goto(`http://127.0.0.1:${port}/`);
      await tab.waitForFunction(() => document.body.dataset.status !== 'loading', undefined, { timeout: 60_000 });
      const result = await tab.evaluate(() => ({
        status: document.body.dataset.status,
        error: document.body.dataset.error,
        elements: document.querySelectorAll('#diagram [data-archimate-element]').length,
        relationships: document.querySelectorAll('#diagram [data-archimate-relationship]').length,
      }));
      assert.deepEqual(errors, []);
      assert.deepEqual(result, { status: 'rendered', error: undefined, elements: 3, relationships: 2 });
    } finally {
      await browser.close();
      server.close();
    }
  });
}
