import {
  ModelRef,
  type NodeRemovalPreview,
  type WorkspaceElement,
  type Attribute,
  type Id,
  type Model,
  type Ref,
  type ElementRef,
} from '../../model';

import { ModelWorkspace } from '../../model/editing/Workspace';

import type { Removal } from '../../model/editing/Inputs';
import { RamenModelFormat, type RamenModelDocument } from '../Document';
import { RamenAnnotations, type AnnotationProperty, type AnnotationRelation, type RamenAnnotation } from './Definitions';

/** Tracks how generic node and relation removal affects RAMEN annotation definitions. */
export class AnnotationRemoval {
  /** Uses the editable workspace so cross-level references are visible. */
  public constructor(private readonly workspace: ModelWorkspace) {}

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
  public updatedByRemoval(preview: NodeRemovalPreview): readonly WorkspaceElement[] {
    const attributes: ReadonlySet<Ref> = this.keys(this.removedAttributes(preview));
    const removedRelations: ReadonlySet<Ref> = this.keys(preview.relations);
    const removed: ReadonlySet<Ref> = this.keys(preview.annotations);

    return this.workspace.all().flatMap((model: Model): WorkspaceElement[] =>
      RamenAnnotations.get(model).flatMap((annotation: RamenAnnotation): WorkspaceElement[] => {
        if (removed.has(ModelRef.qualify(model.id, annotation.id))) return [];
        if (!this.usesRemoved(annotation, model.id, attributes, removedRelations)) return [];
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
  public clean(model: Model, preview: NodeRemovalPreview): Model {
    if (!RamenModelFormat.isDocument(model)) return model;
    const attributes: ReadonlySet<Ref> = this.keys(this.removedAttributes(preview));
    const removedRelations: ReadonlySet<Ref> = this.keys(preview.relations);
    const removed: ReadonlySet<Ref> = this.keys(preview.annotations);
    const annotations: RamenAnnotation[] = RamenAnnotations.get(model).flatMap(
      (annotation: RamenAnnotation): RamenAnnotation[] => {
        if (removed.has(ModelRef.qualify(model.id, annotation.id))) return [];

        const properties: readonly AnnotationProperty[] = annotation.properties.filter(
          (property: AnnotationProperty): boolean =>
            !('attributeId' in property) || !attributes.has(this.referenceKey(property.attributeId, model.id)),
        );
        const relations: readonly AnnotationRelation[] = annotation.relations.flatMap(
          (relation: AnnotationRelation): AnnotationRelation[] => {
            const relationIds: readonly Ref[] = relation.relationIds.filter(
              (ref: Ref): boolean => !removedRelations.has(this.referenceKey(ref, model.id)),
            );
            return relationIds.length > 0 ? [{ ...relation, relationIds }] : [];
          },
        );
        return [{ ...annotation, properties, relations }];
      },
    );
    const cleaned: RamenModelDocument = { ...model, annotations };
    return cleaned;
  }

  /** Removes a node attribute reference from local annotation definitions. */
  public removeAttribute(model: Model, input: Removal): Model {
    let updated: Model = model;
    for (const annotation of RamenAnnotations.get(model)) {
      const properties: readonly AnnotationProperty[] = annotation.properties.filter(
        (property: AnnotationProperty): boolean =>
          !('attributeId' in property) || !ModelRef.matches(property.attributeId, model.id, input.attributeId),
      );
      if (properties.length === annotation.properties.length) continue;
      updated = RamenAnnotations.update(updated, annotation.id, { ...annotation, properties });
    }
    return updated;
  }

  private removedAttributes(preview: NodeRemovalPreview): readonly WorkspaceElement[] {
    const nodes: ReadonlySet<Ref> = this.keys(preview.nodes);
    return this.workspace.all().flatMap((source: Model): WorkspaceElement[] =>
      source.classifiers.flatMap((classifier): WorkspaceElement[] =>
        classifier.kind === 'Node' && nodes.has(ModelRef.qualify(source.id, classifier.id))
          ? classifier.attributes.map((attribute: Attribute): WorkspaceElement => ({
              modelId: source.id,
              elementId: attribute.id,
            }))
          : [],
      ),
    );
  }

  private usesRemoved(
    annotation: RamenAnnotation,
    modelId: Id,
    attributes: ReadonlySet<Ref>,
    relations: ReadonlySet<Ref>,
  ): boolean {
    const property: boolean = annotation.properties.some(
      (item: AnnotationProperty): boolean =>
        'attributeId' in item && attributes.has(this.referenceKey(item.attributeId, modelId)),
    );
    const relation: boolean = annotation.relations.some((item: AnnotationRelation): boolean =>
      item.relationIds.some((ref: Ref): boolean => relations.has(this.referenceKey(ref, modelId))),
    );
    return property || relation;
  }

  private keys(items: readonly ElementRef[]): ReadonlySet<Ref> {
    return new Set<Ref>(items.map((item: ElementRef): Ref => ModelRef.qualify(item.modelId, item.elementId)));
  }

  private referenceKey(ref: Ref, ownerModelId: Id): Ref {
    return ModelRef.isQualified(ref) ? ref : ModelRef.qualify(ownerModelId, ref);
  }
}
