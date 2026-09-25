import { DataType, Model, Node, Relation, Id, Ref } from '../Types';
import { ModelElementIndex } from './Elements';
import { ModelRef, QualifiedParts } from './Refs';

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
    return result;
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
    const result: ResolvedModelElement<Node>[] = [];
    const visited: Set<string> = new Set<string>();
    const queue: ResolvedModelElement<Node>[] = [];
    const start: Node | undefined = this.getNode(modelId, nodeId);

    if (!start) return result;
    for (const superType of start.superTypes) {
      const resolved: ResolvedModelElement<Node> | undefined = this.resolveNode(modelId, superType);

      if (resolved) queue.push(resolved);
    }
    while (queue.length > 0) {
      const current: ResolvedModelElement<Node> | undefined = queue.shift();

      if (!current) break;
      const key: string = `${current.modelId}:${current.element.id}`;
      if (visited.has(key)) continue;
      visited.add(key);
      result.push(current);

      for (const superType of current.element.superTypes) {
        const resolved: ResolvedModelElement<Node> | undefined = this.resolveNode(current.modelId, superType);

        if (resolved) queue.push(resolved);
      }
    }
    return result;
  }

  /** Returns all resolvable transitive supertypes of a relation in nearest-first order. */
  public getRelationAncestors(modelId: Id, relationId: Id): readonly ResolvedModelElement<Relation>[] {
    const result: ResolvedModelElement<Relation>[] = [];
    const visited: Set<string> = new Set<string>();
    let current: ResolvedModelElement<Relation> | undefined;
    const relation: Relation | undefined = this.getRelation(modelId, relationId);
    const superType: Ref | undefined = relation?.superTypes[0];

    if (superType) current = this.resolveRelation(modelId, superType);
    while (current) {
      const key: string = `${current.modelId}:${current.element.id}`;

      if (visited.has(key)) break;
      visited.add(key);
      result.push(current);

      const nextRef: Ref | undefined = current.element.superTypes[0];
      current = nextRef ? this.resolveRelation(current.modelId, nextRef) : undefined;
    }
    return result;
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
