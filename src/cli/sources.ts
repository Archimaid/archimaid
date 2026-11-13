import { readFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { blankFrontmatter } from '../archimate/frontmatter.js';

export const stdinName = '<stdin>';

export interface DiagramSource {
  readonly source: string;
  // Lines before the diagram in its file, so diagnostics report file lines.
  readonly lineOffset: number;
}

export interface SourceFile {
  readonly file: string;
  readonly diagrams: readonly DiagramSource[];
}

export interface UnreadableInput {
  readonly file: string;
  readonly message: string;
}

const markdownExtensions = new Set(['.md', '.markdown']);
const diagramExtensions = new Set(['.mmd', '.mermaid']);

export function isArchiMateSource(source: string): boolean {
  const withoutByteOrderMark = source.startsWith('﻿') ? source.slice(1) : source;
  return /^\s*archimate-beta(?=\s|$)/u.test(blankFrontmatter(withoutByteOrderMark.replaceAll('\r\n', '\n')).text);
}

const fenceOpening = /^( {0,3})(`{3,}|~{3,})[ \t]*mermaid(?:[ \t].*)?$/u;

// CommonMark fences: a block closes at a fence of the same character that is at least as long, or at the end of the file.
export function markdownDiagrams(markdown: string): DiagramSource[] {
  const lines = markdown.split(/\r?\n/u);
  const diagrams: DiagramSource[] = [];
  for (let index = 0; index < lines.length; index++) {
    const fence = fenceOpening.exec(lines[index] ?? '')?.[2];
    if (fence === undefined) continue;
    const closing = new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`, 'u');
    const start = index + 1;
    let end = start;
    while (end < lines.length && !closing.test(lines[end] ?? '')) end++;
    const source = lines.slice(start, end).join('\n');
    if (isArchiMateSource(source)) diagrams.push({ source, lineOffset: start });
    index = end;
  }
  return diagrams;
}

function isMarkdown(file: string): boolean {
  return markdownExtensions.has(extname(file).toLowerCase());
}

// An explicitly named diagram file is always validated; a file found in a directory only when it is an ArchiMate diagram.
function diagramsIn(file: string, text: string, explicit: boolean): DiagramSource[] {
  if (isMarkdown(file)) return markdownDiagrams(text);
  return explicit || isArchiMateSource(text) ? [{ source: text, lineOffset: 0 }] : [];
}

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(({ name }) => !name.startsWith('.') && name !== 'node_modules')
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return filesUnder(path);
        const extension = extname(entry.name).toLowerCase();
        return entry.isFile() && (diagramExtensions.has(extension) || markdownExtensions.has(extension)) ? [path] : [];
      }),
  );
  return nested.flat();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 'No such file or directory.';
  return error instanceof Error ? error.message : String(error);
}

export async function collectSources(inputs: readonly string[]): Promise<{
  readonly files: SourceFile[];
  readonly unreadable: UnreadableInput[];
}> {
  const files: SourceFile[] = [];
  const unreadable: UnreadableInput[] = [];
  for (const input of inputs) {
    try {
      if (input === '-') {
        files.push({ file: stdinName, diagrams: diagramsIn(stdinName, readFileSync(0, 'utf8'), true) });
      } else if ((await stat(input)).isDirectory()) {
        for (const file of await filesUnder(input)) {
          const diagrams = diagramsIn(file, await readFile(file, 'utf8'), false);
          if (diagrams.length > 0) files.push({ file, diagrams });
        }
      } else {
        files.push({ file: input, diagrams: diagramsIn(input, await readFile(input, 'utf8'), true) });
      }
    } catch (error) {
      unreadable.push({ file: input, message: errorMessage(error) });
    }
  }
  return { files, unreadable };
}
