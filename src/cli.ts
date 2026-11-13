#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { validateArchiMate } from './language.js';

const usage = 'Usage: archimate validate <file.mmd|->';
const [command, file, ...extra] = process.argv.slice(2);

if (command === '--help' && file === undefined) {
  console.log(usage);
} else if (command !== 'validate' || file === undefined || extra.length > 0) {
  console.error(usage);
  process.exitCode = 2;
} else {
  const input = file === '-' ? '<stdin>' : file;
  try {
    const source = file === '-' ? readFileSync(0, 'utf8') : await readFile(file, 'utf8');
    const { diagnostics } = validateArchiMate(source);
    for (const { severity, line, column, message } of diagnostics) {
      console.error(`${input}:${line}:${column}: ${severity === 'warning' ? 'warning: ' : ''}${message}`);
    }
    if (diagnostics.some(({ severity }) => severity === 'error')) {
      process.exitCode = 1;
    } else {
      console.log(`${input}: diagram syntax and structure checks passed`);
    }
  } catch (error) {
    console.error(`${input}: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
