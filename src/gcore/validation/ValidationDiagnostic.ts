export type Severity = 'error' | 'warn' | 'info';

export interface Diagnostic {
  readonly severity: Severity;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
  readonly ref?: string;
}

export class DiagnosticPath {
  private readonly parts: readonly (string | number)[];

  private constructor(parts: readonly (string | number)[]) {
    this.parts = parts;
  }

  public static root(): DiagnosticPath {
    return new DiagnosticPath([]);
  }

  public property(name: string): DiagnosticPath {
    return new DiagnosticPath([...this.parts, name]);
  }

  public index(index: number): DiagnosticPath {
    return new DiagnosticPath([...this.parts, index]);
  }

  public toString(): string {
    return `/${this.parts.map(String).join('/')}`;
  }
}

export type DiagnosticReport = Pick<Diagnostic, 'code' | 'message' | 'ref'> & {
  path?: DiagnosticPath;
};

export class Diagnostics {
  public static error(report: DiagnosticReport): Diagnostic {
    return { severity: 'error', ...report, path: report.path?.toString() };
  }

  public static warn(report: DiagnosticReport): Diagnostic {
    return { severity: 'warn', ...report, path: report.path?.toString() };
  }

  public static info(report: DiagnosticReport): Diagnostic {
    return { severity: 'info', ...report, path: report.path?.toString() };
  }
}
