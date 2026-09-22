import { Id } from '../gcore/model/Types';
import { DiagnosticPath, Diagnostics } from '../gcore/validation/Diagnostics';
import { ModelValidator, ProjectValidationResult } from '../gcore/validation/Validate';
import { RAMEN_MODEL } from './Model';

/** Stable diagnostics emitted by RAMEN-specific validation. */
export const RAMEN_VALIDATION_ERROR: Readonly<{ BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED' }> = {
  BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED',
} as const;

/** Validates that a valid GCore project is rooted in the versioned RAMEN model. */
export class RamenValidator {
  public constructor(private readonly models: ModelValidator = new ModelValidator()) {}

  /** Validates a complete RAMEN project and exposes its graph only on success. */
  public validateProject(rootModelId: Id, inputs: readonly unknown[]): ProjectValidationResult {
    const result: ProjectValidationResult = this.models.validateProject(rootModelId, inputs);
    if (!result.valid) return result;
    if (result.graph.getModels().some((model): boolean => model.id === RAMEN_MODEL.id)) return result;

    return {
      valid: false,
      hasErrors: true,
      diagnostics: [
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.BASE_MODEL_REQUIRED,
          message: `RAMEN project '${rootModelId}' must import RAMEN '${RAMEN_MODEL.id}' directly or transitively.`,
          path: DiagnosticPath.root().property('imports'),
          ref: RAMEN_MODEL.id,
        }),
      ],
    };
  }
}
