import { GDataType, GModel, GNode, GRelation, Id } from '../model/Types';
import { ModelElementIndex } from './Elements';
import { QualifiedParts, ModelRef } from './Refs';
import { NodeInheritance, ResolvedNode } from './Inheritance';
import { ImportClosure } from './Imports';

export type Direction = 'OUT' | 'IN';
export interface SelectableRelation {
  readonly baseRelationId: Id;
  readonly relationName: string;
  readonly roleName: string;
  readonly direction: Direction;
}

export class ModelQueries {
  public static listNodes(model: GModel): readonly GNode[] {
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);
    const nodes: GNode[] = Array.from(modelIndex.nodesById.values());
    return nodes.sort((a: GNode, b: GNode): number => a.name.localeCompare(b.name));
  }

  public static listNodeChain(
    startModelId: string,
    startNodeId: string,
    modelsById: ReadonlyMap<Id, GModel>,
  ): readonly ResolvedNode[] {
    try {
      return NodeInheritance.resolveSuperTypeChain(startModelId, startNodeId, modelsById);
    } catch (error: unknown) {
      console.error(error);
      return [];
    }
  }

  public static listGroupedNodesByBaseId(base: GModel, model: GModel): ReadonlyMap<Id, readonly GNode[]> {
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);
    const groupedNodes: Map<Id, GNode[]> = new Map<Id, GNode[]>();

    for (const node of modelIndex.nodesById.values()) {
      const superType: QualifiedParts | null = NodeInheritance.resolveLocalSuperType(node.superTypes, base.id);
      if (!superType) continue;

      const refId: Id = superType.refId;
      const list: GNode[] | undefined = groupedNodes.get(refId);

      if (list) list.push(node);
      else groupedNodes.set(refId, [node]);
    }

    for (const [baseNodeId, list] of groupedNodes.entries()) {
      groupedNodes.set(
        baseNodeId,
        list.sort((a: GNode, b: GNode): number => a.name.localeCompare(b.name)),
      );
    }
    return groupedNodes;
  }

  public static listRelations(model: GModel): readonly GRelation[] {
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);
    const relations: GRelation[] = Array.from(modelIndex.relationsById.values());
    return relations.sort((a: GRelation, b: GRelation): number => a.name.localeCompare(b.name));
  }

  public static listSelectableRelations(base: GModel, model: GModel, nodeId: Id): readonly SelectableRelation[] {
    const baseIndex: ModelElementIndex = new ModelElementIndex(base);
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);

    const node: GNode | undefined = modelIndex.nodesById.get(nodeId);
    if (!node) return [];

    const superType: QualifiedParts | null = NodeInheritance.resolveLocalSuperType(node.superTypes, base.id);
    if (!superType) return [];

    const baseNodeId: Id = superType.refId;
    const relations: SelectableRelation[] = [];

    for (const relation of baseIndex.relationsById.values()) {
      if (relation.from.nodeId === baseNodeId) {
        relations.push({
          baseRelationId: relation.id,
          relationName: relation.name,
          direction: 'OUT',
          roleName: relation.to.role,
        });
      }

      if (relation.to.nodeId === baseNodeId) {
        relations.push({
          baseRelationId: relation.id,
          relationName: relation.name,
          direction: 'IN',
          roleName: relation.from.role,
        });
      }
    }

    return relations.sort((a: SelectableRelation, b: SelectableRelation): number => a.relationName.localeCompare(b.relationName));
  }

  public static listRelationRoles(model: GModel, nodeId: Id): ReadonlySet<string> {
    const roles: Set<string> = new Set<string>();

    for (const relation of model.relations ?? []) {
      if (relation.from.nodeId === nodeId) roles.add(relation.to.role);
      if (relation.to.nodeId === nodeId) roles.add(relation.from.role);
    }

    return roles;
  }

  public static listRelationFromNodes(base: GModel, model: GModel, baseRelationId: Id): readonly GNode[] {
    const baseIndex: ModelElementIndex = new ModelElementIndex(base);
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);

    const baseRelation: GRelation | undefined = baseIndex.relationsById.get(baseRelationId);
    if (!baseRelation) return [];

    const expectedFromBaseId: Id = baseRelation.from.nodeId;
    const allowed: GNode[] = [];

    for (const node of modelIndex.nodesById.values()) {
      const superType: QualifiedParts | null = NodeInheritance.resolveLocalSuperType(node.superTypes, base.id);
      if (!superType) continue;
      if (superType.refId === expectedFromBaseId) allowed.push(node);
    }

    return allowed.sort((a: GNode, b: GNode): number => a.name.localeCompare(b.name));
  }

  public static listRelationToNodes(base: GModel, model: GModel, baseRelationId: Id): readonly GNode[] {
    const baseIndex: ModelElementIndex = new ModelElementIndex(base);
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);

    const baseRelation: GRelation | undefined = baseIndex.relationsById.get(baseRelationId);
    if (!baseRelation) return [];

    const expectedToBaseId: Id = baseRelation.to.nodeId;
    const allowed: GNode[] = [];

    for (const node of modelIndex.nodesById.values()) {
      const superType: QualifiedParts | null = NodeInheritance.resolveLocalSuperType(node.superTypes, base.id);
      if (!superType) continue;
      if (superType.refId === expectedToBaseId) allowed.push(node);
    }

    return allowed.sort((a: GNode, b: GNode): number => a.name.localeCompare(b.name));
  }

  public static listDataTypes(model: GModel): readonly GDataType[] {
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);
    const types: GDataType[] = Array.from(modelIndex.dataTypesById.values());
    return types.sort((a: GDataType, b: GDataType): number => a.name.localeCompare(b.name));
  }

  public static listGlobalDataTypes(model: GModel, modelsById: ReadonlyMap<Id, GModel>): readonly GDataType[] {
    const closures: readonly GModel[] = ImportClosure.resolveImports(model.id, modelsById);
    const modelIndex: ModelElementIndex = new ModelElementIndex(model);
    const available: GDataType[] = [...modelIndex.dataTypesById.values()];

    for (const closure of closures) {
      if (closure.id === model.id) continue;

      const index: ModelElementIndex = new ModelElementIndex(closure);
      for (const dataType of index.dataTypesById.values()) {
        available.push({ ...dataType, id: ModelRef.qualify(closure.id, dataType.id) });
      }
    }
    return available.sort((a: GDataType, b: GDataType): number => a.name.localeCompare(b.name));
  }
}
