import type { Bounds, Model, Id, Ref } from '../../model/index';
import { RamenAnnotationSchemaValidator } from '../validation/AnnotationSchema';

/** Attribute selected for one closed RAMEN annotation definition. */
export interface RamenAnnotationProperty {
  readonly attributeId: Ref;
  readonly bounds?: Bounds;
}

/** Relation selected for one closed RAMEN annotation definition. */
export interface RamenAnnotationRelation {
  readonly relationId: Ref;
  readonly direction: 'outgoing' | 'incoming';
  readonly bounds: Bounds;
}

/** Closed annotation variant attached to an Annotation node. */
export interface RamenAnnotation {
  readonly id: Id;
  readonly annotationId: Ref;
  readonly type: string;
  readonly refines?: Ref;
  readonly properties: readonly RamenAnnotationProperty[];
  readonly relations: readonly RamenAnnotationRelation[];
}

interface RamenModelExtension {
  readonly annotations?: readonly RamenAnnotation[];
}

/** Reads and updates the formal `ext.ramen.annotations` section of a RAMEN model. */
export class RamenAnnotations {
  /** Returns a detached list of annotations declared by the model. */
  public static get(model: Model): readonly RamenAnnotation[] {
    const ramen: unknown = model.ext?.ramen;
    if (!RamenAnnotationSchemaValidator.isValid(ramen) || !this.isRecord(ramen) || !Array.isArray(ramen.annotations)) return [];
    return structuredClone(ramen.annotations) as readonly RamenAnnotation[];
  }

  /** Reports whether a present `ramen.annotations` value has the complete serialized shape. */
  public static hasValidSection(model: Model): boolean {
    const ramen: unknown = model.ext?.ramen;
    if (ramen === undefined) return true;
    return RamenAnnotationSchemaValidator.isValid(ramen);
  }

  /** Returns a model with the annotation appended to its RAMEN section. */
  public static add(model: Model, annotation: RamenAnnotation): Model {
    return this.write(model, [...this.get(model), structuredClone(annotation)]);
  }

  /** Returns a model with one declared annotation replaced. */
  public static update(model: Model, annotationId: Id, annotation: RamenAnnotation): Model {
    const current: readonly RamenAnnotation[] = this.get(model);
    if (!current.some((candidate: RamenAnnotation): boolean => candidate.id === annotationId))
      throw new Error(`Annotation not found: '${annotationId}'.`);
    return this.write(
      model,
      current.map((candidate: RamenAnnotation): RamenAnnotation =>
        candidate.id === annotationId ? structuredClone(annotation) : candidate,
      ),
    );
  }

  /** Returns a model without one declared annotation. */
  public static remove(model: Model, annotationId: Id): Model {
    const current: readonly RamenAnnotation[] = this.get(model);
    const remaining: readonly RamenAnnotation[] = current.filter(
      (candidate: RamenAnnotation): boolean => candidate.id !== annotationId,
    );
    if (remaining.length === current.length) throw new Error(`Annotation not found: '${annotationId}'.`);
    return this.write(model, remaining);
  }

  private static getExtension(model: Model): RamenModelExtension {
    const ramen: unknown = model.ext?.ramen;
    return this.isRecord(ramen) ? ramen : {};
  }

  private static write(model: Model, annotations: readonly RamenAnnotation[]): Model {
    const ramen: RamenModelExtension = this.getExtension(model);
    return {
      ...model,
      ext: { ...(model.ext ?? {}), ramen: { ...ramen, annotations: structuredClone(annotations) } },
    };
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
