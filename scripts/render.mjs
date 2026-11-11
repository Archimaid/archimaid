import { readFile, writeFile } from 'node:fs/promises';
import { renderStandaloneSvg, withMermaidPage } from './mermaid-browser.mjs';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length > 0) {
  console.error('Usage: npm run render -- <file.mmd> <output.svg>');
  process.exitCode = 2;
} else {
  try {
    const source = await readFile(input, 'utf8');
    const svg = await withMermaidPage(
      (page) => renderStandaloneSvg(page, 'archimate-example', source),
      { useMaxWidth: false },
    );
    await writeFile(output, `${svg}\n`, 'utf8');
    console.log(output);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
