import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));

async function bundleHost(pluginOptions) {
  const pluginExport = pluginOptions === undefined ? 'archimate' : 'createArchiMatePlugin';
  // JSON has no Infinity, which is a meaningful option value (maxRowWidth: Infinity turns wrapping off).
  const options = Object.entries(pluginOptions ?? {}).map(([name, value]) =>
    `${JSON.stringify(name)}: ${typeof value === 'number' ? String(value) : JSON.stringify(value)}`);
  const plugin = pluginOptions === undefined ? 'plugin' : `plugin({ ${options.join(', ')} })`;
  const { outputFiles } = await build({
    stdin: {
      resolveDir: root,
      sourcefile: 'archimate-browser-host.js',
      contents: `
        import mermaid from 'mermaid';
        import { ${pluginExport} as plugin } from 'archimate-mermaid';

        globalThis.archimateHost = (async () => {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
          await mermaid.registerExternalDiagrams([${plugin}]);
          return mermaid;
        })();
      `,
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    write: false,
  });
  return outputFiles[0].text;
}

export async function withMermaidPage(action, pluginOptions) {
  const hostScript = await bundleHost(pluginOptions);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><meta charset="utf-8"><title>ArchiMate render</title>');
    await page.addScriptTag({ content: hostScript });
    await page.evaluate(async () => {
      await globalThis.archimateHost;
    });
    return await action(page);
  } finally {
    await browser.close();
  }
}

export function renderStandaloneSvg(page, id, source) {
  return page.evaluate(async ({ id, source }) => {
    const mermaid = await globalThis.archimateHost;
    const { svg } = await mermaid.render(id, source);
    // Mermaid serializes for HTML. Export XML so labels containing characters
    // such as nonbreaking spaces also work in standalone SVG viewers.
    const document = new DOMParser().parseFromString(svg, 'text/html');
    const root = document.querySelector('svg');
    if (!root) throw new Error('Mermaid did not return an SVG diagram.');
    return new XMLSerializer().serializeToString(root);
  }, { id, source });
}
