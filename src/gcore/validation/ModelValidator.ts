import { SemanticValidator, ValidationOptions } from './SemanticValidator';
import { Diagnostic, DiagnosticPath, DiagnosticReport, Diagnostics } from './ValidationDiagnostic';
import { SchemaValidator } from './SchemaValidator';
import { VALIDATION_ERROR } from './ValidationErrorCode';
import { GModel, Id } from '../model/ModelTypes';
import { createProjectGraph, ProjectGraphResult } from '../graph/createProjectGraph';

export type SchemaKind = 'BASE' | 'DERIVED';

export interface ValidationResult {
  readonly diagnostics: Diagnostic[];
  readonly hasErrors: boolean;
}

export class ModelValidator {
  private readonly strict: SemanticValidator = new SemanticValidator();

  public validate(base: unknown, derived: unknown, models: ReadonlyMap<Id, GModel>): ValidationResult {
    const diagnostics: Diagnostic[] = [];

    this.validateSchema('BASE', base, diagnostics);
    this.validateSchema('DERIVED', derived, diagnostics);

    let hasErrors: boolean = diagnostics.some((d: Diagnostic): boolean => d.severity === 'error');
    if (diagnostics.length > 0) return { diagnostics, hasErrors };

    const graphResult: ProjectGraphResult = createProjectGraph({ rootModelId: derived.id, models: [...models.values()] });
    if (!graphResult.ok) {
      const graphDiagnostics: Diagnostic[] = [...graphResult.diagnostics];
      return { diagnostics: graphDiagnostics, hasErrors: true };
    }

    const options: ValidationOptions = { baseId: base.id };
    const strict: Diagnostic[] = this.strict.validate(base, derived, models, options);
    const all: Diagnostic[] = [...diagnostics, ...strict];

    hasErrors = all.some((d: Diagnostic): boolean => d.severity === 'error');
    return { diagnostics: all, hasErrors };
  }

  private validateSchema(kind: SchemaKind, input: unknown, diags: Diagnostic[]): asserts input is GModel {
    try {
      SchemaValidator.assertValid(input);
    } catch (error: unknown) {
      const message: string = error instanceof Error ? error.message : String(error);

      const report: DiagnosticReport = {
        code: VALIDATION_ERROR.SCHEMA_INVALID,
        message: `${kind} - ${message}`,
        path: DiagnosticPath.root(),
      };
      diags.push(Diagnostics.error(report));
    }
  }
}
