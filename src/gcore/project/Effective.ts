import { GAttribute, GConstraint, GNode, GRelation, Id } from '../model/Types';
import { ProjectGraph, ResolvedModelElement } from './Graph';

/** Node together with the features inherited through its complete refinement chain. */
export interface EffectiveNode {
  readonly modelId: Id;
  readonly node: GNode;
  readonly lineage: readonly ResolvedModelElement<GNode>[];
  readonly attributes: readonly GAttribute[];
  readonly constraints: readonly GConstraint[];
}

/** Relation that applies to a node directly or through one of its supertypes. */
export interface ApplicableRelation {
  readonly modelId: Id;
  readonly relation: GRelation;
}

/** Computes inherited views without changing the source models in a project graph. */
export class EffectiveModel {
  /** Resolves a node and merges its inherited attributes and constraints in base-first order. */
  public static resolveNode(graph: ProjectGraph, modelId: Id, nodeId: Id): EffectiveNode | undefined {
    const node: GNode | undefined = graph.getNode(modelId, nodeId);
    if (!node) return undefined;

    const ancestors: readonly ResolvedModelElement<GNode>[] = graph.getNodeAncestors(modelId, nodeId);
    const baseFirstAncestors: ResolvedModelElement<GNode>[] = [...ancestors].reverse();
    const lineage: readonly ResolvedModelElement<GNode>[] = [...baseFirstAncestors, { modelId: modelId, element: node }];
    const attributesByName: Map<string, GAttribute> = new Map<string, GAttribute>();
    const constraints: GConstraint[] = [];

    for (const item of lineage) {
      for (const attribute of item.element.attributes) attributesByName.set(attribute.name, attribute);
      constraints.push(...(item.element.constraints ?? []));
    }

    return {
      modelId: modelId,
      node: node,
      lineage: lineage,
      attributes: [...attributesByName.values()],
      constraints: constraints,
    };
  }

  /** Returns relations whose source or target accepts the node or one of its supertypes. */
  public static getApplicableRelations(graph: ProjectGraph, modelId: Id, nodeId: Id): readonly ApplicableRelation[] {
    const effective: EffectiveNode | undefined = this.resolveNode(graph, modelId, nodeId);
    if (!effective) return [];

    const acceptedNodes: Set<string> = new Set<string>(
      effective.lineage.map((item: ResolvedModelElement<GNode>): string => `${item.modelId}:${item.element.id}`),
    );
    const result: ApplicableRelation[] = [];

    for (const model of graph.getModels()) {
      for (const relation of model.relations) {
        const from: ResolvedModelElement<GNode> | undefined = graph.resolveNode(model.id, relation.from.nodeId);
        const to: ResolvedModelElement<GNode> | undefined = graph.resolveNode(model.id, relation.to.nodeId);
        const matchesFrom: boolean = from ? acceptedNodes.has(`${from.modelId}:${from.element.id}`) : false;
        const matchesTo: boolean = to ? acceptedNodes.has(`${to.modelId}:${to.element.id}`) : false;
        if (matchesFrom || matchesTo) result.push({ modelId: model.id, relation: relation });
      }
    }

    return result;
  }
}
