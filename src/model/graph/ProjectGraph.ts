import { DataType, Model, Node, Relation, Id, Ref } from '../Types.js';
import { ModelElementIndex } from './ElementIndex.js';
import { ModelRef, QualifiedParts } from './References.js';

interface ResolvedRef {
  readonly modelId: Id;
  readonly elementId: Id;
}

/** Model element resolved together with the model that owns it. */
export interface ResolvedElement<T> {
  readonly modelId: Id;
  readonly element: T;
}

/** Read-only resolved view of all models in one RMF project. */
export class ProjectGraph {
  private readonly visibleModels: Map<Id, ReadonlySet<Id>> = new Map<Id, ReadonlySet<Id>>();
  private readonly importCache: Map<Id, readonly Model[]> = new Map<Id, readonly Model[]>();
  private readonly nodeAncestorCache: Map<Ref, readonly ResolvedElement<Node>[]> = new Map<
    Ref,
    readonly ResolvedElement<Node>[]
  >();
  private readonly relationAncestorCache: Map<Ref, readonly ResolvedElement<Relation>[]> = new Map<
    Ref,
    readonly ResolvedElement<Relation>[]
  >();

  /** @internal */
  public constructor(
    private readonly rootModelId: Id,
    private readonly modelsById: ReadonlyMap<Id, Model>,
    private readonly indexesByModelId: ReadonlyMap<Id, ModelElementIndex>,
  ) {}

  /** Returns the graph's designated root model. */
  public getRootModel(): Model {
    return this.requireModel(this.rootModelId);
  }

  /** Returns a reachable model by identifier. */
  public getModel(modelId: Id): Model | undefined {
    return this.modelsById.get(modelId);
  }

  /** Returns all reachable models in deterministic traversal order. */
  public getModels(): readonly Model[] {
    return [...this.modelsById.values()];
  }

  /** Returns the models directly imported by the selected model. */
  public getImportedModels(modelId: Id): readonly Model[] {
    const model: Model = this.requireModel(modelId);
    return model.imports.flatMap((modelImport) => {
      const imported: Model | undefined = this.modelsById.get(modelImport.modelId);
      return imported ? [imported] : [];
    });
  }

  /** Returns transitive imports in stable depth-first order, without duplicates. */
  public getTransitiveImports(modelId: Id): readonly Model[] {
    const cached: readonly Model[] | undefined = this.importCache.get(modelId);
    if (cached) return cached;
    const result: Model[] = [];
    const visited: Set<Id> = new Set<Id>();

    const pending: Model[] = [...this.getImportedModels(modelId)].reverse();

    while (pending.length > 0) {
      const imported: Model | undefined = pending.pop();
      if (!imported || visited.has(imported.id)) continue;
      visited.add(imported.id);
      result.push(imported);
      pending.push(...[...this.getImportedModels(imported.id)].reverse());
    }

    const imports: readonly Model[] = Object.freeze(result);
    this.importCache.set(modelId, imports);
    return imports;
  }

  /** Returns node types declared by the selected model and its transitive imports. */
  public getAvailableNodes(modelId: Id): readonly ResolvedElement<Node>[] {
    const current: Model | undefined = this.getModel(modelId);
    const models: readonly Model[] = current ? [current, ...this.getTransitiveImports(modelId)] : [];

    return models.flatMap((model: Model): ResolvedElement<Node>[] =>
      model.classifiers.flatMap((classifier): ResolvedElement<Node>[] =>
        classifier.kind === 'Node' ? [{ modelId: model.id, element: classifier }] : [],
      ),
    );
  }

  /** Looks up a node owned by a specific model. */
  public getNode(modelId: Id, nodeId: Id): Node | undefined {
    return this.indexesByModelId.get(modelId)?.nodesById.get(nodeId);
  }

  /** Looks up a data type owned by a specific model. */
  public getDataType(modelId: Id, dataTypeId: Id): DataType | undefined {
    return this.indexesByModelId.get(modelId)?.dataTypesById.get(dataTypeId);
  }

  /** Looks up a relation owned by a specific model. */
  public getRelation(modelId: Id, relationId: Id): Relation | undefined {
    return this.indexesByModelId.get(modelId)?.relationsById.get(relationId);
  }

  /** Resolves a local or qualified node reference from its owning model. */
  public resolveNode(ownerModelId: Id, reference: Ref): ResolvedElement<Node> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    if (!this.isVisible(ownerModelId, target.modelId)) return undefined;
    const node: Node | undefined = this.getNode(target.modelId, target.elementId);
    return node ? { modelId: target.modelId, element: node } : undefined;
  }

  /** Resolves a local or qualified data type reference from its owning model. */
  public resolveDataType(ownerModelId: Id, reference: Ref): ResolvedElement<DataType> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    if (!this.isVisible(ownerModelId, target.modelId)) return undefined;
    const dataType: DataType | undefined = this.getDataType(target.modelId, target.elementId);
    return dataType ? { modelId: target.modelId, element: dataType } : undefined;
  }

  /** Resolves a local or qualified relation reference from its owning model. */
  public resolveRelation(ownerModelId: Id, reference: Ref): ResolvedElement<Relation> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    if (!this.isVisible(ownerModelId, target.modelId)) return undefined;
    const relation: Relation | undefined = this.getRelation(target.modelId, target.elementId);
    return relation ? { modelId: target.modelId, element: relation } : undefined;
  }

  /** Returns all resolvable transitive supertypes of a node in breadth-first order. */
  public getNodeAncestors(modelId: Id, nodeId: Id): readonly ResolvedElement<Node>[] {
    const key: Ref = ModelRef.qualify(modelId, nodeId);
    const cached: readonly ResolvedElement<Node>[] | undefined = this.nodeAncestorCache.get(key);
    if (cached) return cached;
    const ancestors: readonly ResolvedElement<Node>[] = this.collectAncestors(
      this.getNode(modelId, nodeId)?.superTypes ?? [],
      modelId,
      (ownerId: Id, ref: Ref): ResolvedElement<Node> | undefined => this.resolveNode(ownerId, ref),
    );

    this.nodeAncestorCache.set(key, ancestors);
    return ancestors;
  }

  /** Returns all resolvable transitive supertypes of a relation in nearest-first order. */
  public getRelationAncestors(modelId: Id, relationId: Id): readonly ResolvedElement<Relation>[] {
    const key: Ref = ModelRef.qualify(modelId, relationId);
    const cached: readonly ResolvedElement<Relation>[] | undefined = this.relationAncestorCache.get(key);
    if (cached) return cached;
    const ancestors: readonly ResolvedElement<Relation>[] = this.collectAncestors(
      this.getRelation(modelId, relationId)?.superTypes ?? [],
      modelId,
      (ownerId: Id, ref: Ref): ResolvedElement<Relation> | undefined => this.resolveRelation(ownerId, ref),
    );

    this.relationAncestorCache.set(key, ancestors);
    return ancestors;
  }

  private collectAncestors<T extends Node | Relation>(
    initial: readonly Ref[],
    modelId: Id,
    resolve: (ownerId: Id, ref: Ref) => ResolvedElement<T> | undefined,
  ): readonly ResolvedElement<T>[] {
    const queue: ResolvedElement<T>[] = [];
    const visited: Set<Ref> = new Set<Ref>();
    const append: (ownerId: Id, ref: Ref) => void = (ownerId: Id, ref: Ref): void => {
      const item: ResolvedElement<T> | undefined = resolve(ownerId, ref);
      if (!item) return;
      const key: Ref = ModelRef.qualify(item.modelId, item.element.id);
      if (visited.has(key)) return;
      visited.add(key);
      queue.push(Object.freeze(item));
    };
    initial.forEach((ref: Ref): void => append(modelId, ref));
    for (const item of queue) {
      item.element.superTypes.forEach((ref: Ref): void => append(item.modelId, ref));
    }
    return Object.freeze(queue);
  }

  /** Reports whether an actual node is the expected node or one of its transitive refinements. */
  public isNodeSameOrSubtype(actual: ResolvedElement<Node>, expected: ResolvedElement<Node>): boolean {
    if (actual.modelId === expected.modelId && actual.element.id === expected.element.id) return true;
    return this.getNodeAncestors(actual.modelId, actual.element.id).some(
      (ancestor: ResolvedElement<Node>): boolean =>
        ancestor.modelId === expected.modelId && ancestor.element.id === expected.element.id,
    );
  }

  /** Reports whether an actual relation is the expected relation or one of its transitive refinements. */
  public isRelationSameOrSubtype(actual: ResolvedElement<Relation>, expected: ResolvedElement<Relation>): boolean {
    if (actual.modelId === expected.modelId && actual.element.id === expected.element.id) return true;
    return this.getRelationAncestors(actual.modelId, actual.element.id).some(
      (ancestor: ResolvedElement<Relation>): boolean =>
        ancestor.modelId === expected.modelId && ancestor.element.id === expected.element.id,
    );
  }

  /** Reports whether an actual node satisfies a local or qualified expected node reference. */
  public acceptsNode(ownerModelId: Id, expectedRef: Ref, actual: ResolvedElement<Node>): boolean {
    const expected: ResolvedElement<Node> | undefined = this.resolveNode(ownerModelId, expectedRef);
    return expected ? this.isNodeSameOrSubtype(actual, expected) : false;
  }

  /** Compares two local or qualified relation references including transitive refinement. */
  public isRelationRefSameOrSubtype(actualOwnerModelId: Id, actualRef: Ref, expectedOwnerModelId: Id, expectedRef: Ref): boolean {
    const actual: ResolvedElement<Relation> | undefined = this.resolveRelation(actualOwnerModelId, actualRef);
    const expected: ResolvedElement<Relation> | undefined = this.resolveRelation(expectedOwnerModelId, expectedRef);
    return actual && expected ? this.isRelationSameOrSubtype(actual, expected) : false;
  }

  /** Reports whether a model is reachable from the graph root. */
  public hasModel(modelId: Id): boolean {
    return this.modelsById.has(modelId);
  }

  private isVisible(ownerId: Id, targetId: Id): boolean {
    if (!this.hasModel(ownerId)) return false;
    if (ownerId === targetId) return true;
    let visible: ReadonlySet<Id> | undefined = this.visibleModels.get(ownerId);
    if (!visible) {
      visible = new Set<Id>(this.getTransitiveImports(ownerId).map((model: Model): Id => model.id));
      this.visibleModels.set(ownerId, visible);
    }
    return visible.has(targetId);
  }

  private resolveModelRef(ownerModelId: Id, reference: Ref): ResolvedRef {
    if (!ModelRef.isQualified(reference)) return { modelId: ownerModelId, elementId: reference };
    const parts: QualifiedParts = ModelRef.splitQualified(reference);
    return { modelId: parts.modelId, elementId: parts.refId };
  }

  private requireModel(modelId: Id): Model {
    const model: Model | undefined = this.modelsById.get(modelId);
    if (!model) throw new Error(`Model not found in project graph: '${modelId}'`);
    return model;
  }
}
