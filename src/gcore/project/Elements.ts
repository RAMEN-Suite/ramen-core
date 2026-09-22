import { GDataType, GModel, GNode, GRelation, Id } from '../model/Types';

export class ModelElementIndex {
  public readonly importsByModelId: ReadonlyMap<Id, string>;
  public readonly nodesById: ReadonlyMap<Id, GNode>;
  public readonly dataTypesById: ReadonlyMap<Id, GDataType>;
  public readonly relationsById: ReadonlyMap<Id, GRelation>;

  public constructor(public readonly model: GModel) {
    const imports: Map<Id, string> = new Map<Id, string>();
    for (const imp of this.model.imports) {
      imports.set(imp.modelId, imp.schemaId);
    }

    const nodes: Map<Id, GNode> = new Map<Id, GNode>();
    const dataTypes: Map<Id, GDataType> = new Map<Id, GDataType>();
    for (const classifier of this.model.classifiers) {
      if (classifier.kind === 'GNode') nodes.set(classifier.id, classifier);
      else if (classifier.kind === 'GDataType') dataTypes.set(classifier.id, classifier);
    }

    const relations: Map<Id, GRelation> = new Map<Id, GRelation>();
    for (const relation of this.model.relations) {
      relations.set(relation.id, relation);
    }

    this.importsByModelId = imports;
    this.nodesById = nodes;
    this.dataTypesById = dataTypes;
    this.relationsById = relations;
  }
}
