import { ArchiMateError, DiagnosticCollector } from './diagnostics.js';
import type { ArchiMateErrorDiagnostic, ArchiMateValidationResult } from './diagnostics.js';
import { blankFrontmatter } from './frontmatter.js';
import { describeSyntaxError, parseDeclarations } from './grammar.js';
import { describeLexicalError, lexer } from './lexer.js';
import type { ArchiMateModel } from './model.js';
import { locateSources } from './sources.js';
import { validateDeclarations } from './validate.js';

export { ArchiMateError } from './diagnostics.js';
export type {
  ArchiMateDiagnostic,
  ArchiMateErrorCode,
  ArchiMateErrorDiagnostic,
  ArchiMateSourceRange,
  ArchiMateValidationResult,
  ArchiMateWarningCode,
  ArchiMateWarningDiagnostic,
} from './diagnostics.js';
export { relationshipConnectors } from './lexer.js';
export type {
  ArchiMateAnchorSource,
  ArchiMateDescriptionSource,
  ArchiMateElementSource,
  ArchiMateLinkSource,
  ArchiMateLongFormRelationshipSource,
  ArchiMateNoteSource,
  ArchiMatePositionSource,
  ArchiMateRelationshipSource,
  ArchiMateShorthandRelationshipSource,
  ArchiMateSourceMap,
  ArchiMateSourceSpan,
} from './sources.js';

export interface ArchiMateParseOptions {
  readonly lineOffset?: number;
}

function analyzeArchiMate(source: string, options: ArchiMateParseOptions): ArchiMateValidationResult {
  const withoutByteOrderMark = source.startsWith('\uFEFF') ? source.slice(1) : source;
  const frontmatter = blankFrontmatter(withoutByteOrderMark);
  const { text } = frontmatter;
  const diagnostics = new DiagnosticCollector(text, options.lineOffset ?? 0);
  if (frontmatter.kind === 'unclosed') {
    diagnostics.errorAt(
      'SYNTAX_ERROR',
      diagnostics.sourceRange(1, frontmatter.column, 1, frontmatter.column + 3),
      'The frontmatter block is missing its closing "---" line.',
    );
    return { diagnostics: diagnostics.diagnostics };
  }

  const tokenized = lexer.tokenize(text);
  const lexicalError = tokenized.errors[0];
  if (lexicalError) {
    const line = lexicalError.line ?? 1;
    const column = lexicalError.column ?? 1;
    diagnostics.errorAt(
      'LEXICAL_ERROR',
      diagnostics.sourceRange(line, column, line, column + lexicalError.length),
      describeLexicalError(text, lexicalError.offset, lexicalError.length),
    );
    return { diagnostics: diagnostics.diagnostics };
  }

  const grammar = parseDeclarations(tokenized.tokens);
  if ('syntaxError' in grammar) {
    const { syntaxError } = grammar;
    diagnostics.error('SYNTAX_ERROR', syntaxError.token, describeSyntaxError(syntaxError, tokenized.tokens));
    return { diagnostics: diagnostics.diagnostics };
  }
  const validated = validateDeclarations(grammar.declarations, diagnostics);
  if (!validated) return { diagnostics: diagnostics.diagnostics };
  // Everything removed before the first token, so token offsets plus this are offsets into the source.
  const offsetShift = source.length - text.length;
  return {
    model: validated.model,
    sources: locateSources(validated.statements, { lineOffset: options.lineOffset ?? 0, offsetShift }),
    diagnostics: diagnostics.diagnostics,
  };
}

/**
 * Reports every semantic problem in one pass, sorted by position. Lexical and syntax
 * checks stop at the first problem because later tokens cannot be interpreted reliably.
 */
export function validateArchiMate(source: string, options: ArchiMateParseOptions = {}): ArchiMateValidationResult {
  const { diagnostics, ...result } = analyzeArchiMate(source, options);
  const sorted = diagnostics.toSorted((left, right) => left.line - right.line || left.column - right.column);
  return { ...result, diagnostics: sorted };
}

export function parseArchiMate(source: string, options: ArchiMateParseOptions = {}): ArchiMateModel {
  const { model, diagnostics } = analyzeArchiMate(source, options);
  // Discovery order, not position order, keeps the thrown error identical to earlier releases.
  const error = diagnostics.find((entry): entry is ArchiMateErrorDiagnostic => entry.severity === 'error');
  if (error) throw new ArchiMateError(error.code, error.line, error.column, error.message);
  if (!model) throw new Error('ArchiMate validation produced neither a model nor an error.');
  return model;
}
