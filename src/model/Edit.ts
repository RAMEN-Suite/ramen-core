import { Attribute, Classifier, DataType, Model, Node, Relation, Id } from './Types';

/** Editable node fields. */
export type UpdateNodeInput = Partial<Pick<Node, 'name' | 'superTypes' | 'attributes'>>;
/** Editable data type fields. */
export type UpdateDataTypeInput = Partial<Pick<DataType, 'name' | 'baseType' | 'literals'>>;
/** Editable relation fields. */
export type UpdateRelationInput = Partial<Pick<Relation, 'name' | 'from' | 'to'>>;
/** Editable attribute fields. */
export type UpdateAttributeInput = Partial<Attribute>;

/** Applies immutable editing operations to an existing RAMEN model. */
export class ModelEditor {
  /** Returns a model with the classifier appended. */
  public static addClassifier(model: Model, classifier: Classifier): Model {
    return { ...model, classifiers: [...(model.classifiers ?? []), classifier] };
  }

  /** Returns a model without the classifier, or throws when it does not exist. */
  public static removeClassifierById(model: Model, classifierId: string): Model {
    const classifiers: Classifier[] = model.classifiers ?? [];
    const filtered: Classifier[] = classifiers.filter((c: Classifier): boolean => c.id !== classifierId);
    if (filtered.length === classifiers.length) throw new Error(`Classifier not found: ${classifierId}`);
    return { ...model, classifiers: filtered };
  }

  /** Applies a partial update to a node without mutating the source model. */
  public static updateNode(model: Model, nodeId: string, patch: UpdateNodeInput): Model {
    const classifiers: Classifier[] = model.classifiers ?? [];
    let found: boolean = false;

    const patched: Classifier[] = classifiers.map((classifier: Classifier): Classifier => {
      if (classifier.kind !== 'Node') return classifier;
      if (classifier.id !== nodeId) return classifier;

      found = true;
      return { ...classifier, ...patch };
    });
    if (!found) throw new Error(`Node not found: ${nodeId}`);
    return { ...model, classifiers: patched };
  }

  /** Removes a node and every local relation connected to it. */
  public static removeNode(model: Model, nodeId: string): Model {
    let newModel: Model = ModelEditor.removeClassifierById(model, nodeId);
    const relations: Relation[] = newModel.relations;
    const remainingRelations: Relation[] = relations.filter((relation: Relation): boolean => {
      const fromId: Id = relation.from.nodeId;
      const toId: Id = relation.to.nodeId;
      return fromId !== nodeId && toId !== nodeId;
    });
    if (remainingRelations.length !== relations.length) newModel = { ...newModel, relations: remainingRelations };
    return newModel;
  }

  /** Applies a partial update to a data type without mutating the source model. */
  public static updateDataType(model: Model, dataTypeId: string, patch: UpdateDataTypeInput): Model {
    const classifiers: Classifier[] = model.classifiers ?? [];
    let found: boolean = false;

    const patched: Classifier[] = classifiers.map((collection: Classifier): Classifier => {
      if (collection.kind !== 'DataType') return collection;
      if (collection.id !== dataTypeId) return collection;

      found = true;
      return { ...collection, ...patch };
    });
    if (!found) throw new Error(`DataType not found: ${dataTypeId}`);
    return { ...model, classifiers: patched };
  }

  /** Returns a model with the relation appended. */
  public static addRelation(model: Model, relation: Relation): Model {
    return { ...model, relations: [...(model.relations ?? []), relation] };
  }

  /** Applies a partial update to a relation without mutating the source model. */
  public static updateRelation(model: Model, relationId: string, patch: UpdateRelationInput): Model {
    const relations: Relation[] = model.relations ?? [];
    let found: boolean = false;

    const patched: Relation[] = relations.map((relation: Relation): Relation => {
      if (relation.id !== relationId) return relation;
      found = true;
      return { ...relation, ...patch };
    });
    if (!found) throw new Error(`Relation not found: ${relationId}`);
    return { ...model, relations: patched };
  }

  /** Returns a model without the relation, or throws when it does not exist. */
  public static removeRelationById(model: Model, relationId: string): Model {
    const relations: Relation[] = model.relations ?? [];
    const filtered: Relation[] = relations.filter((relation: Relation): boolean => relation.id !== relationId);

    if (filtered.length === relations.length) throw new Error(`Relation not found: ${relationId}`);
    return { ...model, relations: filtered };
  }

  /** Adds an attribute; project-wide semantic conflicts are reported by `ModelValidator`. */
  public static addAttribute(model: Model, nodeId: Id, attribute: Attribute): Model {
    const classifiers: readonly Classifier[] = model.classifiers ?? [];
    let foundNode: boolean = false;

    const patched: Classifier[] = classifiers.map((classifier: Classifier): Classifier => {
      if (classifier.kind !== 'Node') return classifier;
      if (classifier.id !== nodeId) return classifier;

      foundNode = true;
      const node: Node = classifier;
      const attributes: readonly Attribute[] = node.attributes ?? [];
      return { ...node, attributes: [...attributes, attribute] };
    });
    if (!foundNode) throw new Error(`Node not found: '${nodeId}'`);
    return { ...model, classifiers: patched };
  }

  /** Updates an attribute; project-wide semantic conflicts are reported by `ModelValidator`. */
  public static updateAttribute(model: Model, nodeId: Id, name: string, patch: UpdateAttributeInput): Model {
    const newName: string = patch.name ?? name;
    const classifiers: readonly Classifier[] = model.classifiers ?? [];
    let foundNode: boolean = false;
    let foundAttribute: boolean = false;

    const patched: Classifier[] = classifiers.map((classifier: Classifier): Classifier => {
      if (classifier.kind !== 'Node') return classifier;
      if (classifier.id !== nodeId) return classifier;

      foundNode = true;
      const node: Node = classifier;
      const attributes: readonly Attribute[] = node.attributes ?? [];

      const nextAttributes: Attribute[] = attributes.map((attribute: Attribute): Attribute => {
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
  public static removeAttribute(model: Model, nodeId: Id, name: string): Model {
    const classifiers: readonly Classifier[] = model.classifiers ?? [];
    let foundNode: boolean = false;
    let removed: boolean = false;

    const patched: Classifier[] = classifiers.map((classifier: Classifier): Classifier => {
      if (classifier.kind !== 'Node') return classifier;
      if (classifier.id !== nodeId) return classifier;

      foundNode = true;
      const node: Node = classifier;
      const attributes: readonly Attribute[] = node.attributes ?? [];
      const filtered: Attribute[] = attributes.filter((attribute: Attribute): boolean => attribute.name !== name);

      if (filtered.length !== attributes.length) removed = true;
      return removed ? { ...node, attributes: filtered } : node;
    });
    if (!foundNode) throw new Error(`Node not found: '${nodeId}'`);
    if (!removed) throw new Error(`Attribute not found: '${name}'`);
    return { ...model, classifiers: patched };
  }
}
