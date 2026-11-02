import type { JsonError, SchemaNode } from 'json-schema-library';
import { DiagnosticPath, Diagnostics, type Diagnostic } from './Diagnostics.js';

/** Converts structural schema failures into individual findings at their input paths. */
export class SchemaFindings {
  public static validate(schema: SchemaNode, input: unknown, code: string, base: DiagnosticPath): readonly Diagnostic[] {
    return schema.validate(input ?? null).errors.map((error: JsonError): Diagnostic => {
      const path: DiagnosticPath = this.path(input, error, base);
      return Diagnostics.error({ code, message: error.message, path });
    });
  }

  public static path(input: unknown, error: JsonError, base: DiagnosticPath): DiagnosticPath {
    const pointer: unknown = error.data?.pointer;
    if (typeof pointer !== 'string') return base;
    const relative: string = pointer.replace(/^#/, '');
    if (!relative.startsWith('/')) return base;

    const parts: readonly string[] = relative.slice(1).split('/');
    let value: unknown = input;
    let path: DiagnosticPath = base;

    for (const part of parts) {
      if (value === null || typeof value !== 'object') return path;
      const key: string = part.replaceAll('~1', '/').replaceAll('~0', '~');
      if (!Object.hasOwn(value, key)) return path;

      path = path.property(key);
      value = (value as Record<string, unknown>)[key];
    }
    return path;
  }
}
