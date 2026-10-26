import type { Attribute, Bounds, Model, Id, Ref, RelationSelections, DescribedDefinition } from '../../model/index.js';

import { ModelDescriptions } from '../../model/Descriptions.js';
import { AnnotationShapeSchemaValidator } from './Schema.js';
import { RAMEN_PROJECT_SCHEMA_URI, RamenModelFormat, type RamenModelDocument } from '../Document.js';

/** Property declared directly by one annotation shape. */
export type AnnotationShapeProperty = Attribute;

/** Relations counted together for one closed RAMEN annotation definition. */
export interface AnnotationShapeRelation {
  readonly relationIds: readonly Ref[];
  readonly direction: 'outgoing' | 'incoming';
  readonly bounds: Bounds;
}

/** Shape attached to an Annotation node. */
export interface AnnotationShape extends DescribedDefinition {
  readonly id: Id;
  readonly annotationId: Ref;
  readonly type: string;
  readonly properties: readonly AnnotationShapeProperty[];
  readonly relations: readonly AnnotationShapeRelation[];
}

/** Reads and updates annotation shapes in RAMEN project documents. */
export class AnnotationShapes {
  public static relationSelections(inputs: readonly unknown[]): RelationSelections {
    const models: readonly RamenModelDocument[] = inputs.filter(RamenModelFormat.isDocument);
    return new Map<Id, readonly Ref[]>(
      models.map((model: RamenModelDocument): [Id, readonly Ref[]] => [
        model.id,
        model.annotations.flatMap((annotation: AnnotationShape): Ref[] =>
          annotation.relations.flatMap((relation: AnnotationShapeRelation): readonly Ref[] => relation.relationIds),
        ),
      ]),
    );
  }

  /** Returns a detached list of annotation shapes declared by the model. */
  public static get(model: Model): readonly AnnotationShape[] {
    if (model.$schema !== RAMEN_PROJECT_SCHEMA_URI) return [];
    const document: RamenModelDocument = model as RamenModelDocument;
    const valid: boolean = AnnotationShapeSchemaValidator.isValid({ annotations: document.annotations });
    if (!valid) return [];
    return ModelDescriptions.copy(document.annotations);
  }

  /** Reports whether the model's annotation shapes have the complete serialised shape. */
  public static hasValidSection(model: Model): boolean {
    if (model.ext?.['ramen'] !== undefined) return false;
    if (model.$schema !== RAMEN_PROJECT_SCHEMA_URI) return true;
    const document: RamenModelDocument = model as RamenModelDocument;
    return AnnotationShapeSchemaValidator.isValid({ annotations: document.annotations });
  }

  /** Returns a project model with the annotation appended. */
  public static add<T extends Model>(model: T, annotation: AnnotationShape): T {
    return this.write(model, [...this.get(model), structuredClone(annotation)]);
  }

  /** Returns a model with one declared annotation replaced. */
  public static update<T extends Model>(model: T, annotationId: Id, annotation: AnnotationShape): T {
    const current: readonly AnnotationShape[] = this.get(model);
    const exists: boolean = current.some((candidate: AnnotationShape): boolean => candidate.id === annotationId);
    if (!exists) throw new Error(`Annotation not found: '${annotationId}'.`);

    return this.write(
      model,
      current.map((candidate: AnnotationShape): AnnotationShape =>
        candidate.id === annotationId ? structuredClone(annotation) : candidate,
      ),
    );
  }

  /** Returns a model without one declared annotation. */
  public static remove<T extends Model>(model: T, annotationId: Id): T {
    const current: readonly AnnotationShape[] = this.get(model);
    const remaining: readonly AnnotationShape[] = current.filter(
      (candidate: AnnotationShape): boolean => candidate.id !== annotationId,
    );

    if (remaining.length === current.length) throw new Error(`Annotation not found: '${annotationId}'.`);
    return this.write(model, remaining);
  }

  private static write<T extends Model>(model: T, annotations: readonly AnnotationShape[]): T {
    if (model.$schema !== RAMEN_PROJECT_SCHEMA_URI) throw new Error('Annotation definitions require a RAMEN project model.');
    annotations = ModelDescriptions.copy(annotations);
    if (!AnnotationShapeSchemaValidator.isValid({ annotations: annotations })) {
      throw new Error('Invalid annotation shapes.');
    }
    return { ...model, annotations: structuredClone(annotations) };
  }
}
