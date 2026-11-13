import type { ArchiMateDiagnostic } from '../language.js';

export const outputFormats = ['text', 'json', 'github'] as const;
export type OutputFormat = (typeof outputFormats)[number];

export type FileDiagnostic = ArchiMateDiagnostic & { readonly file: string };

export interface CheckedFile {
  readonly file: string;
  readonly diagrams: number;
  readonly errors: number;
}

export interface ValidationReport {
  readonly files: readonly CheckedFile[];
  readonly diagnostics: readonly FileDiagnostic[];
}

export interface ReportOutput {
  readonly stdout: string[];
  readonly stderr: string[];
}

function textReport({ files, diagnostics }: ValidationReport): ReportOutput {
  return {
    stderr: diagnostics.map(({ file, line, column, severity, message }) =>
      `${file}:${line}:${column}: ${severity === 'warning' ? 'warning: ' : ''}${message}`),
    stdout: files
      .filter(({ errors }) => errors === 0)
      .map(({ file }) => `${file}: diagram syntax and structure checks passed`),
  };
}

// https://docs.github.com/actions/reference/workflow-commands-for-github-actions#setting-an-error-message
const escapeData = (text: string): string =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = (text: string): string =>
  escapeData(text).replaceAll(':', '%3A').replaceAll(',', '%2C');

function githubReport({ diagnostics }: ValidationReport): ReportOutput {
  return {
    stderr: [],
    stdout: diagnostics.map(({ file, line, column, endLine, endColumn, severity, code, message }) => {
      const properties = [
        `file=${escapeProperty(file)}`, `line=${line}`, `col=${column}`,
        `endLine=${endLine}`, `endColumn=${endColumn}`, `title=${escapeProperty(code)}`,
      ];
      return `::${severity} ${properties.join(',')}::${escapeData(message)}`;
    }),
  };
}

export function formatReport(report: ValidationReport, format: OutputFormat): ReportOutput {
  switch (format) {
    case 'text': return textReport(report);
    case 'github': return githubReport(report);
    case 'json': return { stdout: [JSON.stringify(report, null, 2)], stderr: [] };
  }
}
