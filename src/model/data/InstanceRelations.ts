import { Bounds, Node, Relation, Id, Ref } from '../Types';
import { ProjectGraph, ResolvedElement } from '../graph/ProjectGraph';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../validation/Diagnostics';
import { ModelInstanceGraph, ModelInstanceRelation, ResolvedInstanceNode, ResolvedInstanceRelation } from './InstanceTypes';
import { ValidationCode } from '../validation/Codes';
import { ConstraintRegistry } from '../validation/Constraints';
import type { ConstraintGraph } from '../validation/Constraints';

/** Validates instance relations, endpoint types, and graph cardinalities. */
export class InstanceRelationValidator {
  private readonly selectedRefs: ReadonlySet<Ref> | undefined;

  /** Creates a relation validator with the supplied constraint languages. */
  public constructor(
    private readonly constraints: ConstraintRegistry,
    private readonly graphContext: ConstraintGraph,
    private readonly selected?: readonly ResolvedElement<Relation>[],
  ) {
    this.selectedRefs = selected
      ? new Set<Ref>(selected.map((item: ResolvedElement<Relation>): Ref => `${item.modelId}:${item.element.id}`))
      : undefined;
  }

  /** Resolves and validates every relation in an instance graph. */
  public validate(
    graph: ProjectGraph,
    instance: ModelInstanceGraph,
    nodesById: ReadonlyMap<Id, ResolvedInstanceNode>,
    diagnostics: Diagnostic[],
  ): readonly ResolvedInstanceRelation[] {
    const ids: Set<Id> = new Set<Id>();
    const result: ResolvedInstanceRelation[] = [];

    instance.relations.forEach((relation: ModelInstanceRelation, index: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root().property('relations').index(index);
      const resolved: ResolvedInstanceRelation | undefined = this.resolveRelation(
        graph,
        graph.getRootModel().id,
        relation,
        path,
        ids,
        nodesById,
        diagnostics,
      );
      if (resolved) result.push(resolved);
    });
    const counts: ReadonlyMap<string, number> = this.relationCounts(graph, result);
    this.validateCardinalities(graph, graph.getRootModel().id, nodesById, counts, diagnostics);
    return result;
  }

  private resolveRelation(
    graph: ProjectGraph,
    ownerModelId: Id,
    relation: ModelInstanceRelation,
    path: DiagnosticPath,
    ids: Set<Id>,
    nodesById: ReadonlyMap<Id, ResolvedInstanceNode>,
    diagnostics: Diagnostic[],
  ): ResolvedInstanceRelation | undefined {
    if (!this.registerId(relation.id, path, ids, diagnostics)) return undefined;
    const type: ResolvedElement<Relation> | undefined = this.resolveType(graph, ownerModelId, relation, path, diagnostics);

    if (!type) return undefined;
    const from: ResolvedInstanceNode | undefined = this.requireNode(
      nodesById,
      relation.fromId,
      'FROM',
      path,
      relation.id,
      diagnostics,
    );
    const to: ResolvedInstanceNode | undefined = this.requireNode(nodesById, relation.toId, 'TO', path, relation.id, diagnostics);

    if (!from || !to) return undefined;
    this.validateEndpoint(graph, type, type.element.from.nodeId, from, path.property('fromId'), diagnostics);
    this.validateEndpoint(graph, type, type.element.to.nodeId, to, path.property('toId'), diagnostics);
    const lineage: readonly ResolvedElement<Relation>[] = [type, ...graph.getRelationAncestors(type.modelId, type.element.id)];
    for (const owner of lineage) this.validateConstraints(owner, relation, from, to, path, diagnostics);
    return { instance: relation, type: type };
  }

  private validateConstraints(
    type: ResolvedElement<Relation>,
    relation: ModelInstanceRelation,
    from: ResolvedInstanceNode,
    to: ResolvedInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    for (const constraint of type.element.constraints ?? []) {
      diagnostics.push(
        ...this.constraints.evaluate(constraint, {
          modelId: type.modelId,
          ownerId: type.element.id,
          instanceId: relation.id,
          target: 'relation',
          value: relation,
          path: path,
          graph: this.graphContext,
        }),
      );
    }
    for (const [end, node, endPath] of [
      [type.element.from, from, path.property('fromId')],
      [type.element.to, to, path.property('toId')],
    ] as const) {
      for (const constraint of end.constraints ?? []) {
        diagnostics.push(
          ...this.constraints.evaluate(constraint, {
            modelId: type.modelId,
            ownerId: end.id,
            instanceId: node.instance.id,
            target: 'relationEnd',
            value: node.instance,
            path: endPath,
            graph: this.graphContext,
          }),
        );
      }
    }
  }

  private registerId(id: Id, path: DiagnosticPath, ids: Set<Id>, diagnostics: Diagnostic[]): boolean {
    if (!ids.has(id)) {
      ids.add(id);

      return true;
    }
    diagnostics.push(this.error('INSTANCE_RELATION_ID_DUPLICATE', `Instance relation id '${id}' is duplicated.`, path, id));
    return false;
  }

  private resolveType(
    graph: ProjectGraph,
    ownerModelId: Id,
    relation: ModelInstanceRelation,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): ResolvedElement<Relation> | undefined {
    const type: ResolvedElement<Relation> | undefined = graph.resolveRelation(ownerModelId, relation.typeId);
    if (type && this.selectedRefs && !this.selectedRefs.has(`${type.modelId}:${type.element.id}`)) {
      diagnostics.push(
        this.error('INSTANCE_RELATION_TYPE_NOT_ALLOWED', 'Relation type is not selected by this model level.', path, relation.id),
      );
      return undefined;
    }
    if (type) return type;
    diagnostics.push(
      this.error(
        'INSTANCE_RELATION_TYPE_NOT_FOUND',
        `Relation type '${relation.typeId}' was not found.`,
        path.property('typeId'),
        relation.id,
      ),
    );
    return undefined;
  }

  private requireNode(
    nodesById: ReadonlyMap<Id, ResolvedInstanceNode>,
    nodeId: Id,
    end: 'FROM' | 'TO',
    path: DiagnosticPath,
    relationId: Id,
    diagnostics: Diagnostic[],
  ): ResolvedInstanceNode | undefined {
    const node: ResolvedInstanceNode | undefined = nodesById.get(nodeId);
    if (node) return node;
    const property: string = end === 'FROM' ? 'fromId' : 'toId';
    const code: ValidationCode = end === 'FROM' ? 'INSTANCE_RELATION_FROM_NOT_FOUND' : 'INSTANCE_RELATION_TO_NOT_FOUND';

    diagnostics.push(this.error(code, `Relation node '${nodeId}' was not found.`, path.property(property), relationId));
    return undefined;
  }

  private validateEndpoint(
    graph: ProjectGraph,
    relationType: ResolvedElement<Relation>,
    requiredRef: Ref,
    actual: ResolvedInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const required: ResolvedElement<Node> | undefined = graph.resolveNode(relationType.modelId, requiredRef);
    if (required && !graph.isNodeSameOrSubtype(actual.type, required)) {
      diagnostics.push(
        this.error(
          'INSTANCE_RELATION_END_TYPE_INVALID',
          `Node '${actual.instance.id}' is incompatible with relation '${relationType.element.name}'.`,
          path,
          actual.instance.id,
        ),
      );
    }
  }

  private validateCardinalities(
    graph: ProjectGraph,
    ownerModelId: Id,
    nodesById: ReadonlyMap<Id, ResolvedInstanceNode>,
    counts: ReadonlyMap<string, number>,
    diagnostics: Diagnostic[],
  ): void {
    const selected: readonly ResolvedElement<Relation>[] =
      this.selected ??
      graph
        .getModels()
        .flatMap((model): ResolvedElement<Relation>[] =>
          model.relations.map((element: Relation): ResolvedElement<Relation> => ({ modelId: model.id, element })),
        );
    const nodes: ReadonlyMap<Ref, readonly ResolvedInstanceNode[]> = this.indexNodeTypes(graph, nodesById);
    for (const item of selected) this.validateTypeCounts(graph, ownerModelId, item, nodes, counts, diagnostics);
  }

  private indexNodeTypes(
    graph: ProjectGraph,
    nodes: ReadonlyMap<Id, ResolvedInstanceNode>,
  ): ReadonlyMap<Ref, readonly ResolvedInstanceNode[]> {
    const indexed: Map<Ref, ResolvedInstanceNode[]> = new Map<Ref, ResolvedInstanceNode[]>();
    for (const node of nodes.values()) {
      const lineage: readonly ResolvedElement<Node>[] = [
        node.type,
        ...graph.getNodeAncestors(node.type.modelId, node.type.element.id),
      ];
      for (const type of lineage) {
        const key: Ref = `${type.modelId}:${type.element.id}`;
        const group: ResolvedInstanceNode[] = indexed.get(key) ?? [];
        group.push(node);
        indexed.set(key, group);
      }
    }
    return indexed;
  }

  private validateTypeCounts(
    graph: ProjectGraph,
    ownerModelId: Id,
    type: ResolvedElement<Relation>,
    nodes: ReadonlyMap<Ref, readonly ResolvedInstanceNode[]>,
    counts: ReadonlyMap<string, number>,
    diagnostics: Diagnostic[],
  ): void {
    const relation: Relation = type.element;
    const ref: Ref = type.modelId === ownerModelId ? relation.id : `${type.modelId}:${relation.id}`;
    for (const direction of ['from', 'to'] as const) {
      const endpoint: ResolvedElement<Node> | undefined = graph.resolveNode(type.modelId, relation[direction].nodeId);
      if (!endpoint) continue;
      const key: Ref = `${endpoint.modelId}:${endpoint.element.id}`;
      const opposite: 'from' | 'to' = direction === 'from' ? 'to' : 'from';
      const bounds: Bounds = relation[opposite].bounds;
      for (const node of nodes.get(key) ?? []) {
        const count: number = counts.get(`${type.modelId}:${relation.id}:${direction}:${node.instance.id}`) ?? 0;
        this.validateCount(relation.name, bounds, count, DiagnosticPath.root().property('relations'), ref, diagnostics);
      }
    }
  }

  private relationCounts(graph: ProjectGraph, relations: readonly ResolvedInstanceRelation[]): ReadonlyMap<string, number> {
    const counts: Map<string, number> = new Map<string, number>();
    for (const relation of relations) {
      const lineage: readonly ResolvedElement<Relation>[] = [
        relation.type,
        ...graph.getRelationAncestors(relation.type.modelId, relation.type.element.id),
      ];
      for (const type of lineage) {
        const prefix: string = `${type.modelId}:${type.element.id}`;
        const from: string = `${prefix}:from:${relation.instance.fromId}`;
        const to: string = `${prefix}:to:${relation.instance.toId}`;
        counts.set(from, (counts.get(from) ?? 0) + 1);
        counts.set(to, (counts.get(to) ?? 0) + 1);
      }
    }
    return counts;
  }

  private validateCount(
    name: string,
    bounds: Bounds,
    count: number,
    path: DiagnosticPath,
    ref: string,
    diagnostics: Diagnostic[],
  ): void {
    if (count < bounds.lowerBound || (bounds.upperBound !== -1 && count > bounds.upperBound)) {
      diagnostics.push(
        this.error(
          'INSTANCE_CARDINALITY_INVALID',
          `Feature '${name}' has ${count} value(s), expected ${bounds.lowerBound}..${bounds.upperBound}.`,
          path,
          ref,
        ),
      );
    }
  }

  private error(code: ValidationCode, message: string, path: DiagnosticPath, ref?: string): Diagnostic {
    return Diagnostics.error({ code: code, message: message, path: path, ref: ref });
  }
}
