// Renders every .mmd file in src/diagrams to an SVG beside it with the Archimaid CLI from this repository.
// The SVGs are committed so that the site build needs no browser; run this after changing a diagram.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/archimaid/dist/cli.js', import.meta.url));
const diagramsDirectory = fileURLToPath(new URL('../src/diagrams/', import.meta.url));

const sources = readdirSync(diagramsDirectory).filter((name) => name.endsWith('.mmd'));
if (sources.length === 0) throw new Error(`No .mmd files in ${diagramsDirectory}`);

for (const source of sources) {
  const input = `${diagramsDirectory}${source}`;
  const output = input.replace(/\.mmd$/, '.svg');
  execFileSync(process.execPath, [cli, 'validate', input], { stdio: 'inherit' });
  execFileSync(process.execPath, [cli, 'render', '--background', 'transparent', input, output], { stdio: 'inherit' });
}
