import { GAttribute, GClassifier, GDataType, GModel, GNode, GRelation, Id } from './Types';

/** Editable node fields. */
export type UpdateNodeInput = Partial<Pick<GNode, 'name' | 'superTypes' | 'attributes'>>;
/** Editable data type fields. */
export type UpdateDataTypeInput = Partial<Pick<GDataType, 'name' | 'baseType' | 'literals'>>;
/** Editable relation fields. */
export type UpdateRelationInput = Partial<Pick<GRelation, 'name' | 'from' | 'to'>>;
/** Editable attribute fields. */
export type UpdateAttributeInput = Partial<GAttribute>;

/** Applies immutable editing operations to an existing GCore model. */
export class ModelEditor {
  /** Returns a model with the classifier appended. */
  public static addClassifier(model: GModel, classifier: GClassifier): GModel {
    return { ...model, classifiers: [...(model.classifiers ?? []), classifier] };
  }

  /** Returns a model without the classifier, or throws when it does not exist. */
  public static removeClassifierById(model: GModel, classifierId: string): GModel {
    const classifiers: GClassifier[] = model.classifiers ?? [];

    const filtered: GClassifier[] = classifiers.filter((c: GClassifier): boolean => c.id !== classifierId);
    if (filtered.length === classifiers.length) throw new Error(`Classifier not found: ${classifierId}`);
    return { ...model, classifiers: filtered };
  }

  /** Applies a partial update to a node without mutating the source model. */
  public static updateNode(model: GModel, nodeId: string, patch: UpdateNodeInput): GModel {
    const classifiers: GClassifier[] = model.classifiers ?? [];
    let found: boolean = false;

    const patched: GClassifier[] = classifiers.map((classifier: GClassifier): GClassifier => {
      if (classifier.kind !== 'GNode') return classifier;
      if (classifier.id !== nodeId) return classifier;

      found = true;
      return { ...classifier, ...patch };
    });

    if (!found) throw new Error(`Node not found: ${nodeId}`);
    return { ...model, classifiers: patched };
  }

  /** Removes a node and every local relation connected to it. */
  public static removeNode(model: GModel, nodeId: string): GModel {
    let newModel: GModel = ModelEditor.removeClassifierById(model, nodeId);

    const relations: GRelation[] = newModel.relations;
    const remainingRelations: GRelation[] = relations.filter((relation: GRelation): boolean => {
      const fromId: Id = relation.from.nodeId;
      const toId: Id = relation.to.nodeId;
      return fromId !== nodeId && toId !== nodeId;
    });

    if (remainingRelations.length !== relations.length) newModel = { ...newModel, relations: remainingRelations };
    return newModel;
  }

  /** Applies a partial update to a data type without mutating the source model. */
  public static updateDataType(model: GModel, dataTypeId: string, patch: UpdateDataTypeInput): GModel {
    const classifiers: GClassifier[] = model.classifiers ?? [];
    let found: boolean = false;

    const patched: GClassifier[] = classifiers.map((collection: GClassifier): GClassifier => {
      if (collection.kind !== 'GDataType') return collection;
      if (collection.id !== dataTypeId) return collection;

      found = true;
      return { ...collection, ...patch };
    });

    if (!found) throw new Error(`DataType not found: ${dataTypeId}`);
    return { ...model, classifiers: patched };
  }

  /** Returns a model with the relation appended. */
  public static addRelation(model: GModel, relation: GRelation): GModel {
    return { ...model, relations: [...(model.relations ?? []), relation] };
  }

  /** Applies a partial update to a relation without mutating the source model. */
  public static updateRelation(model: GModel, relationId: string, patch: UpdateRelationInput): GModel {
    const relations: GRelation[] = model.relations ?? [];
    let found: boolean = false;

    const patched: GRelation[] = relations.map((relation: GRelation): GRelation => {
      if (relation.id !== relationId) return relation;

      found = true;
      return { ...relation, ...patch };
    });

    if (!found) throw new Error(`Relation not found: ${relationId}`);
    return { ...model, relations: patched };
  }

  /** Returns a model without the relation, or throws when it does not exist. */
  public static removeRelationById(model: GModel, relationId: string): GModel {
    const relations: GRelation[] = model.relations ?? [];
    const filtered: GRelation[] = relations.filter((relation: GRelation): boolean => relation.id !== relationId);
    if (filtered.length === relations.length) throw new Error(`Relation not found: ${relationId}`);
    return { ...model, relations: filtered };
  }

  /** Adds an attribute; project-wide semantic conflicts are reported by `ModelValidator`. */
  public static addAttribute(model: GModel, nodeId: Id, attribute: GAttribute): GModel {
    const classifiers: readonly GClassifier[] = model.classifiers ?? [];
    let foundNode: boolean = false;

    const patched: GClassifier[] = classifiers.map((classifier: GClassifier): GClassifier => {
      if (classifier.kind !== 'GNode') return classifier;
      if (classifier.id !== nodeId) return classifier;

      foundNode = true;
      const node: GNode = classifier;
      const attributes: readonly GAttribute[] = node.attributes ?? [];
      return { ...node, attributes: [...attributes, attribute] };
    });

    if (!foundNode) throw new Error(`Node not found: '${nodeId}'`);
    return { ...model, classifiers: patched };
  }

  /** Updates an attribute; project-wide semantic conflicts are reported by `ModelValidator`. */
  public static updateAttribute(model: GModel, nodeId: Id, name: string, patch: UpdateAttributeInput): GModel {
    const newName: string = patch.name ?? name;

    const classifiers: readonly GClassifier[] = model.classifiers ?? [];
    let foundNode: boolean = false;
    let foundAttribute: boolean = false;

    const patched: GClassifier[] = classifiers.map((classifier: GClassifier): GClassifier => {
      if (classifier.kind !== 'GNode') return classifier;
      if (classifier.id !== nodeId) return classifier;

      foundNode = true;
      const node: GNode = classifier;
      const attributes: readonly GAttribute[] = node.attributes ?? [];

      const nextAttributes: GAttribute[] = attributes.map((attribute: GAttribute): GAttribute => {
        if (attribute.name !== name) return attribute;
        foundAttribute = true;
        return { ...attribute, ...patch, name: newName };
      });

      return foundAttribute ? { ...node, attributes: nextAttributes } : node;
    });

    if (!foundNode) throw new Error(`Node not found: '${nodeId}'`);
    if (!foundAttribute) throw new Error(`Attribute not found: '${name}'`);
    return { ...model, classifiers: patched };
  }

  /** Removes a named attribute from a node without mutating the source model. */
  public static removeAttribute(model: GModel, nodeId: Id, name: string): GModel {
    const classifiers: readonly GClassifier[] = model.classifiers ?? [];
    let foundNode: boolean = false;
    let removed: boolean = false;

    const patched: GClassifier[] = classifiers.map((classifier: GClassifier): GClassifier => {
      if (classifier.kind !== 'GNode') return classifier;
      if (classifier.id !== nodeId) return classifier;

      foundNode = true;

      const node: GNode = classifier;
      const attributes: readonly GAttribute[] = node.attributes ?? [];
      const filtered: GAttribute[] = attributes.filter((attribute: GAttribute): boolean => attribute.name !== name);

      if (filtered.length !== attributes.length) removed = true;
      return removed ? { ...node, attributes: filtered } : node;
    });

    if (!foundNode) throw new Error(`Node not found: '${nodeId}'`);
    if (!removed) throw new Error(`Attribute not found: '${name}'`);
    return { ...model, classifiers: patched };
  }
}
