import { DataType, Model, Node, Relation, Id, Ref } from '../Types';
import { ModelElementIndex } from './ElementIndex';
import { ModelRef, QualifiedParts } from './References';

interface ResolvedRef {
  readonly modelId: Id;
  readonly elementId: Id;
}

/** Model element resolved together with the model that owns it. */
export interface ResolvedModelElement<T> {
  readonly modelId: Id;
  readonly element: T;
}

/** Read-only resolved view of all models in one RAMEN model project. */
export class ProjectGraph {
  private readonly importCache: Map<Id, readonly Model[]> = new Map<Id, readonly Model[]>();
  private readonly nodeAncestorCache: Map<Ref, readonly ResolvedModelElement<Node>[]> = new Map<
    Ref,
    readonly ResolvedModelElement<Node>[]
  >();
  private readonly relationAncestorCache: Map<Ref, readonly ResolvedModelElement<Relation>[]> = new Map<
    Ref,
    readonly ResolvedModelElement<Relation>[]
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

  /** Returns only the selected model's transitive imports, nearest imports first. */
  public getTransitiveImports(modelId: Id): readonly Model[] {
    const cached: readonly Model[] | undefined = this.importCache.get(modelId);
    if (cached) return cached;
    const result: Model[] = [];
    const visited: Set<Id> = new Set<Id>();

    const visit: (ownerId: Id) => void = (ownerId: Id): void => {
      for (const imported of this.getImportedModels(ownerId)) {
        if (visited.has(imported.id)) continue;
        visited.add(imported.id);
        result.push(imported);
        visit(imported.id);
      }
    };

    visit(modelId);
    const imports: readonly Model[] = Object.freeze(result);
    this.importCache.set(modelId, imports);
    return imports;
  }

  /** Returns node types declared by the selected model and its transitive imports. */
  public getAvailableNodes(modelId: Id): readonly ResolvedModelElement<Node>[] {
    const current: Model | undefined = this.getModel(modelId);
    const models: readonly Model[] = current ? [current, ...this.getTransitiveImports(modelId)] : [];

    return models.flatMap((model: Model): ResolvedModelElement<Node>[] =>
      model.classifiers.flatMap((classifier): ResolvedModelElement<Node>[] =>
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
  public resolveNode(ownerModelId: Id, reference: Ref): ResolvedModelElement<Node> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const node: Node | undefined = this.getNode(target.modelId, target.elementId);
    return node ? { modelId: target.modelId, element: node } : undefined;
  }

  /** Resolves a local or qualified data type reference from its owning model. */
  public resolveDataType(ownerModelId: Id, reference: Ref): ResolvedModelElement<DataType> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const dataType: DataType | undefined = this.getDataType(target.modelId, target.elementId);
    return dataType ? { modelId: target.modelId, element: dataType } : undefined;
  }

  /** Resolves a local or qualified relation reference from its owning model. */
  public resolveRelation(ownerModelId: Id, reference: Ref): ResolvedModelElement<Relation> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const relation: Relation | undefined = this.getRelation(target.modelId, target.elementId);
    return relation ? { modelId: target.modelId, element: relation } : undefined;
  }

  /** Returns all resolvable transitive supertypes of a node in breadth-first order. */
  public getNodeAncestors(modelId: Id, nodeId: Id): readonly ResolvedModelElement<Node>[] {
    const key: Ref = ModelRef.qualify(modelId, nodeId);
    const cached: readonly ResolvedModelElement<Node>[] | undefined = this.nodeAncestorCache.get(key);
    if (cached) return cached;
    const ancestors: readonly ResolvedModelElement<Node>[] = this.collectAncestors(
      this.getNode(modelId, nodeId)?.superTypes ?? [],
      modelId,
      (ownerId: Id, ref: Ref): ResolvedModelElement<Node> | undefined => this.resolveNode(ownerId, ref),
    );
    this.nodeAncestorCache.set(key, ancestors);
    return ancestors;
  }

  /** Returns all resolvable transitive supertypes of a relation in nearest-first order. */
  public getRelationAncestors(modelId: Id, relationId: Id): readonly ResolvedModelElement<Relation>[] {
    const key: Ref = ModelRef.qualify(modelId, relationId);
    const cached: readonly ResolvedModelElement<Relation>[] | undefined = this.relationAncestorCache.get(key);
    if (cached) return cached;
    const ancestors: readonly ResolvedModelElement<Relation>[] = this.collectAncestors(
      this.getRelation(modelId, relationId)?.superTypes ?? [],
      modelId,
      (ownerId: Id, ref: Ref): ResolvedModelElement<Relation> | undefined => this.resolveRelation(ownerId, ref),
    );
    this.relationAncestorCache.set(key, ancestors);
    return ancestors;
  }

  private collectAncestors<T extends Node | Relation>(
    initial: readonly Ref[],
    modelId: Id,
    resolve: (ownerId: Id, ref: Ref) => ResolvedModelElement<T> | undefined,
  ): readonly ResolvedModelElement<T>[] {
    const queue: ResolvedModelElement<T>[] = [];
    const visited: Set<Ref> = new Set<Ref>();
    const append: (ownerId: Id, ref: Ref) => void = (ownerId: Id, ref: Ref): void => {
      const item: ResolvedModelElement<T> | undefined = resolve(ownerId, ref);
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
  public isNodeSameOrSubtype(actual: ResolvedModelElement<Node>, expected: ResolvedModelElement<Node>): boolean {
    if (actual.modelId === expected.modelId && actual.element.id === expected.element.id) return true;
    return this.getNodeAncestors(actual.modelId, actual.element.id).some(
      (ancestor: ResolvedModelElement<Node>): boolean =>
        ancestor.modelId === expected.modelId && ancestor.element.id === expected.element.id,
    );
  }

  /** Reports whether an actual relation is the expected relation or one of its transitive refinements. */
  public isRelationSameOrSubtype(actual: ResolvedModelElement<Relation>, expected: ResolvedModelElement<Relation>): boolean {
    if (actual.modelId === expected.modelId && actual.element.id === expected.element.id) return true;
    return this.getRelationAncestors(actual.modelId, actual.element.id).some(
      (ancestor: ResolvedModelElement<Relation>): boolean =>
        ancestor.modelId === expected.modelId && ancestor.element.id === expected.element.id,
    );
  }

  /** Reports whether an actual node satisfies a local or qualified expected node reference. */
  public acceptsNode(ownerModelId: Id, expectedRef: Ref, actual: ResolvedModelElement<Node>): boolean {
    const expected: ResolvedModelElement<Node> | undefined = this.resolveNode(ownerModelId, expectedRef);
    return expected ? this.isNodeSameOrSubtype(actual, expected) : false;
  }

  /** Compares two local or qualified relation references including transitive refinement. */
  public isRelationRefSameOrSubtype(actualOwnerModelId: Id, actualRef: Ref, expectedOwnerModelId: Id, expectedRef: Ref): boolean {
    const actual: ResolvedModelElement<Relation> | undefined = this.resolveRelation(actualOwnerModelId, actualRef);
    const expected: ResolvedModelElement<Relation> | undefined = this.resolveRelation(expectedOwnerModelId, expectedRef);
    return actual && expected ? this.isRelationSameOrSubtype(actual, expected) : false;
  }

  /** Reports whether a model is reachable from the graph root. */
  public hasModel(modelId: Id): boolean {
    return this.modelsById.has(modelId);
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
