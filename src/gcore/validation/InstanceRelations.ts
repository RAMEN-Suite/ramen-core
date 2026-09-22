import { Bounds, GNode, GRelation, Id, Ref } from '../model/Types';
import { ProjectGraph, ResolvedModelElement } from '../project/Graph';
import { Diagnostic, DiagnosticPath, Diagnostics } from './Diagnostics';
import { ModelInstance, ModelInstanceRelation, ResolvedInstanceNode, ResolvedInstanceRelation } from './InstanceTypes';
import { ValidationCode } from './Codes';

/** Validates instance relations, endpoint types, and graph cardinalities. */
export class InstanceRelationValidator {
  /** Resolves and validates every relation in an instance graph. */
  public validate(
    graph: ProjectGraph,
    instance: ModelInstance,
    nodesById: ReadonlyMap<Id, ResolvedInstanceNode>,
    diagnostics: Diagnostic[],
  ): readonly ResolvedInstanceRelation[] {
    const ids: Set<Id> = new Set<Id>();
    const result: ResolvedInstanceRelation[] = [];
    instance.relations.forEach((relation: ModelInstanceRelation, index: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root().property('relations').index(index);
      const resolved: ResolvedInstanceRelation | undefined = this.resolveRelation(
        graph,
        instance.modelId,
        relation,
        path,
        ids,
        nodesById,
        diagnostics,
      );
      if (resolved) result.push(resolved);
    });
    this.validateRelationCardinalities(graph, instance.modelId, nodesById, result, diagnostics);
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
    if (!this.registerRelationId(relation.id, path, ids, diagnostics)) return undefined;
    const type: ResolvedModelElement<GRelation> | undefined = this.resolveRelationType(
      graph,
      ownerModelId,
      relation,
      path,
      diagnostics,
    );
    if (!type) return undefined;
    const from: ResolvedInstanceNode | undefined = this.requireInstanceNode(
      nodesById,
      relation.fromId,
      'FROM',
      path,
      relation.id,
      diagnostics,
    );
    const to: ResolvedInstanceNode | undefined = this.requireInstanceNode(
      nodesById,
      relation.toId,
      'TO',
      path,
      relation.id,
      diagnostics,
    );
    if (!from || !to) return undefined;
    this.validateRelationEndpoint(graph, type, type.element.from.nodeId, from, path.property('fromId'), diagnostics);
    this.validateRelationEndpoint(graph, type, type.element.to.nodeId, to, path.property('toId'), diagnostics);
    return { instance: relation, type: type };
  }

  private registerRelationId(id: Id, path: DiagnosticPath, ids: Set<Id>, diagnostics: Diagnostic[]): boolean {
    if (!ids.has(id)) {
      ids.add(id);
      return true;
    }
    diagnostics.push(this.error('INSTANCE_RELATION_ID_DUPLICATE', `Instance relation id '${id}' is duplicated.`, path, id));
    return false;
  }

  private resolveRelationType(
    graph: ProjectGraph,
    ownerModelId: Id,
    relation: ModelInstanceRelation,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): ResolvedModelElement<GRelation> | undefined {
    const type: ResolvedModelElement<GRelation> | undefined = graph.resolveRelation(ownerModelId, relation.typeId);
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

  private requireInstanceNode(
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

  private validateRelationEndpoint(
    graph: ProjectGraph,
    relationType: ResolvedModelElement<GRelation>,
    requiredRef: Ref,
    actual: ResolvedInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const required: ResolvedModelElement<GNode> | undefined = graph.resolveNode(relationType.modelId, requiredRef);
    if (required && !this.isSameOrSubtype(graph, actual.type, required)) {
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

  private validateRelationCardinalities(
    graph: ProjectGraph,
    ownerModelId: Id,
    nodesById: ReadonlyMap<Id, ResolvedInstanceNode>,
    relations: readonly ResolvedInstanceRelation[],
    diagnostics: Diagnostic[],
  ): void {
    for (const model of graph.getModels()) {
      for (const relation of model.relations) {
        this.validateRelationTypeCardinalities(graph, ownerModelId, model.id, relation, nodesById, relations, diagnostics);
      }
    }
  }

  private validateRelationTypeCardinalities(
    graph: ProjectGraph,
    ownerModelId: Id,
    relationModelId: Id,
    relation: GRelation,
    nodesById: ReadonlyMap<Id, ResolvedInstanceNode>,
    relations: readonly ResolvedInstanceRelation[],
    diagnostics: Diagnostic[],
  ): void {
    const relationRef: Ref = relationModelId === ownerModelId ? relation.id : `${relationModelId}:${relation.id}`;
    for (const node of nodesById.values()) {
      const acceptsFrom: boolean = this.acceptsNode(graph, relationModelId, relation.from.nodeId, node.type);
      const acceptsTo: boolean = this.acceptsNode(graph, relationModelId, relation.to.nodeId, node.type);
      if (acceptsFrom) {
        const count: number = this.countRelations(graph, relations, node.instance.id, 'from', relationModelId, relation.id);
        this.validateCount(
          relation.to.role,
          relation.to.bounds,
          count,
          DiagnosticPath.root().property('relations'),
          relationRef,
          diagnostics,
        );
      }
      if (acceptsTo) {
        const count: number = this.countRelations(graph, relations, node.instance.id, 'to', relationModelId, relation.id);
        this.validateCount(
          relation.from.role,
          relation.from.bounds,
          count,
          DiagnosticPath.root().property('relations'),
          relationRef,
          diagnostics,
        );
      }
    }
  }

  private countRelations(
    graph: ProjectGraph,
    relations: readonly ResolvedInstanceRelation[],
    nodeId: Id,
    end: 'from' | 'to',
    modelId: Id,
    relationId: Id,
  ): number {
    return relations.filter((item: ResolvedInstanceRelation): boolean => {
      const matchesNode: boolean = end === 'from' ? item.instance.fromId === nodeId : item.instance.toId === nodeId;
      return matchesNode && this.isRelationType(graph, item.type, modelId, relationId);
    }).length;
  }

  private acceptsNode(graph: ProjectGraph, relationModelId: Id, requiredRef: Ref, actual: ResolvedModelElement<GNode>): boolean {
    const required: ResolvedModelElement<GNode> | undefined = graph.resolveNode(relationModelId, requiredRef);
    return required ? this.isSameOrSubtype(graph, actual, required) : false;
  }

  private isSameOrSubtype(
    graph: ProjectGraph,
    actual: ResolvedModelElement<GNode>,
    expected: ResolvedModelElement<GNode>,
  ): boolean {
    if (actual.modelId === expected.modelId && actual.element.id === expected.element.id) return true;
    return graph
      .getNodeAncestors(actual.modelId, actual.element.id)
      .some(
        (ancestor: ResolvedModelElement<GNode>): boolean =>
          ancestor.modelId === expected.modelId && ancestor.element.id === expected.element.id,
      );
  }

  private isRelationType(graph: ProjectGraph, type: ResolvedModelElement<GRelation>, modelId: Id, relationId: Id): boolean {
    if (type.modelId === modelId && type.element.id === relationId) return true;
    return graph
      .getRelationAncestors(type.modelId, type.element.id)
      .some(
        (ancestor: ResolvedModelElement<GRelation>): boolean =>
          ancestor.modelId === modelId && ancestor.element.id === relationId,
      );
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
