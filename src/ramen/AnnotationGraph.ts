import { GModel, GNode, Id, Ref } from '../gcore/model/Types';
import { ProjectGraph, ResolvedModelElement } from '../gcore/project/Graph';
import { ModelRef, QualifiedParts } from '../gcore/project/Refs';
import { RamenAnnotation, RamenAnnotations } from './Annotations';

/** Annotation definition resolved together with the model that declares it. */
export interface ResolvedRamenAnnotation {
  readonly modelId: Id;
  readonly annotation: RamenAnnotation;
}

/** Resolves RAMEN annotations and their inheritance over a validated project graph. */
export class RamenAnnotationGraph {
  private readonly annotationsByModel: ReadonlyMap<Id, readonly RamenAnnotation[]>;

  /** Indexes annotations from every reachable model. */
  public constructor(private readonly graph: ProjectGraph) {
    this.annotationsByModel = new Map<Id, readonly RamenAnnotation[]>(
      graph.getModels().map((model: GModel): [Id, readonly RamenAnnotation[]] => [model.id, RamenAnnotations.get(model)]),
    );
  }

  /** Returns annotations declared directly by one model. */
  public getDeclared(modelId: Id): readonly RamenAnnotation[] {
    return this.annotationsByModel.get(modelId) ?? [];
  }

  /** Returns all reachable annotation definitions with their owning models. */
  public getAll(): readonly ResolvedRamenAnnotation[] {
    return this.graph.getModels().flatMap((model: GModel): ResolvedRamenAnnotation[] =>
      this.getDeclared(model.id).map((annotation: RamenAnnotation): ResolvedRamenAnnotation => ({
        modelId: model.id,
        annotation: annotation,
      })),
    );
  }

  /** Resolves a local or qualified annotation reference. */
  public resolve(ownerModelId: Id, reference: Ref): ResolvedRamenAnnotation | undefined {
    const target: QualifiedParts = ModelRef.isQualified(reference)
      ? ModelRef.splitQualified(reference)
      : { modelId: ownerModelId, refId: reference };
    const annotation: RamenAnnotation | undefined = this.getDeclared(target.modelId).find(
      (candidate: RamenAnnotation): boolean => candidate.id === target.refId,
    );
    return annotation ? { modelId: target.modelId, annotation: annotation } : undefined;
  }

  /** Returns the effective closed annotation variants available to one Annotation node. */
  public getEffective(modelId: Id, nodeId: Id): readonly ResolvedRamenAnnotation[] {
    const node: GNode | undefined = this.graph.getNode(modelId, nodeId);
    if (!node) return [];
    const lineage: readonly ResolvedModelElement<GNode>[] = [
      { modelId: modelId, element: node },
      ...this.graph.getNodeAncestors(modelId, nodeId),
    ];
    const result: Map<string, ResolvedRamenAnnotation> = new Map<string, ResolvedRamenAnnotation>();
    for (const owner of lineage) {
      for (const annotation of this.getDeclared(owner.modelId)) {
        const declaredNode: ResolvedModelElement<GNode> | undefined = this.graph.resolveNode(
          owner.modelId,
          annotation.annotationId,
        );
        if (declaredNode?.modelId !== owner.modelId || declaredNode.element.id !== owner.element.id) continue;
        if (!result.has(annotation.type)) result.set(annotation.type, { modelId: owner.modelId, annotation: annotation });
      }
    }
    return [...result.values()];
  }

  /** Finds one effective annotation variant by its serialized `type` value. */
  public findEffective(modelId: Id, nodeId: Id, type: string): ResolvedRamenAnnotation | undefined {
    return this.getEffective(modelId, nodeId).find(
      (candidate: ResolvedRamenAnnotation): boolean => candidate.annotation.type === type,
    );
  }
}
