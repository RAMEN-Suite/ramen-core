import type { AttributeValidationRule, Classifier, InstanceValidationProfile } from '../../model/index.js';
import { VALIDATION_ERROR } from '../../model/validation/Codes.js';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../ReferenceModel.js';

/** Optional data-validation profiles for historical RAMEN records; model definitions remain unchanged. */
export class RamenValidationProfiles {
  private static readonly FORBIDDEN: RegExp = /[\s\p{Cc}\p{Cf}]/u;

  /** Accepts well-formed inherited RAMEN identity strings of 1–256 UTF-16 code units without whitespace or controls. */
  public static readonly LEGACY_IDENTIFIERS: InstanceValidationProfile = RamenValidationProfiles.legacyIdentifiers();

  private static legacyIdentifiers(): InstanceValidationProfile {
    const rules: AttributeValidationRule[] = [];
    const uuid: Classifier | undefined = RAMEN_MODEL.classifiers.find(
      (item: Classifier): boolean => item.id === RAMEN_ELEMENT.UUID,
    );
    if (uuid?.kind !== 'DataType') throw new Error('The RAMEN reference must declare the UUID data type.');

    for (const node of RAMEN_MODEL.classifiers) {
      if (node.kind !== 'Node') continue;
      for (const attribute of node.attributes) {
        if (attribute.name !== 'uuid') continue;
        for (const constraint of uuid.constraints ?? []) {
          if (constraint.language !== 'format' || constraint.expression !== 'uuid') continue;
          rules.push(
            Object.freeze({
              attributeId: attribute.id,
              constraintId: constraint.id,
              code: VALIDATION_ERROR.CONSTRAINT_FORMAT_MISMATCH,
              accepts: RamenValidationProfiles.acceptsIdentifier,
            }),
          );
        }
      }
    }

    if (rules.length === 0)
      throw new Error('The RAMEN reference must declare UUID identity properties and their format constraint.');
    return Object.freeze({ rules: Object.freeze(rules) });
  }

  private static acceptsIdentifier(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) return false;
    return value.isWellFormed() && !RamenValidationProfiles.FORBIDDEN.test(value);
  }
}
