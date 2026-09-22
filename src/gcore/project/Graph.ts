import { GDataType, GModel, GNode, GRelation, Id, Ref } from '../model/Types';
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

/** Read-only resolved view of all models in one GCore project. */
export class ProjectGraph {
  /** @internal */
  public constructor(
    private readonly rootModelId: Id,
    private readonly modelsById: ReadonlyMap<Id, GModel>,
    private readonly indexesByModelId: ReadonlyMap<Id, ModelElementIndex>,
  ) {}

  /** Returns the graph's designated root model. */
  public getRootModel(): GModel {
    return this.requireModel(this.rootModelId);
  }

  /** Returns a reachable model by identifier. */
  public getModel(modelId: Id): GModel | undefined {
    return this.modelsById.get(modelId);
  }

  /** Returns all reachable models in deterministic traversal order. */
  public getModels(): readonly GModel[] {
    return [...this.modelsById.values()];
  }

  /** Returns the models directly imported by the selected model. */
  public getImportedModels(modelId: Id): readonly GModel[] {
    const model: GModel = this.requireModel(modelId);
    return model.imports.flatMap((modelImport) => {
      const imported: GModel | undefined = this.modelsById.get(modelImport.modelId);
      return imported ? [imported] : [];
    });
  }

  /** Looks up a node owned by a specific model. */
  public getNode(modelId: Id, nodeId: Id): GNode | undefined {
    return this.indexesByModelId.get(modelId)?.nodesById.get(nodeId);
  }

  /** Looks up a data type owned by a specific model. */
  public getDataType(modelId: Id, dataTypeId: Id): GDataType | undefined {
    return this.indexesByModelId.get(modelId)?.dataTypesById.get(dataTypeId);
  }

  /** Looks up a relation owned by a specific model. */
  public getRelation(modelId: Id, relationId: Id): GRelation | undefined {
    return this.indexesByModelId.get(modelId)?.relationsById.get(relationId);
  }

  /** Resolves a local or qualified node reference from its owning model. */
  public resolveNode(ownerModelId: Id, reference: Ref): ResolvedModelElement<GNode> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const node: GNode | undefined = this.getNode(target.modelId, target.elementId);
    return node ? { modelId: target.modelId, element: node } : undefined;
  }

  /** Resolves a local or qualified data type reference from its owning model. */
  public resolveDataType(ownerModelId: Id, reference: Ref): ResolvedModelElement<GDataType> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const dataType: GDataType | undefined = this.getDataType(target.modelId, target.elementId);
    return dataType ? { modelId: target.modelId, element: dataType } : undefined;
  }

  /** Resolves a local or qualified relation reference from its owning model. */
  public resolveRelation(ownerModelId: Id, reference: Ref): ResolvedModelElement<GRelation> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const relation: GRelation | undefined = this.getRelation(target.modelId, target.elementId);
    return relation ? { modelId: target.modelId, element: relation } : undefined;
  }

  /** Returns all resolvable transitive supertypes of a node in breadth-first order. */
  public getNodeAncestors(modelId: Id, nodeId: Id): readonly ResolvedModelElement<GNode>[] {
    const result: ResolvedModelElement<GNode>[] = [];
    const visited: Set<string> = new Set<string>();
    const queue: ResolvedModelElement<GNode>[] = [];
    const start: GNode | undefined = this.getNode(modelId, nodeId);
    if (!start) return result;

    for (const superType of start.superTypes) {
      const resolved: ResolvedModelElement<GNode> | undefined = this.resolveNode(modelId, superType);
      if (resolved) queue.push(resolved);
    }

    while (queue.length > 0) {
      const current: ResolvedModelElement<GNode> | undefined = queue.shift();
      if (!current) break;
      const key: string = `${current.modelId}:${current.element.id}`;
      if (visited.has(key)) continue;
      visited.add(key);
      result.push(current);

      for (const superType of current.element.superTypes) {
        const resolved: ResolvedModelElement<GNode> | undefined = this.resolveNode(current.modelId, superType);
        if (resolved) queue.push(resolved);
      }
    }

    return result;
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

  private requireModel(modelId: Id): GModel {
    const model: GModel | undefined = this.modelsById.get(modelId);
    if (!model) throw new Error(`Model not found in project graph: '${modelId}'`);
    return model;
  }
}
