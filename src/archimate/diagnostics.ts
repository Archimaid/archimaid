import type { IToken } from 'chevrotain';
import type { ArchiMateModel } from './model.js';

export type ArchiMateErrorCode =
  | 'LEXICAL_ERROR'
  | 'SYNTAX_ERROR'
  | 'INVALID_TEXT'
  | 'INVALID_DIRECTION'
  | 'INVALID_LAYOUT'
  | 'DUPLICATE_DECLARATION'
  | 'DUPLICATE_ID'
  | 'UNKNOWN_ELEMENT_TYPE'
  | 'UNKNOWN_RELATIONSHIP_TYPE'
  | 'UNKNOWN_ELEMENT'
  | 'UNSUPPORTED_ENDPOINT'
  | 'INVALID_RELATIONSHIP_PROPERTY'
  | 'INVALID_NOTE_TARGET'
  | 'INVALID_NESTING';

export type ArchiMateWarningCode = 'DUPLICATE_RELATIONSHIP';

export class ArchiMateError extends Error {
  constructor(
    readonly code: ArchiMateErrorCode,
    readonly line: number,
    readonly column: number,
    readonly detail: string,
  ) {
    super('Line ' + line + ', column ' + column + ': ' + detail);
    this.name = 'ArchiMateError';
  }
}

/** Lines and columns are 1-based. The end position is exclusive, as in editor ranges. */
export interface ArchiMateSourceRange {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface ArchiMateErrorDiagnostic extends ArchiMateSourceRange {
  readonly severity: 'error';
  readonly code: ArchiMateErrorCode;
  readonly message: string;
}

export interface ArchiMateWarningDiagnostic extends ArchiMateSourceRange {
  readonly severity: 'warning';
  readonly code: ArchiMateWarningCode;
  readonly message: string;
}

export type ArchiMateDiagnostic = ArchiMateErrorDiagnostic | ArchiMateWarningDiagnostic;

export interface ArchiMateValidationResult {
  readonly model?: ArchiMateModel;
  readonly diagnostics: readonly ArchiMateDiagnostic[];
}

export class DiagnosticCollector {
  readonly diagnostics: ArchiMateDiagnostic[] = [];

  constructor(private readonly text: string, private readonly lineOffset: number) {}

  get hasErrors(): boolean {
    return this.diagnostics.some(({ severity }) => severity === 'error');
  }

  error(code: ArchiMateErrorCode, token: IToken, message: string): void {
    this.errorAt(code, this.range(token, token), message);
  }

  errorAt(code: ArchiMateErrorCode, range: ArchiMateSourceRange, message: string): void {
    this.diagnostics.push({ severity: 'error', code, message, ...range });
  }

  warning(code: ArchiMateWarningCode, start: IToken, end: IToken, message: string): void {
    this.diagnostics.push({ severity: 'warning', code, message, ...this.range(start, end) });
  }

  line(token: IToken): number {
    return this.range(token, token).line;
  }

  // Lexer line numbers are relative to the text this parser sees; the host adds the lines it removed.
  sourceRange(line: number, column: number, endLine: number, endColumn: number): ArchiMateSourceRange {
    return {
      line: line + this.lineOffset,
      column,
      endLine: endLine + this.lineOffset,
      endColumn,
    };
  }

  private range(start: IToken, end: IToken): ArchiMateSourceRange {
    const { startLine, startColumn } = start;
    if (startLine === undefined || !(startLine > 0) || startColumn === undefined || !(startColumn > 0)) {
      return this.endOfSource();
    }
    const { endLine, endColumn } = end;
    return endLine !== undefined && endLine > 0 && endColumn !== undefined && endColumn > 0
      ? this.sourceRange(startLine, startColumn, endLine, endColumn + 1)
      : this.sourceRange(startLine, startColumn, startLine, startColumn);
  }

  // Tokens such as EOF carry no position, so errors at the end of input point after the last character.
  private endOfSource(): ArchiMateSourceRange {
    const lines = this.text.split(/\r\n|\n|\r/);
    const column = (lines.at(-1)?.length ?? 0) + 1;
    return this.sourceRange(lines.length, column, lines.length, column);
  }
}

export type Report = (code: ArchiMateErrorCode, token: IToken, message: string) => void;
