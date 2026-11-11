#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { ArchiMateError, parseArchiMate } from './language.js';

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
    parseArchiMate(source);
    console.log(`${input}: diagram syntax and structure checks passed`);
  } catch (error) {
    const location =
      error instanceof ArchiMateError ? `:${error.line}:${error.column}` : '';
    const message = error instanceof ArchiMateError
      ? error.detail
      : error instanceof Error ? error.message : String(error);
    console.error(`${input}${location}: ${message}`);
    process.exitCode = 1;
  }
}
