import { ModelRef, ProjectGraph } from '../../model/index';
import type { Model, Node, Id, QualifiedParts, Ref, ResolvedModelElement } from '../../model/index';
import { RamenAnnotation, RamenAnnotations } from '../model/Annotations';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../model/ReferenceModel';

/** Annotation definition resolved together with the model that declares it. */
export interface ResolvedRamenAnnotation {
  readonly modelId: Id;
  readonly annotation: RamenAnnotation;
}

/** Resolves RAMEN annotations and their inheritance over a validated project graph. */
export class RamenAnnotationGraph {
  private readonly annotationsByModel: ReadonlyMap<Id, readonly RamenAnnotation[]>;

  /** Indexes annotations from every reachable model. */
  public constructor(
    private readonly graph: ProjectGraph,
    models: readonly Model[],
  ) {
    this.annotationsByModel = new Map<Id, readonly RamenAnnotation[]>(
      models.map((model: Model): [Id, readonly RamenAnnotation[]] => [model.id, RamenAnnotations.get(model)]),
    );
  }

  /** Returns annotations declared directly by one model. */
  public getDeclared(modelId: Id): readonly RamenAnnotation[] {
    return this.annotationsByModel.get(modelId) ?? [];
  }

  /** Returns all reachable annotation definitions with their owning models. */
  public getAll(): readonly ResolvedRamenAnnotation[] {
    return this.graph.getModels().flatMap((model: Model): ResolvedRamenAnnotation[] =>
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

  /** Returns declarations applicable to a node from the selected model's point of view. */
  public getApplicable(modelId: Id, nodeRef: Ref): readonly ResolvedRamenAnnotation[] {
    const node: ResolvedModelElement<Node> | undefined = this.graph.resolveNode(modelId, nodeRef);
    if (!node) return [];
    const lineage: readonly ResolvedModelElement<Node>[] = [node, ...this.graph.getNodeAncestors(node.modelId, node.element.id)];
    const current: Model | undefined = this.graph.getModel(modelId);
    const models: readonly Model[] = current ? [current, ...this.graph.getTransitiveImports(modelId)] : [];
    const result: ResolvedRamenAnnotation[] = [];

    for (const owner of lineage) {
      for (const model of models) {
        for (const annotation of this.getDeclared(model.id)) {
          const declaredNode: ResolvedModelElement<Node> | undefined = this.graph.resolveNode(model.id, annotation.annotationId);
          if (declaredNode?.modelId !== owner.modelId || declaredNode.element.id !== owner.element.id) continue;
          result.push({ modelId: model.id, annotation: annotation });
        }
      }
    }
    return result;
  }

  /** Returns the effective closed annotation variants available to one Annotation node. */
  public getEffective(modelId: Id, nodeRef: Ref): readonly ResolvedRamenAnnotation[] {
    const result: Map<string, ResolvedRamenAnnotation> = new Map<string, ResolvedRamenAnnotation>();

    for (const candidate of this.getApplicable(modelId, nodeRef)) {
      if (!result.has(candidate.annotation.type)) result.set(candidate.annotation.type, candidate);
    }
    return [...result.values()];
  }

  /** Finds one effective annotation variant by its serialized `type` value. */
  public findEffective(modelId: Id, nodeRef: Ref, type: string): ResolvedRamenAnnotation | undefined {
    return this.getEffective(modelId, nodeRef).find(
      (candidate: ResolvedRamenAnnotation): boolean => candidate.annotation.type === type,
    );
  }

  /** Returns one annotation definition and all definitions it transitively refines, nearest first. */
  public getRefinementLineage(start: ResolvedRamenAnnotation | undefined): readonly ResolvedRamenAnnotation[] {
    const result: ResolvedRamenAnnotation[] = [];
    const visited: Set<string> = new Set<string>();
    let current: ResolvedRamenAnnotation | undefined = start;

    while (current) {
      const key: string = `${current.modelId}:${current.annotation.id}`;

      if (visited.has(key)) break;
      visited.add(key);
      result.push(current);
      current = current.annotation.refines ? this.resolve(current.modelId, current.annotation.refines) : undefined;
    }
    return result;
  }

  /** Reports whether a reachable node is RAMEN Annotation or one of its transitive refinements. */
  public isAnnotationNode(modelId: Id, nodeId: Id): boolean {
    const actual: Node | undefined = this.graph.getNode(modelId, nodeId);
    const expected: Node | undefined = this.graph.getNode(RAMEN_MODEL.id, RAMEN_ELEMENT.ANNOTATION);

    return actual && expected
      ? this.graph.isNodeSameOrSubtype({ modelId: modelId, element: actual }, { modelId: RAMEN_MODEL.id, element: expected })
      : false;
  }
}
