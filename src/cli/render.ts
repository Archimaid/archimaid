import { readFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mermaid, MermaidConfig } from 'mermaid';
import type { Browser, Route } from 'playwright';
import type { ArchiMateBackground, createArchiMatePlugin } from '../index.js';

export class RenderSetupError extends Error {}

export const mermaidThemes = ['default', 'base', 'dark', 'forest', 'neutral'] as const;
export type MermaidTheme = (typeof mermaidThemes)[number];

export interface RenderOptions {
  readonly theme: MermaidTheme | undefined;
  readonly background: ArchiMateBackground;
}

const origin = 'http://archimate.render';
// Marker IDs derive from the diagram ID; keeping the ID of the earlier render script keeps committed example SVGs stable.
const diagramId = 'archimate-example';
const contentTypes: Readonly<Record<string, string>> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function mermaidDirectory(): string {
  try {
    return dirname(fileURLToPath(import.meta.resolve('mermaid')));
  } catch (error) {
    throw new RenderSetupError('archimate render needs Mermaid. Install it with: npm install mermaid', {
      cause: error,
    });
  }
}

async function launchChromium(): Promise<Browser> {
  let chromium: typeof import('playwright').chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (error) {
    throw new RenderSetupError(
      'archimate render needs Playwright. Install it with: npm install --save-dev playwright && npx playwright install chromium',
      { cause: error },
    );
  }
  try {
    return await chromium.launch();
  } catch (error) {
    throw new RenderSetupError(
      'Playwright could not start Chromium. Install it with: npx playwright install chromium',
      { cause: error },
    );
  }
}

function isInside(root: string, file: string): boolean {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

// The page loads Mermaid's and this package's prebuilt ES modules, so rendering needs no bundler.
async function serveModules(route: Route, roots: Readonly<Record<string, string>>): Promise<void> {
  const { pathname } = new URL(route.request().url());
  const [, mount = '', ...rest] = pathname.split('/');
  const root = roots[mount];
  const file = root === undefined ? undefined : resolve(root, ...rest.map(decodeURIComponent));
  if (root === undefined || file === undefined || !isInside(root, file)) {
    await route.fulfill({ status: 404 });
    return;
  }
  try {
    const body = await readFile(file);
    await route.fulfill({ body, contentType: contentTypes[extname(file)] ?? 'application/octet-stream' });
  } catch {
    await route.fulfill({ status: 404 });
  }
}

interface PageInput {
  readonly source: string;
  readonly mermaidUrl: string;
  readonly pluginUrl: string;
  readonly config: MermaidConfig;
  readonly background: ArchiMateBackground;
  readonly diagramId: string;
}

export async function renderSvg(source: string, { theme, background }: RenderOptions): Promise<string> {
  const roots = {
    mermaid: mermaidDirectory(),
    plugin: fileURLToPath(new URL('../bundle/', import.meta.url)),
  };
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    await page.route(`${origin}/**`, (route) => serveModules(route, roots));
    await page.route(`${origin}/`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><title>ArchiMate render</title>',
      }),
    );
    await page.goto(`${origin}/`);
    const input: PageInput = {
      source,
      mermaidUrl: `${origin}/mermaid/mermaid.esm.min.mjs`,
      pluginUrl: `${origin}/plugin/archimate-mermaid.esm.min.mjs`,
      config: { startOnLoad: false, securityLevel: 'strict', ...(theme !== undefined && { theme }) },
      background,
      diagramId,
    };
    return await page.evaluate(async ({ source, mermaidUrl, pluginUrl, config, background, diagramId }: PageInput) => {
      const { default: mermaid } = (await import(mermaidUrl)) as { default: Mermaid };
      const plugin = (await import(pluginUrl)) as { createArchiMatePlugin: typeof createArchiMatePlugin };
      mermaid.initialize(config);
      await mermaid.registerExternalDiagrams([plugin.createArchiMatePlugin({ useMaxWidth: false, background })]);
      const { svg } = await mermaid.render(diagramId, source);
      // Mermaid serializes for HTML. Export XML so that standalone SVG viewers accept every label.
      const root = new DOMParser().parseFromString(svg, 'text/html').querySelector('svg');
      if (!root) throw new Error('Mermaid did not return an SVG diagram.');
      return new XMLSerializer().serializeToString(root);
    }, input);
  } finally {
    await browser.close();
  }
}
