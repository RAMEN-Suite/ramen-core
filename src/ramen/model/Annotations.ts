import type { Bounds, Model, Id, Ref } from '../../model/index';
import { RamenAnnotationSchemaValidator } from '../validation/AnnotationSchema';
import { RAMEN_PROJECT_SCHEMA_URI } from './Document';
import type { RamenModelDocument } from './Document';

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

/** Reads and updates annotation definitions in RAMEN project documents. */
export class RamenAnnotations {
  /** Returns a detached list of annotations declared by the model. */
  public static get(model: Model): readonly RamenAnnotation[] {
    if (model.$schema !== RAMEN_PROJECT_SCHEMA_URI) return [];
    const document: RamenModelDocument = model as RamenModelDocument;
    return RamenAnnotationSchemaValidator.isValid({ annotations: document.annotations })
      ? structuredClone(document.annotations)
      : [];
  }

  /** Reports whether the model's annotation definitions have the complete serialized shape. */
  public static hasValidSection(model: Model): boolean {
    if (model.ext?.ramen !== undefined) return false;
    if (model.$schema !== RAMEN_PROJECT_SCHEMA_URI) return true;
    const document: RamenModelDocument = model as RamenModelDocument;
    return RamenAnnotationSchemaValidator.isValid({ annotations: document.annotations });
  }

  /** Returns a project model with the annotation appended. */
  public static add<T extends Model>(model: T, annotation: RamenAnnotation): T {
    return this.write(model, [...this.get(model), structuredClone(annotation)]);
  }

  /** Returns a model with one declared annotation replaced. */
  public static update<T extends Model>(model: T, annotationId: Id, annotation: RamenAnnotation): T {
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
  public static remove<T extends Model>(model: T, annotationId: Id): T {
    const current: readonly RamenAnnotation[] = this.get(model);
    const remaining: readonly RamenAnnotation[] = current.filter(
      (candidate: RamenAnnotation): boolean => candidate.id !== annotationId,
    );

    if (remaining.length === current.length) throw new Error(`Annotation not found: '${annotationId}'.`);
    return this.write(model, remaining);
  }

  private static write<T extends Model>(model: T, annotations: readonly RamenAnnotation[]): T {
    if (model.$schema !== RAMEN_PROJECT_SCHEMA_URI) throw new Error('Annotation definitions require a RAMEN project model.');
    if (!RamenAnnotationSchemaValidator.isValid({ annotations: annotations })) {
      throw new Error('Invalid annotation definitions.');
    }
    return { ...model, annotations: structuredClone(annotations) };
  }
}
