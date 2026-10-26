import { SchemaFindings } from '../../model/validation/SchemaFindings.js';
import {
  DiagnosticPath,
  Diagnostics,
  type Diagnostic,
  ModelValidator,
  type ProjectValidationResult,
  ModelSchemaValidator,
  ProjectGraph,
  VALIDATION_ERROR,
  type Model,
  type Id,
} from '../../model/index.js';

import { AnnotationShapes } from '../annotations/Definitions.js';
import { RamenModelFormat } from '../Document.js';
import { RamenReferenceValidator } from './ReferenceModel.js';
import { RAMEN_MODEL } from '../ReferenceModel.js';
import { RamenProjectSchemaValidator } from './ProjectSchema.js';
import { AnnotationShapeRules } from '../annotations/Rules.js';
import { RAMEN_VALIDATION_ERROR } from './Codes.js';
export { RAMEN_VALIDATION_ERROR } from './Codes.js';

/** Validates the RAMEN model format first and then the closed annotation shapes. */
export class RamenValidator {
  public constructor(private readonly models: ModelValidator = new ModelValidator()) {}

  /** Validates a complete RAMEN project and exposes its graph only on success. */
  public validateProject(rootModelId: Id, inputs: readonly unknown[]): ProjectValidationResult {
    const documentErrors: readonly Diagnostic[] = this.validateDocuments(inputs);
    if (documentErrors.length > 0) return { valid: false, hasErrors: true, diagnostics: documentErrors };

    const normalised: readonly Model[] = (inputs as readonly Model[]).map((input: Model): Model =>
      RamenModelFormat.toGeneric(input),
    );
    const result: ProjectValidationResult = this.models.validateModels(
      rootModelId,
      normalised,
      AnnotationShapes.relationSelections(inputs),
    );
    if (!result.valid) return result;
    const requirements: readonly Diagnostic[] = this.validateRequirements(rootModelId, inputs, result.graph);
    if (requirements.length > 0) return { valid: false, hasErrors: true, diagnostics: requirements };

    const diagnostics: readonly Diagnostic[] = new AnnotationShapeRules().validate(result.graph, inputs as readonly Model[]);
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
          path: DiagnosticPath.root().property('models').property(rootModelId).property('$schema'),
          ref: rootModelId,
        }),
      ];
    }

    const reference: Model | undefined = graph.getModel(RAMEN_MODEL.id);
    if (!reference) {
      return [
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.BASE_MODEL_REQUIRED,
          message: `RAMEN project '${rootModelId}' must import RAMEN '${RAMEN_MODEL.id}' directly or transitively.`,
          path: DiagnosticPath.root().property('models').property(rootModelId).property('imports'),
          ref: RAMEN_MODEL.id,
        }),
      ];
    }

    return RamenReferenceValidator.validate(reference);
  }

  private validateDocuments(inputs: readonly unknown[]): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    inputs.forEach((input: unknown, index: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root().property('models').index(index);
      if (!RamenModelFormat.isDocument(input)) {
        diagnostics.push(
          ...SchemaFindings.validate(ModelSchemaValidator.getSchemaNode(), input, VALIDATION_ERROR.SCHEMA_INVALID, path),
        );
        return;
      }

      if (RamenProjectSchemaValidator.isValid(input)) return;
      const code: string = AnnotationShapes.hasValidSection(input)
        ? VALIDATION_ERROR.SCHEMA_INVALID
        : RAMEN_VALIDATION_ERROR.ANNOTATIONS_INVALID;

      diagnostics.push(...SchemaFindings.validate(RamenProjectSchemaValidator.getSchemaNode(), input, code, path));
    });

    return diagnostics;
  }
}
