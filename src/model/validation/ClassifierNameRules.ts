import type { SchemaNode } from 'json-schema-library';
import { SchemaFindings } from './SchemaFindings.js';
import { ModelNames } from '../Names.js';
import { DiagnosticPath, Diagnostics, type Diagnostic } from './Diagnostics.js';
import { VALIDATION_ERROR } from './Codes.js';

/** @internal Reports name errors before schema unions lose the offending field's path. */
export class ClassifierNameRules {
  public static validateDocument(schema: SchemaNode, input: unknown, code: string, path: DiagnosticPath): readonly Diagnostic[] {
    const names: readonly Diagnostic[] = this.validate(input, path);
    const structural: readonly Diagnostic[] = SchemaFindings.validate(schema, input, code, path);
    if (names.length === 0) return structural;
    if (structural.length === 0) return names;
    if (!this.needsNameRepair(names, structural)) return [...names, ...structural];
    const repaired: readonly Diagnostic[] = SchemaFindings.validate(schema, this.withValidNames(input), code, path);
    const prefix: string = `${path.property('classifiers').toString()}/`;
    const broken: ReadonlySet<string> = new Set(
      repaired.flatMap((finding: Diagnostic): string[] => {
        const pointer: string | undefined = finding.path;
        if (!pointer?.startsWith(prefix)) return [];
        const index: string = pointer.slice(prefix.length).split('/')[0] ?? '';
        return [`${prefix}${index}`];
      }),
    );
    const replaced: ReadonlySet<string> = new Set(
      names.flatMap((finding: Diagnostic): string[] => {
        const field: string = finding.path ?? '';
        const classifier: string = field.slice(0, -'/name'.length);
        return broken.has(classifier) ? [field] : [field, classifier];
      }),
    );
    return [...names, ...structural.filter((finding: Diagnostic): boolean => !replaced.has(finding.path ?? ''))];
  }

  private static needsNameRepair(names: readonly Diagnostic[], structural: readonly Diagnostic[]): boolean {
    const affected: ReadonlySet<string> = new Set(
      names.flatMap((finding: Diagnostic): string[] => {
        const field: string = finding.path ?? '';
        return [field, field.slice(0, -'/name'.length)];
      }),
    );
    return structural.some((finding: Diagnostic): boolean => affected.has(finding.path ?? ''));
  }

  private static withValidNames(input: unknown): unknown {
    if (input === null || typeof input !== 'object' || !('classifiers' in input)) return input;
    if (!Array.isArray(input.classifiers)) return input;
    const classifiers: unknown[] = input.classifiers.map((value: unknown): unknown => {
      if (value === null || typeof value !== 'object' || !('kind' in value)) return value;
      if (value.kind !== 'Node' && value.kind !== 'DataType') return value;
      if ('name' in value && typeof value.name === 'string' && ModelNames.isClassifierName(value.name)) return value;
      return { ...value, name: 'Classifier' };
    });
    return { ...input, classifiers };
  }

  public static validate(input: unknown, path: DiagnosticPath): readonly Diagnostic[] {
    if (input === null || typeof input !== 'object' || !('classifiers' in input)) return [];
    if (!Array.isArray(input.classifiers)) return [];

    return input.classifiers.flatMap((value: unknown, index: number): readonly Diagnostic[] => {
      if (value === null || typeof value !== 'object' || !('kind' in value)) return [];
      if (value.kind !== 'Node' && value.kind !== 'DataType') return [];
      const name: unknown = 'name' in value ? value.name : undefined;
      if (typeof name === 'string' && ModelNames.isClassifierName(name)) return [];

      const reference: unknown = 'id' in value ? value.id : undefined;
      return [
        Diagnostics.error({
          code: VALIDATION_ERROR.CLASSIFIER_NAME_INVALID,
          message: `Classifier names must contain 1–${ModelNames.CLASSIFIER_MAX_LENGTH} Unicode code points, start with a letter and contain only letters, combining marks, numbers or underscores, with at most two consecutive combining marks after NFC normalisation.`,
          path: path.property('classifiers').index(index).property('name'),
          ref: typeof reference === 'string' ? reference : undefined,
        }),
      ];
    });
  }
}
