import { SchemaFindings } from './SchemaFindings.js';
import { RelationSelections } from '../graph/RelationScope.js';
import { Model, Id } from '../Types.js';
import { buildProjectGraph, ProjectGraphResult } from '../graph/BuildGraph.js';
import { ProjectGraph } from '../graph/ProjectGraph.js';
import { VALIDATION_ERROR } from './Codes.js';
import { Diagnostic, DiagnosticPath } from './Diagnostics.js';
import { ModelRules } from './ModelRules.js';
import { ModelSchemaValidator } from './ModelSchema.js';

/** Diagnostics and summarised error state produced by instance validation. */
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

/** Result of validating a complete project of versioned RMF models. */
export type ProjectValidationResult = ValidProjectResult | InvalidProjectResult;

/** Validates schema conformance, reference resolution, and semantics for a complete RMF project. */
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
      const path: DiagnosticPath = DiagnosticPath.root().property('models').index(index);
      const findings: readonly Diagnostic[] = SchemaFindings.validate(
        ModelSchemaValidator.getSchemaNode(),
        input,
        VALIDATION_ERROR.SCHEMA_INVALID,
        path,
      );
      diagnostics.push(...findings);
      if (findings.length === 0) models.push(input as Model);
    });

    if (diagnostics.length > 0) return { valid: false, diagnostics: diagnostics, hasErrors: true };
    return this.validateModels(rootModelId, models, selections);
  }

  /** Validates references and rules after a format-specific reader has checked the document schemas. */
  public validateModels(rootModelId: Id, models: readonly Model[], selections?: RelationSelections): ProjectValidationResult {
    const graphResult: ProjectGraphResult = buildProjectGraph({ rootModelId: rootModelId, models: models });
    if (!graphResult.ok) return { valid: false, diagnostics: graphResult.diagnostics, hasErrors: true };

    const semanticDiagnostics: readonly Diagnostic[] = this.semantics.validate(graphResult.graph, selections);
    const hasErrors: boolean = semanticDiagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error');
    if (hasErrors) {
      return { valid: false, diagnostics: semanticDiagnostics, hasErrors: true };
    }

    return { valid: true, diagnostics: semanticDiagnostics, hasErrors: false, graph: graphResult.graph };
  }
}
