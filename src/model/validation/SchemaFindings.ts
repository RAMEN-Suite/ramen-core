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
    let remaining: string = pointer.replace(/^#/, '');
    let value: unknown = input;
    let path: DiagnosticPath = base;

    // Library pointers contain unescaped keys; only follow an unambiguous existing property.
    while (remaining.startsWith('/') && value !== null && typeof value === 'object') {
      const keys: readonly string[] = Object.keys(value).filter(
        (key: string): boolean => remaining === `/${key}` || remaining.startsWith(`/${key}/`),
      );
      const key: string | undefined = keys[0];
      if (keys.length !== 1 || key === undefined) return path;

      path = path.property(key);
      remaining = remaining.slice(key.length + 1);
      value = (value as Record<string, unknown>)[key];
    }
    return path;
  }
}
