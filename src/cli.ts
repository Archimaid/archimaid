#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  formatReport,
  outputFormats,
  type CheckedFile,
  type FileDiagnostic,
  type OutputFormat,
  type ReportOutput,
} from './cli/report.js';
import { collectSources, stdinName } from './cli/sources.js';
import { validateArchiMate } from './language.js';
import type { ArchiMateBackground } from './index.js';

const usage = `Usage:
  archimaid validate [--format text|json|github] <file|directory|->...
  archimaid render [--theme default|base|dark|forest|neutral] [--background theme|transparent] <input.mmd|-> <output.svg>
  archimaid --version
  archimaid --help

validate checks .mmd files, and archimate-beta blocks in fenced mermaid code blocks of Markdown files.
Directories are searched recursively for .mmd, .mermaid, .md and .markdown files.`;

class UsageError extends Error {}

const backgrounds = ['theme', 'transparent'] as const satisfies readonly ArchiMateBackground[];

function oneOf<const T extends string>(name: string, value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined;
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new UsageError(`--${name} must be one of: ${allowed.join(', ')}.`);
  return match;
}

function write({ stdout, stderr }: ReportOutput): void {
  if (stdout.length > 0) console.log(stdout.join('\n'));
  if (stderr.length > 0) console.error(stderr.join('\n'));
}

async function validate(inputs: readonly string[], format: OutputFormat): Promise<number> {
  if (inputs.length === 0) throw new UsageError('validate needs at least one file, directory or -.');
  const { files, unreadable } = await collectSources(inputs);
  const checked: CheckedFile[] = [];
  const diagnostics: FileDiagnostic[] = [];
  for (const { file, diagrams } of files) {
    let errors = 0;
    for (const { source, lineOffset } of diagrams) {
      for (const diagnostic of validateArchiMate(source, { lineOffset }).diagnostics) {
        diagnostics.push({ ...diagnostic, file });
        if (diagnostic.severity === 'error') errors++;
      }
    }
    checked.push({ file, diagrams: diagrams.length, errors });
  }
  const withDiagrams = checked.filter(({ diagrams }) => diagrams > 0);
  write(formatReport({ files: withDiagrams, diagnostics }, format));
  for (const { file, message } of unreadable) console.error(`${file}: ${message}`);
  if (withDiagrams.length === 0 && unreadable.length === 0) {
    console.error('No archimate-beta diagrams found.');
    return 1;
  }
  return unreadable.length > 0 || checked.some(({ errors }) => errors > 0) ? 1 : 0;
}

async function render(
  inputs: readonly string[],
  theme: string | undefined,
  background: ArchiMateBackground,
): Promise<number> {
  const [input, output, ...extra] = inputs;
  if (input === undefined || output === undefined || extra.length > 0) {
    throw new UsageError('render needs one input file (or -) and one output file.');
  }
  // Loaded on demand so that validate never touches the optional Playwright peer dependency.
  const { mermaidThemes, renderSvg, RenderSetupError } = await import('./cli/render.js');
  const name = input === '-' ? stdinName : input;
  const source = input === '-' ? readFileSync(0, 'utf8') : await readFile(input, 'utf8');
  const { diagnostics } = validateArchiMate(source);
  write(
    formatReport({ files: [], diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic, file: name })) }, 'text'),
  );
  if (diagnostics.some(({ severity }) => severity === 'error')) return 1;
  try {
    const svg = await renderSvg(source, { theme: oneOf('theme', theme, mermaidThemes), background });
    await writeFile(output, `${svg}\n`, 'utf8');
  } catch (error) {
    if (error instanceof RenderSetupError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
  console.log(output);
  return 0;
}

async function main(args: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      format: { type: 'string' },
      theme: { type: 'string' },
      background: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(usage);
    return 0;
  }
  if (values.version) {
    const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };
    console.log(version);
    return 0;
  }
  const [command, ...inputs] = positionals;
  if (command === 'validate') {
    if (values.theme !== undefined || values.background !== undefined) {
      throw new UsageError('--theme and --background apply to render only.');
    }
    return validate(inputs, oneOf('format', values.format, outputFormats) ?? 'text');
  }
  if (command === 'render') {
    if (values.format !== undefined) throw new UsageError('--format applies to validate only.');
    return render(inputs, values.theme, oneOf('background', values.background, backgrounds) ?? 'theme');
  }
  throw new UsageError(command === undefined ? 'Missing command.' : `Unknown command "${command}".`);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (
    error instanceof UsageError ||
    (error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS'))
  ) {
    console.error(usage);
    process.exitCode = 2;
  } else {
    process.exitCode = 1;
  }
}
