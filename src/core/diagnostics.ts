/**
 * Parse diagnostics. Parsers are forgiving by default: a problem they can
 * recover from is recorded as a diagnostic and parsing continues. In strict
 * mode (`{ strict: true }`, used by `orbit validate`) the first such
 * problem throws an `OrbitParseError` instead.
 */

import type { OrbitDocument } from './types.js';

/** Every kind of problem the parsers report. */
export const DIAGNOSTIC_CODES = [
  'empty-document',
  'no-structure',
  'synthetic-root',
  'invalid-frontmatter',
  'unknown-frontmatter-key',
  'unsupported-schema-version',
  'format-upgraded',
  'invalid-attributes',
  'unknown-attribute',
  'invalid-option-value',
  'media-missing-source',
  'unknown-content-type',
  'caption-without-media',
  'unknown-link-target',
  'invalid-yaml',
  'unknown-yaml-key',
  'ignored-node-entry',
  'misnamed-node-key',
  'comment-without-orbit',
  'attributes-after-list',
] as const;

export type OrbitDiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type OrbitDiagnosticSeverity = 'error' | 'warning';

export interface OrbitDiagnostic {
  code: OrbitDiagnosticCode;
  message: string;

  /** 1-based line in the source passed to the parser, when known. */
  line?: number;

  severity: OrbitDiagnosticSeverity;
}

export class OrbitParseError extends Error {
  readonly code: OrbitDiagnosticCode;
  readonly line: number;

  constructor(message: string, line: number, code: OrbitDiagnosticCode = 'invalid-yaml') {
    super(`${message} at line ${line}`);
    this.name = 'OrbitParseError';
    this.line = line;
    this.code = code;
  }
}

export const formatDiagnostic = (diagnostic: OrbitDiagnostic): string => {
  return diagnostic.line === undefined ? diagnostic.message : `Line ${diagnostic.line}: ${diagnostic.message}`;
};

/**
 * Reports a parsed document's problems to the console, the same signal from
 * every entry point: each error as an error, then the other problems as one
 * warning. A document without diagnostics reports its warnings alone.
 */
export const reportParseDiagnostics = (doc: OrbitDocument): void => {
  if (typeof console === 'undefined') {
    return;
  }

  const diagnostics = doc.diagnostics;
  const warnings = diagnostics ? diagnostics.filter((diagnostic) => diagnostic.severity !== 'error').map(formatDiagnostic) : doc.warnings;

  for (const diagnostic of diagnostics ?? []) {
    if (diagnostic.severity === 'error') {
      console.error(`[orbit] ${formatDiagnostic(diagnostic)}`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`[orbit] parse warnings:\n- ${warnings.join('\n- ')}`);
  }
};

export class DiagnosticCollector {
  readonly diagnostics: OrbitDiagnostic[] = [];
  private readonly strict: boolean;

  constructor(strict: boolean) {
    this.strict = strict;
  }

  /** A problem the parser works around: thrown in strict mode, recorded otherwise. */
  recover(code: OrbitDiagnosticCode, message: string, line?: number, severity: OrbitDiagnosticSeverity = 'warning'): void {
    if (this.strict) {
      throw new OrbitParseError(message, line ?? 1, code);
    }

    this.diagnostics.push({ code, message, line, severity });
  }

  /** Worth knowing but never fatal, even in strict mode. */
  note(code: OrbitDiagnosticCode, message: string, line?: number): void {
    this.diagnostics.push({ code, message, line, severity: 'warning' });
  }

  get warnings(): string[] {
    return this.diagnostics.map(formatDiagnostic);
  }
}
