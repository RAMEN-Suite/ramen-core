import { GAttribute, GModel, GNode, Id, Ref } from '../model/Types';
import { QualifiedParts, ModelRef } from './Refs';
import { ModelElementIndex } from './Elements';

/** Node paired with the identifier of its owning model. */
export interface ResolvedNode {
  readonly modelId: Id;
  readonly node: GNode;
}

/** Resolves node refinement chains and their inherited attributes. */
export class NodeInheritance {
  /** Returns the single qualified supertype in the requested base model. */
  public static resolveLocalSuperType(superTypes: readonly Ref[], baseModelId: Id): QualifiedParts | null {
    if (superTypes.length !== 1) return null;

    const ref: Ref | undefined = superTypes[0];
    if (ref === undefined) return null;
    if (!ModelRef.isQualified(ref)) return null;

    const parts: QualifiedParts = ModelRef.splitQualified(ref);
    if (parts.modelId !== baseModelId) return null;

    return parts;
  }

  /** Returns a node's transitive supertypes in base-first order. */
  public static resolveSuperTypeChain(
    startModelId: Id,
    startNodeId: Id,
    modelsById: ReadonlyMap<Id, GModel>,
  ): readonly ResolvedNode[] {
    const superTypeChain: ResolvedNode[] = [];
    const visitedNode: Set<string> = new Set<string>();

    let currentModelId: Id = startModelId;
    let currentNodeId: Id = startNodeId;

    while (true) {
      const visitKey: string = `${currentModelId}:${currentNodeId}`;
      if (visitedNode.has(visitKey)) throw Error(`Cyclic superType chain detected at '${visitKey}'`);
      visitedNode.add(visitKey);

      const currentModel: GModel | undefined = modelsById.get(currentModelId);
      if (!currentModel) break;

      const currentIndex: ModelElementIndex = new ModelElementIndex(currentModel);
      const currentNode: GNode | undefined = currentIndex.nodesById.get(currentNodeId);
      if (!currentNode) break;

      superTypeChain.push({ modelId: currentModelId, node: currentNode });

      const superTypes: readonly Ref[] = currentNode.superTypes;
      if (superTypes.length === 0 || !superTypes[0]) break;
      if (superTypes.length !== 1) throw Error(`Invalid superTypes for '${currentNodeId}' expected(1).`);
      const superType: Ref = superTypes[0];

      if (ModelRef.isQualified(superType)) {
        const parts: QualifiedParts = ModelRef.splitQualified(superType);
        currentModelId = parts.modelId;
        currentNodeId = parts.refId;
      } else currentNodeId = superType;
    }

    return superTypeChain.slice(1).reverse();
  }

  /** Returns the names of local and inherited attributes. */
  public static resolveAttributeNames(
    startModelId: Id,
    startNodeId: Id,
    modelsById: ReadonlyMap<Id, GModel>,
  ): ReadonlySet<string> {
    const attributeNames: Set<string> = new Set<string>();
    const startModel: GModel | undefined = modelsById.get(startModelId);

    if (startModel) {
      const index: ModelElementIndex = new ModelElementIndex(startModel);
      const node: GNode | undefined = index.nodesById.get(startNodeId);
      if (node) for (const attribute of node.attributes ?? []) attributeNames.add(attribute.name);
    }

    const inherited: ReadonlySet<string> = this.resolveInheritedAttributeNames(startModelId, startNodeId, modelsById);
    for (const name of inherited) attributeNames.add(name);
    return attributeNames;
  }

  /** Returns only the names inherited from transitive supertypes. */
  public static resolveInheritedAttributeNames(
    startModelId: Id,
    startNodeId: Id,
    modelsById: ReadonlyMap<Id, GModel>,
  ): ReadonlySet<string> {
    const attributeNames: Set<string> = new Set<string>();
    const chain: readonly ResolvedNode[] = this.resolveSuperTypeChain(startModelId, startNodeId, modelsById);

    for (const item of chain) {
      const attributes: readonly GAttribute[] = item.node.attributes ?? [];

      for (const attribute of attributes) {
        attributeNames.add(attribute.name);
      }
    }

    return attributeNames;
  }
}
