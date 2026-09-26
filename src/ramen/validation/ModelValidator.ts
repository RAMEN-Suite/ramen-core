import {
  DiagnosticPath,
  Diagnostics,
  ModelValidator,
  ModelSchemaValidator,
  ProjectGraph,
  VALIDATION_ERROR,
} from '../../model/index';
import type { Diagnostic, Model, Id, ProjectValidationResult } from '../../model/index';
import { RamenAnnotations } from '../annotations/Definitions';
import { RamenModelFormat } from '../model/Document';
import { RAMEN_MODEL } from '../model/ReferenceModel';
import { RamenProjectSchemaValidator } from './ProjectSchema';
import { RamenAnnotationRules, RAMEN_VALIDATION_ERROR } from '../annotations/Rules';
export { RAMEN_VALIDATION_ERROR } from '../annotations/Rules';

/** Validates the RAMEN model format first and then the closed annotation definitions. */
export class RamenValidator {
  public constructor(private readonly models: ModelValidator = new ModelValidator()) {}

  /** Validates a complete RAMEN project and exposes its graph only on success. */
  public validateProject(rootModelId: Id, inputs: readonly unknown[]): ProjectValidationResult {
    const documentErrors: readonly Diagnostic[] = this.validateDocuments(inputs);
    if (documentErrors.length > 0) return { valid: false, hasErrors: true, diagnostics: documentErrors };

    const normalized: readonly Model[] = (inputs as readonly Model[]).map((input: Model): Model =>
      RamenModelFormat.toGeneric(input),
    );
    const result: ProjectValidationResult = this.models.validateModels(
      rootModelId,
      normalized,
      RamenAnnotations.relationSelections(inputs),
    );
    if (!result.valid) return result;
    const requirements: readonly Diagnostic[] = this.validateRequirements(rootModelId, inputs, result.graph);
    if (requirements.length > 0) return { valid: false, hasErrors: true, diagnostics: requirements };

    const diagnostics: readonly Diagnostic[] = new RamenAnnotationRules().validate(result.graph, inputs as readonly Model[]);
    if (diagnostics.length === 0) return result;
    return { valid: false, hasErrors: true, diagnostics: [...result.diagnostics, ...diagnostics] };
  }

  private validateRequirements(rootModelId: Id, inputs: readonly unknown[], graph: ProjectGraph): readonly Diagnostic[] {
    const root: unknown = inputs.find(
      (input: unknown): boolean => typeof input === 'object' && input !== null && 'id' in input && input.id === rootModelId,
    );
    if (!RamenModelFormat.isDocument(root)) {
      return [
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.PROJECT_FORMAT_REQUIRED,
          message: `Root model '${rootModelId}' must use the RAMEN project format.`,
          path: DiagnosticPath.root().property('$schema'),
          ref: rootModelId,
        }),
      ];
    }
    if (!graph.getModels().some((model: Model): boolean => model.id === RAMEN_MODEL.id)) {
      return [
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.BASE_MODEL_REQUIRED,
          message: `RAMEN project '${rootModelId}' must import RAMEN '${RAMEN_MODEL.id}' directly or transitively.`,
          path: DiagnosticPath.root().property('imports'),
          ref: RAMEN_MODEL.id,
        }),
      ];
    }

    return [];
  }

  private validateDocuments(inputs: readonly unknown[]): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    inputs.forEach((input: unknown, index: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root().property('models').index(index);
      if (!RamenModelFormat.isDocument(input)) {
        if (!ModelSchemaValidator.isValid(input))
          diagnostics.push(
            Diagnostics.error({ code: VALIDATION_ERROR.SCHEMA_INVALID, message: 'Invalid generic model document.', path }),
          );
        return;
      }
      if (RamenProjectSchemaValidator.isValid(input)) return;
      const code: string = RamenAnnotations.hasValidSection(input)
        ? VALIDATION_ERROR.SCHEMA_INVALID
        : RAMEN_VALIDATION_ERROR.ANNOTATIONS_INVALID;
      diagnostics.push(
        Diagnostics.error({ code, message: `Model '${input.id}' does not match the RAMEN project schema.`, path, ref: input.id }),
      );
    });

    return diagnostics;
  }
}
