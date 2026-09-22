import { GNode } from '../gcore/model/Types';

/** RAMEN metadata stored in a GCore node extension for a concrete annotation type. */
export interface RamenAnnotationType {
  readonly kind: 'AnnotationType';
  readonly typeValue: string;
}

interface RamenExtension {
  readonly annotationType?: RamenAnnotationType;
}

/** Reads and writes the RAMEN-specific annotation type metadata of GCore nodes. */
export class AnnotationTypes {
  /** Returns annotation type metadata when the node declares it. */
  public static read(node: GNode): RamenAnnotationType | undefined {
    const ramen: unknown = node.ext?.ramen;
    if (!this.isRecord(ramen)) return undefined;
    const annotationType: unknown = ramen.annotationType;
    if (!this.isRecord(annotationType)) return undefined;
    if (annotationType.kind !== 'AnnotationType' || typeof annotationType.typeValue !== 'string') return undefined;
    return { kind: 'AnnotationType', typeValue: annotationType.typeValue };
  }

  /** Returns a copy of a node carrying the supplied annotation type value. */
  public static write(node: GNode, typeValue: string): GNode {
    const current: RamenExtension = this.readRamenExtension(node);
    return {
      ...node,
      ext: {
        ...(node.ext ?? {}),
        ramen: { ...current, annotationType: { kind: 'AnnotationType', typeValue: typeValue } },
      },
    };
  }

  private static readRamenExtension(node: GNode): RamenExtension {
    const ramen: unknown = node.ext?.ramen;
    return this.isRecord(ramen) ? ramen : {};
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
