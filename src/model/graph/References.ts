import type { Id, QualifiedRef, Ref } from '../Types';

const QUALIFIED_REF: RegExp = /^[A-Za-z0-9_-]{16,}:[A-Za-z0-9_-]{16,}$/;

/** Parsed model and element identifiers of a qualified reference. */
export interface QualifiedParts {
  readonly modelId: Id;
  readonly refId: Id;
}

/** Creates and parses references between RMF model elements. */
export class ModelRef {
  /** Reports whether a reference contains both a model and element identifier. */
  public static isQualified(ref: Ref): boolean {
    return QUALIFIED_REF.test(ref);
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

  /** Matches a local declaration through either its local ID or its qualified reference. */
  public static matches(reference: Ref, modelId: Id, elementId: Id): boolean {
    return reference === elementId || reference === this.qualify(modelId, elementId);
  }

  /** Returns the local element identifier from a local or qualified reference. */
  public static localId(ref: Ref): Id {
    return ModelRef.isQualified(ref) ? ModelRef.splitQualified(ref).refId : ref;
  }
}
