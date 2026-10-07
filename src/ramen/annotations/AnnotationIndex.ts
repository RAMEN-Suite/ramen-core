import { ModelRef, ProjectGraph, type ResolvedElement, type Model, type Node, type Id, type Ref } from '../../model';

import { RamenAnnotation } from './Definitions';
import { RamenModelFormat } from '../Document';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../ReferenceModel';

/** Annotation definition resolved together with the model that declares it. */
export interface ResolvedAnnotation {
  readonly modelId: Id;
  readonly annotation: RamenAnnotation;
}

/** Resolves RAMEN annotations and their inheritance over a validated project graph. */
export class AnnotationIndex {
  private readonly annotationsByNode: Map<Ref, ResolvedAnnotation[]> = new Map<Ref, ResolvedAnnotation[]>();
  private readonly annotationsByModel: ReadonlyMap<Id, readonly RamenAnnotation[]>;

  /** Indexes annotations from every reachable model. */
  public constructor(
    private readonly graph: ProjectGraph,
    models: readonly Model[],
  ) {
    this.annotationsByModel = new Map<Id, readonly RamenAnnotation[]>(
      models.map((model: Model): [Id, readonly RamenAnnotation[]] => [
        model.id,
        RamenModelFormat.isDocument(model) ? structuredClone(model.annotations) : [],
      ]),
    );
    for (const definition of this.getAll()) this.indexDefinition(definition);
  }

  private indexDefinition(definition: ResolvedAnnotation): void {
    const node: ResolvedElement<Node> | undefined = this.graph.resolveNode(
      definition.modelId,
      definition.annotation.annotationId,
    );
    if (!node) return;
    const key: Ref = ModelRef.qualify(node.modelId, node.element.id);
    const definitions: ResolvedAnnotation[] = this.annotationsByNode.get(key) ?? [];

    definitions.push(definition);
    this.annotationsByNode.set(key, definitions);
  }

  /** Returns annotations declared directly by one model. */
  public getDeclared(modelId: Id): readonly RamenAnnotation[] {
    return this.annotationsByModel.get(modelId) ?? [];
  }

  /** Returns all reachable annotation definitions with their owning models. */
  public getAll(): readonly ResolvedAnnotation[] {
    return this.graph.getModels().flatMap((model: Model): ResolvedAnnotation[] =>
      this.getDeclared(model.id).map((annotation: RamenAnnotation): ResolvedAnnotation => ({
        modelId: model.id,
        annotation: annotation,
      })),
    );
  }

  /** Returns declarations applicable to a node from the selected model's point of view. */
  public getApplicable(modelId: Id, nodeRef: Ref): readonly ResolvedAnnotation[] {
    const node: ResolvedElement<Node> | undefined = this.graph.resolveNode(modelId, nodeRef);
    if (!node) return [];
    const lineage: readonly ResolvedElement<Node>[] = [node, ...this.graph.getNodeAncestors(node.modelId, node.element.id)];
    const visible: ReadonlySet<Id> = new Set<Id>([
      modelId,
      ...this.graph.getTransitiveImports(modelId).map((model: Model): Id => model.id),
    ]);

    return lineage.flatMap((owner: ResolvedElement<Node>): ResolvedAnnotation[] => {
      const key: Ref = ModelRef.qualify(owner.modelId, owner.element.id);
      return (this.annotationsByNode.get(key) ?? []).filter((definition: ResolvedAnnotation): boolean =>
        visible.has(definition.modelId),
      );
    });
  }

  /** Returns the effective closed annotation variants available to one Annotation node. */
  public getEffective(modelId: Id, nodeRef: Ref): readonly ResolvedAnnotation[] {
    const result: Map<string, ResolvedAnnotation> = new Map<string, ResolvedAnnotation>();

    for (const candidate of this.getApplicable(modelId, nodeRef)) {
      if (!result.has(candidate.annotation.type)) result.set(candidate.annotation.type, candidate);
    }
    return [...result.values()];
  }

  /** Finds one effective annotation variant by its serialised `type` value. */
  public findEffective(modelId: Id, nodeRef: Ref, type: string): ResolvedAnnotation | undefined {
    return this.getEffective(modelId, nodeRef).find(
      (candidate: ResolvedAnnotation): boolean => candidate.annotation.type === type,
    );
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
