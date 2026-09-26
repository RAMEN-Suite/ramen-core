import { RelationSelections } from '../graph/RelationScope';
import { Model, Id } from '../Types';
import { buildProjectGraph, ProjectGraphResult } from '../graph/BuildGraph';
import { ProjectGraph } from '../graph/ProjectGraph';
import { VALIDATION_ERROR } from './Codes';
import { Diagnostic, DiagnosticPath, Diagnostics } from './Diagnostics';
import { ModelRules } from './ModelRules';
import { ModelSchemaValidator } from './ModelSchema';

/** Diagnostics and summarized error state produced by instance validation. */
export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly hasErrors: boolean;
}

/** Successful validation result that exposes the resolved project graph. */
export interface ValidProjectResult {
  readonly valid: true;
  readonly hasErrors: false;
  readonly diagnostics: readonly Diagnostic[];
  readonly graph: ProjectGraph;
}

/** Failed validation result without a graph safe for downstream interpretation. */
export interface InvalidProjectResult {
  readonly valid: false;
  readonly hasErrors: true;
  readonly diagnostics: readonly Diagnostic[];
}

/** Result of validating a complete project of versioned RAMEN models. */
export type ProjectValidationResult = ValidProjectResult | InvalidProjectResult;

/** Validates schema conformance, reference resolution, and semantics for a complete RAMEN model project. */
export class ModelValidator {
  private readonly semantics: ModelRules = new ModelRules();

  /**
   * Validates all input models reachable from the root and returns their graph only when it is safe to interpret.
   * Inputs are unknown because schema validation is the trust boundary for JSON documents.
   */
  public validateProject(rootModelId: Id, inputs: readonly unknown[], selections?: RelationSelections): ProjectValidationResult {
    const diagnostics: Diagnostic[] = [];
    const models: Model[] = [];

    inputs.forEach((input: unknown, index: number): void => {
      try {
        ModelSchemaValidator.assertValid(input);
        models.push(input);
      } catch (error: unknown) {
        diagnostics.push(
          Diagnostics.error({
            code: VALIDATION_ERROR.SCHEMA_INVALID,
            message: error instanceof Error ? error.message : String(error),
            path: DiagnosticPath.root().property('models').index(index),
          }),
        );
      }
    });
    if (diagnostics.length > 0) return { valid: false, diagnostics: diagnostics, hasErrors: true };

    return this.validateModels(rootModelId, models, selections);
  }

  /** Validates references and rules after a format-specific reader has checked the document schemas. */
  public validateModels(rootModelId: Id, models: readonly Model[], selections?: RelationSelections): ProjectValidationResult {
    const graphResult: ProjectGraphResult = buildProjectGraph({ rootModelId: rootModelId, models: models });
    if (!graphResult.ok) return { valid: false, diagnostics: graphResult.diagnostics, hasErrors: true };
    const semanticDiagnostics: readonly Diagnostic[] = this.semantics.validate(graphResult.graph, selections);
    if (semanticDiagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error')) {
      return { valid: false, diagnostics: semanticDiagnostics, hasErrors: true };
    }
    return { valid: true, diagnostics: semanticDiagnostics, hasErrors: false, graph: graphResult.graph };
  }
}
