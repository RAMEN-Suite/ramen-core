import { Bounds, GModel, Id, Ref } from '../gcore/model/Types';
import { RamenSchemaValidator } from './Schema';

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

/** Reads and updates the formal `ext.ramen.annotations` section of a GCore model. */
export class RamenAnnotations {
  /** Returns a detached list of annotations declared by the model. */
  public static get(model: GModel): readonly RamenAnnotation[] {
    const ramen: unknown = model.ext?.ramen;
    if (!RamenSchemaValidator.isValid(ramen) || !this.isRecord(ramen) || !Array.isArray(ramen.annotations)) return [];
    return structuredClone(ramen.annotations) as readonly RamenAnnotation[];
  }

  /** Reports whether a present `ramen.annotations` value has the complete serialized shape. */
  public static hasValidSection(model: GModel): boolean {
    const ramen: unknown = model.ext?.ramen;
    if (ramen === undefined) return true;
    return RamenSchemaValidator.isValid(ramen);
  }

  /** Returns a model with the annotation appended to its RAMEN section. */
  public static add(model: GModel, annotation: RamenAnnotation): GModel {
    return this.write(model, [...this.get(model), structuredClone(annotation)]);
  }

  /** Returns a model with one declared annotation replaced. */
  public static update(model: GModel, annotationId: Id, annotation: RamenAnnotation): GModel {
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
  public static remove(model: GModel, annotationId: Id): GModel {
    const current: readonly RamenAnnotation[] = this.get(model);
    const remaining: readonly RamenAnnotation[] = current.filter(
      (candidate: RamenAnnotation): boolean => candidate.id !== annotationId,
    );
    if (remaining.length === current.length) throw new Error(`Annotation not found: '${annotationId}'.`);
    return this.write(model, remaining);
  }

  private static getExtension(model: GModel): RamenModelExtension {
    const ramen: unknown = model.ext?.ramen;
    return this.isRecord(ramen) ? ramen : {};
  }

  private static write(model: GModel, annotations: readonly RamenAnnotation[]): GModel {
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
