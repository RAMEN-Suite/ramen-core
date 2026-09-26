import { BuiltinDataTypes } from '../Builtins';
import { ModelRef } from './References';
import { Attribute, Constraint, Node, Relation, Id } from '../Types';
import { ProjectGraph, ResolvedElement } from './ProjectGraph';

/** Node together with the features inherited through its complete refinement chain. */
export interface EffectiveNode {
  readonly modelId: Id;
  readonly node: Node;
  readonly lineage: readonly ResolvedElement<Node>[];
  readonly attributes: readonly Attribute[];
  readonly constraints: readonly Constraint[];
}

/** Relation that applies to a node directly or through one of its supertypes. */
export interface ApplicableRelation {
  readonly modelId: Id;
  readonly relation: Relation;
}

/** Computes inherited views without changing the source models in a project graph. */
export class EffectiveModel {
  /** Resolves a node and merges its inherited attributes and constraints in base-first order. */
  public static resolveNode(graph: ProjectGraph, modelId: Id, nodeId: Id): EffectiveNode | undefined {
    const node: Node | undefined = graph.getNode(modelId, nodeId);
    if (!node) return undefined;
    const ancestors: readonly ResolvedElement<Node>[] = graph.getNodeAncestors(modelId, nodeId);
    const baseFirstAncestors: ResolvedElement<Node>[] = [...ancestors].reverse();
    const lineage: readonly ResolvedElement<Node>[] = [...baseFirstAncestors, { modelId: modelId, element: node }];
    const attributesByName: Map<string, Attribute> = new Map<string, Attribute>();
    const constraints: Constraint[] = [];

    for (const item of lineage) {
      for (const attribute of item.element.attributes) {
        const typeId: string =
          item.modelId === modelId || BuiltinDataTypes.isBuiltin(attribute.typeId) || ModelRef.isQualified(attribute.typeId)
            ? attribute.typeId
            : ModelRef.qualify(item.modelId, attribute.typeId);
        attributesByName.set(attribute.name, { ...attribute, typeId });
      }
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
      effective.lineage.map((item: ResolvedElement<Node>): string => `${item.modelId}:${item.element.id}`),
    );
    const result: ApplicableRelation[] = [];

    for (const model of graph.getModels()) {
      for (const relation of model.relations) {
        const from: ResolvedElement<Node> | undefined = graph.resolveNode(model.id, relation.from.nodeId);
        const to: ResolvedElement<Node> | undefined = graph.resolveNode(model.id, relation.to.nodeId);
        const matchesFrom: boolean = from ? acceptedNodes.has(`${from.modelId}:${from.element.id}`) : false;
        const matchesTo: boolean = to ? acceptedNodes.has(`${to.modelId}:${to.element.id}`) : false;

        if (matchesFrom || matchesTo) result.push({ modelId: model.id, relation: relation });
      }
    }
    return result;
  }
}
