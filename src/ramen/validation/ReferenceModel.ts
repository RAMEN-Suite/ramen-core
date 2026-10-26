import type { Diagnostic, Id, Model } from '../../model/index.js';
import { DiagnosticPath, Diagnostics } from '../../model/validation/Diagnostics.js';
import { jsonValueKey } from '../../model/JsonValue.js';
import { RAMEN_MODEL } from '../ReferenceModel.js';
import { RAMEN_VALIDATION_ERROR } from './Codes.js';

const DEFINITION_COLLECTIONS: readonly string[] = ['classifiers', 'relations', 'attributes', 'constraints', 'literals'];

/** Checks the embedded reference against the supported RAMEN vocabulary without replacing it. */
export class RamenReferenceValidator {
  private static readonly signature: string = jsonValueKey(this.definition(RAMEN_MODEL));

  public static validate(model: Model): readonly Diagnostic[] {
    if (model.version !== RAMEN_MODEL.version) {
      return [
        this.error(
          model.id,
          RAMEN_VALIDATION_ERROR.BASE_MODEL_VERSION_UNSUPPORTED,
          `RAMEN reference version '${model.version}' is not supported. Expected '${RAMEN_MODEL.version}'.`,
        ),
      ];
    }
    if (jsonValueKey(this.definition(model)) === this.signature) return [];
    return [
      this.error(
        model.id,
        RAMEN_VALIDATION_ERROR.BASE_MODEL_INVALID,
        'The embedded RAMEN reference does not match the supported vocabulary. Definition order and descriptions may differ.',
      ),
    ];
  }

  private static definition(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((item: unknown): unknown => this.definition(item))
        .sort((left: unknown, right: unknown): number => jsonValueKey(left).localeCompare(jsonValueKey(right)));
    }

    if (typeof value !== 'object' || value === null) return value;
    const result: Record<string, unknown> = { ...value };
    delete result['description'];

    for (const key of [...DEFINITION_COLLECTIONS, 'from', 'to']) {
      if (result[key] !== undefined) result[key] = this.definition(result[key]);
    }
    return result;
  }

  private static error(id: Id, code: RAMEN_VALIDATION_ERROR, message: string): Diagnostic {
    return Diagnostics.error({ code, message, path: DiagnosticPath.root().property('models').property(id), ref: id });
  }
}
