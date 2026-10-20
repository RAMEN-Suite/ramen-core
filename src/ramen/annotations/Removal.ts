import {
  ModelRef,
  type NodeRemovalPreview,
  type WorkspaceElement,
  type Id,
  type Model,
  type Ref,
  type ElementRef,
} from '../../model/index.js';

import { ModelWorkspace } from '../../model/editing/Workspace.js';

import { RamenModelFormat, type RamenModelDocument } from '../Document.js';
import { RamenAnnotations, type AnnotationRelation, type RamenAnnotation } from './Definitions.js';

/** Node removal plus annotation declarations removed or changed by the edit. */
export interface RamenNodeRemovalPreview extends NodeRemovalPreview {
  readonly annotations: readonly WorkspaceElement[];
  readonly updatedAnnotations: readonly WorkspaceElement[];
}

/** Relation removal plus annotation declarations whose rules would change. */
export interface RamenRelationRemovalPreview {
  readonly relations: readonly WorkspaceElement[];
  readonly updatedAnnotations: readonly WorkspaceElement[];
}

/** Tracks how generic node and relation removal affects RAMEN annotation definitions. */
export class AnnotationRemoval {
  /** Uses the editable workspace so cross-level references are visible. */
  public constructor(private readonly workspace: ModelWorkspace) {}

  /** Enriches a generic removal preview with its annotation effects. */
  public preview(preview: NodeRemovalPreview): RamenNodeRemovalPreview {
    const removed: RamenNodeRemovalPreview = { ...preview, annotations: this.removedByNodes(preview), updatedAnnotations: [] };
    return { ...removed, updatedAnnotations: this.updatedByRemoval(removed) };
  }

  /** Lists annotation definitions owned by nodes in a removal preview. */
  public removedByNodes(preview: NodeRemovalPreview): readonly WorkspaceElement[] {
    const nodes: ReadonlySet<Ref> = this.keys(preview.nodes);
    return this.workspace
      .all()
      .flatMap((model: Model): WorkspaceElement[] =>
        RamenAnnotations.get(model).flatMap((annotation: RamenAnnotation): WorkspaceElement[] =>
          nodes.has(this.referenceKey(annotation.annotationId, model.id))
            ? [{ modelId: model.id, elementId: annotation.id }]
            : [],
        ),
      );
  }

  /** Returns annotation paths attached to a node's inheritance chain. */
  public diagnosticPaths(models: readonly Model[], lineage: readonly ElementRef[]): readonly string[] {
    const nodes: ReadonlySet<Ref> = this.keys(lineage);
    return models.flatMap((model: Model): string[] =>
      RamenAnnotations.get(model).flatMap((annotation: RamenAnnotation): string[] =>
        nodes.has(this.referenceKey(annotation.annotationId, model.id))
          ? [`/models/${model.id}/annotations/${annotation.id}`]
          : [],
      ),
    );
  }

  /** Lists surviving definitions whose properties or relation rules would change. */
  public updatedByRemoval(preview: RamenNodeRemovalPreview): readonly WorkspaceElement[] {
    const removedRelations: ReadonlySet<Ref> = this.keys(preview.relations);
    const removed: ReadonlySet<Ref> = this.keys(preview.annotations);

    return this.workspace.all().flatMap((model: Model): WorkspaceElement[] =>
      RamenAnnotations.get(model).flatMap((annotation: RamenAnnotation): WorkspaceElement[] => {
        if (removed.has(ModelRef.qualify(model.id, annotation.id))) return [];
        if (!this.usesRemoved(annotation, model.id, removedRelations)) return [];
        return [{ modelId: model.id, elementId: annotation.id }];
      }),
    );
  }

  /** Provides a readable annotation type for a generic removal error. */
  public name(item: WorkspaceElement): string {
    const model: Model | undefined = this.workspace.get(item.modelId);
    if (!model) return item.elementId;
    return (
      RamenAnnotations.get(model).find((annotation: RamenAnnotation): boolean => annotation.id === item.elementId)?.type ??
      item.elementId
    );
  }

  /** Removes invalid annotation references from one affected project model. */
  public clean(model: Model, preview: RamenNodeRemovalPreview): Model {
    if (!RamenModelFormat.isDocument(model)) return model;
    const removedRelations: ReadonlySet<Ref> = this.keys(preview.relations);
    const removed: ReadonlySet<Ref> = this.keys(preview.annotations);
    const annotations: RamenAnnotation[] = RamenAnnotations.get(model).flatMap(
      (annotation: RamenAnnotation): RamenAnnotation[] => {
        if (removed.has(ModelRef.qualify(model.id, annotation.id))) return [];

        const relations: readonly AnnotationRelation[] = annotation.relations.flatMap(
          (relation: AnnotationRelation): AnnotationRelation[] => {
            const relationIds: readonly Ref[] = relation.relationIds.filter(
              (ref: Ref): boolean => !removedRelations.has(this.referenceKey(ref, model.id)),
            );
            return relationIds.length > 0 ? [{ ...relation, relationIds }] : [];
          },
        );
        return [{ ...annotation, relations }];
      },
    );
    const cleaned: RamenModelDocument = { ...model, annotations };
    return cleaned;
  }

  private usesRemoved(annotation: RamenAnnotation, modelId: Id, relations: ReadonlySet<Ref>): boolean {
    const relation: boolean = annotation.relations.some((item: AnnotationRelation): boolean =>
      item.relationIds.some((ref: Ref): boolean => relations.has(this.referenceKey(ref, modelId))),
    );
    return relation;
  }

  private keys(items: readonly ElementRef[]): ReadonlySet<Ref> {
    return new Set<Ref>(items.map((item: ElementRef): Ref => ModelRef.qualify(item.modelId, item.elementId)));
  }

  private referenceKey(ref: Ref, ownerModelId: Id): Ref {
    return ModelRef.isQualified(ref) ? ref : ModelRef.qualify(ownerModelId, ref);
  }
}
