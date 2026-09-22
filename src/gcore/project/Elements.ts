import { GDataType, GModel, GNode, GRelation, Id } from '../model/Types';

/**
 * Builds constant-time lookup tables for the elements owned by one model.
 *
 * The index does not resolve imports or inheritance. ProjectGraph combines
 * one index per model to resolve references across a complete project.
 */
export class ModelElementIndex {
  /** Imports keyed by imported model identifier. */
  public readonly importsByModelId: ReadonlyMap<Id, string>;
  /** Nodes declared by this model, keyed by element identifier. */
  public readonly nodesById: ReadonlyMap<Id, GNode>;
  /** Data types declared by this model, keyed by element identifier. */
  public readonly dataTypesById: ReadonlyMap<Id, GDataType>;
  /** Relations declared by this model, keyed by element identifier. */
  public readonly relationsById: ReadonlyMap<Id, GRelation>;

  /** Indexes the supplied model without modifying it. */
  public constructor(public readonly model: GModel) {
    const imports: Map<Id, string> = new Map<Id, string>();
    for (const imp of this.model.imports) {
      imports.set(imp.modelId, imp.modelUri);
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
