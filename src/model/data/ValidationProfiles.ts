import type { Attribute, Id } from '../Types.js';
import type { Diagnostic } from '../validation/Diagnostics.js';

/** A targeted constraint exception for recorded property values; findings remain visible as warnings. */
export interface AttributeValidationRule {
  /** Stable identifier of the property, including when inherited by a refinement. */
  readonly attributeId: Id;
  /** Stable identifier of the constraint whose finding may become a warning. */
  readonly constraintId: Id;
  /** Matches the original diagnostic code; unrelated findings remain errors. */
  readonly code: string;
  /** Accepts only historical values covered by this exception. Exceptions thrown here propagate to the caller. */
  readonly accepts: (value: unknown) => boolean;
}

/** Explicit exceptions applied per data-validation call without changing the model or recorded values. */
export interface InstanceValidationProfile {
  readonly rules: readonly AttributeValidationRule[];
}

/** @internal Applies targeted exceptions before cross-record key validation. */
export class InstanceValidationProfiles {
  /** Preserves every finding and its context, changing only the severity of matching errors. */
  public static apply(
    profile: InstanceValidationProfile | undefined,
    attribute: Attribute,
    value: unknown,
    findings: readonly Diagnostic[],
  ): readonly Diagnostic[] {
    if (!profile) return findings;
    return findings.map((finding: Diagnostic): Diagnostic => {
      if (finding.severity !== 'error') return finding;
      const accepted: boolean = profile.rules.some((rule: AttributeValidationRule): boolean => {
        const matches: boolean =
          rule.attributeId === attribute.id && rule.constraintId === finding.ref && rule.code === finding.code;
        return matches && rule.accepts(value);
      });
      return accepted ? { ...finding, severity: 'warn' } : finding;
    });
  }
}
