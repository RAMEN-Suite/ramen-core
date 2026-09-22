import { REGEXP } from '../model/Patterns';
import { Id, QualifiedRef, Ref } from '../model/Types';

/** Parsed model and element identifiers of a qualified reference. */
export interface QualifiedParts {
  readonly modelId: Id;
  readonly refId: Id;
}

/** Creates and parses references between GCore model elements. */
export class ModelRef {
  /** Reports whether a reference contains both a model and element identifier. */
  public static isQualified(ref: Ref): boolean {
    return REGEXP.QUALIFIED_REF.test(ref);
  }

  /** Splits a qualified reference or throws when its syntax is invalid. */
  public static splitQualified(ref: QualifiedRef): QualifiedParts {
    if (!ModelRef.isQualified(ref)) {
      throw new Error(`Invalid QualifiedRef: '${ref}'`);
    }

    const index: number = ref.indexOf(':');
    return { modelId: ref.slice(0, index), refId: ref.slice(index + 1) };
  }

  /** Creates a qualified reference from model and element identifiers. */
  public static qualify(baseId: Id, nodeId: Id): QualifiedRef {
    return `${baseId}:${nodeId}`;
  }
}
