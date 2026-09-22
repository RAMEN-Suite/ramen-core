import { Diagnostic, DiagnosticPath, DiagnosticReport, Diagnostics } from './Diagnostics';
import { SchemaValidator } from './Schema';
import { VALIDATION_ERROR } from './Codes';
import { GModel, Id } from '../model/Types';
import { buildProjectGraph, ProjectGraphResult } from '../project/Build';
import { ProjectSemanticValidator } from './Project';

/** Role of a model while validating a refinement pair. */
export type SchemaKind = 'BASE' | 'DERIVED';

/** Diagnostics and summarized error state produced by model validation. */
export interface ValidationResult {
  readonly diagnostics: Diagnostic[];
  readonly hasErrors: boolean;
}

/**
 * Validates schema conformance, project graph resolution, and semantic model rules.
 * Graph construction failures stop later semantic phases to avoid misleading errors.
 */
export class ModelValidator {
  private readonly semantics: ProjectSemanticValidator = new ProjectSemanticValidator();

  /**
   * Validates a derived model against its base and the complete project context.
   *
   * @param base - Expected base model as an untrusted value.
   * @param derived - Model that refines the base as an untrusted value.
   * @param models - All models available for import and reference resolution.
   */
  public validate(base: unknown, derived: unknown, models: ReadonlyMap<Id, GModel>): ValidationResult {
    const diagnostics: Diagnostic[] = [];

    this.validateSchema('BASE', base, diagnostics);
    this.validateSchema('DERIVED', derived, diagnostics);

    let hasErrors: boolean = diagnostics.some((d: Diagnostic): boolean => d.severity === 'error');
    if (diagnostics.length > 0) return { diagnostics, hasErrors };

    const graphResult: ProjectGraphResult = buildProjectGraph({ rootModelId: derived.id, models: [...models.values()] });
    if (!graphResult.ok) {
      const graphDiagnostics: Diagnostic[] = [...graphResult.diagnostics];
      return { diagnostics: graphDiagnostics, hasErrors: true };
    }

    if (!derived.imports.some((modelImport): boolean => modelImport.modelId === base.id)) {
      diagnostics.push(
        Diagnostics.error({
          code: VALIDATION_ERROR.MISSING_BASE_IMPORT,
          message: `Model '${derived.id}' must import base model '${base.id}'.`,
          path: DiagnosticPath.root().property('imports'),
          ref: base.id,
        }),
      );
    }

    const semanticDiagnostics: readonly Diagnostic[] = this.semantics.validate(graphResult.graph);
    const all: Diagnostic[] = [...diagnostics, ...semanticDiagnostics];

    hasErrors = all.some((d: Diagnostic): boolean => d.severity === 'error');
    return { diagnostics: all, hasErrors };
  }

  /** Validates schema conformance, graph integrity, and semantics for a complete model project. */
  public validateProject(rootModelId: Id, inputs: readonly unknown[]): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    const models: GModel[] = [];

    inputs.forEach((input: unknown, index: number): void => {
      try {
        SchemaValidator.assertValid(input);
        models.push(input);
      } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : String(error);
        diagnostics.push(
          Diagnostics.error({
            code: VALIDATION_ERROR.SCHEMA_INVALID,
            message: message,
            path: DiagnosticPath.root().property('models').index(index),
          }),
        );
      }
    });
    if (diagnostics.length > 0) return { diagnostics: diagnostics, hasErrors: true };

    const graphResult: ProjectGraphResult = buildProjectGraph({ rootModelId: rootModelId, models: models });
    if (!graphResult.ok) return { diagnostics: [...graphResult.diagnostics], hasErrors: true };

    const semanticDiagnostics: Diagnostic[] = [...this.semantics.validate(graphResult.graph)];
    const hasErrors: boolean = semanticDiagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error');
    return { diagnostics: semanticDiagnostics, hasErrors: hasErrors };
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
