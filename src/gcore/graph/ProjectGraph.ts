import { GDataType, GModel, GNode, GRelation, Id, Ref } from '../model/ModelTypes';
import { ModelElementIndex } from './ModelElementIndex';
import { ModelRef, QualifiedParts } from './ModelRef';

interface ResolvedRef {
  readonly modelId: Id;
  readonly elementId: Id;
}

export interface ResolvedModelElement<T> {
  readonly modelId: Id;
  readonly element: T;
}

export class ProjectGraph {
  public constructor(
    private readonly rootModelId: Id,
    private readonly modelsById: ReadonlyMap<Id, GModel>,
    private readonly indexesByModelId: ReadonlyMap<Id, ModelElementIndex>,
  ) {}

  public getRootModel(): GModel {
    return this.requireModel(this.rootModelId);
  }

  public getModel(modelId: Id): GModel | undefined {
    return this.modelsById.get(modelId);
  }

  public getModels(): readonly GModel[] {
    return [...this.modelsById.values()];
  }

  public getImportedModels(modelId: Id): readonly GModel[] {
    const model: GModel = this.requireModel(modelId);
    return model.imports.flatMap((modelImport) => {
      const imported: GModel | undefined = this.modelsById.get(modelImport.modelId);
      return imported ? [imported] : [];
    });
  }

  public getNode(modelId: Id, nodeId: Id): GNode | undefined {
    return this.indexesByModelId.get(modelId)?.nodesById.get(nodeId);
  }

  public getDataType(modelId: Id, dataTypeId: Id): GDataType | undefined {
    return this.indexesByModelId.get(modelId)?.dataTypesById.get(dataTypeId);
  }

  public getRelation(modelId: Id, relationId: Id): GRelation | undefined {
    return this.indexesByModelId.get(modelId)?.relationsById.get(relationId);
  }

  public resolveNode(ownerModelId: Id, reference: Ref): ResolvedModelElement<GNode> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const node: GNode | undefined = this.getNode(target.modelId, target.elementId);
    return node ? { modelId: target.modelId, element: node } : undefined;
  }

  public resolveDataType(ownerModelId: Id, reference: Ref): ResolvedModelElement<GDataType> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const dataType: GDataType | undefined = this.getDataType(target.modelId, target.elementId);
    return dataType ? { modelId: target.modelId, element: dataType } : undefined;
  }

  public resolveRelation(ownerModelId: Id, reference: Ref): ResolvedModelElement<GRelation> | undefined {
    const target: ResolvedRef = this.resolveModelRef(ownerModelId, reference);
    const relation: GRelation | undefined = this.getRelation(target.modelId, target.elementId);
    return relation ? { modelId: target.modelId, element: relation } : undefined;
  }

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
