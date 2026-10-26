/** Supported severity levels for validation diagnostics. */
export type Severity = 'error' | 'warn' | 'info';

/** Machine-readable validation finding with an optional model path and reference. */
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly ref?: string;
  /** Identifier of the affected data record, separate from the model definition reference. */
  readonly instanceId?: string;
}

/** Immutable builder for JSON Pointer-like diagnostic paths. */
export class DiagnosticPath {
  private readonly parts: readonly (string | number)[];

  private constructor(parts: readonly (string | number)[]) {
    this.parts = parts;
  }

  /** Creates an empty path at the validated document root. */
  public static root(): DiagnosticPath {
    return new DiagnosticPath([]);
  }

  /** Returns a new path extended by an object property. */
  public property(name: string): DiagnosticPath {
    return new DiagnosticPath([...this.parts, name]);
  }

  /** Returns a new path extended by an array index. */
  public index(index: number): DiagnosticPath {
    return new DiagnosticPath([...this.parts, index]);
  }

  /** Formats the path as a slash-separated string. */
  public toString(): string {
    return `/${this.parts.map((part: string | number): string => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/')}`;
  }
}

/** Finding data accepted by the diagnostic factory methods. */
export type DiagnosticReport = Pick<Diagnostic, 'code' | 'message' | 'ref' | 'instanceId'> & {
  path?: DiagnosticPath;
};

/** Creates consistently shaped diagnostics for each supported severity. */
export class Diagnostics {
  /** Creates an error diagnostic. */
  public static error(report: DiagnosticReport): Diagnostic {
    return { severity: 'error', ...report, path: report.path?.toString() };
  }

  /** Creates a warning diagnostic. */
  public static warn(report: DiagnosticReport): Diagnostic {
    return { severity: 'warn', ...report, path: report.path?.toString() };
  }

  /** Creates an informational diagnostic. */
  public static info(report: DiagnosticReport): Diagnostic {
    return { severity: 'info', ...report, path: report.path?.toString() };
  }
}
