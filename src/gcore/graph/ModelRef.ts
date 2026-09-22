import { REGEXP } from '../model/GCorePatterns';
import { Id, QualifiedRef, Ref } from '../model/ModelTypes';

export interface QualifiedParts {
  readonly modelId: Id;
  readonly refId: Id;
}

export class ModelRef {
  public static isQualified(ref: Ref): boolean {
    return REGEXP.QUALIFIED_REF.test(ref);
  }

  public static splitQualified(ref: QualifiedRef): QualifiedParts {
    if (!ModelRef.isQualified(ref)) {
      throw new Error(`Invalid QualifiedRef: '${ref}'`);
    }

    const index: number = ref.indexOf(':');
    return { modelId: ref.slice(0, index), refId: ref.slice(index + 1) };
  }

  public static qualify(baseId: Id, nodeId: Id): QualifiedRef {
    return `${baseId}:${nodeId}`;
  }
}
