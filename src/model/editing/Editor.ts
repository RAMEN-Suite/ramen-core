import { ModelDescriptions } from '../Descriptions.js';
import { Attribute, Classifier, DataType, Model, Node, Relation, Id } from '../Types.js';

/** Editable node fields. */
export type UpdateNodeInput = Partial<Pick<Node, 'name' | 'description' | 'superTypes' | 'constraints' | 'ext'>>;
/** Editable data type fields. */
export type UpdateDataTypeInput = Partial<
  Pick<DataType, 'name' | 'description' | 'baseType' | 'literals' | 'constraints' | 'ext'>
>;
/** Editable relation fields. */
export type UpdateRelationInput = Partial<Pick<Relation, 'name' | 'description' | 'from' | 'to' | 'constraints' | 'ext'>>;
/** Editable attribute fields. */
export type UpdateAttributeInput = Partial<Omit<Attribute, 'id'>>;

/** Applies immutable editing operations to an existing RMF model. */
export class ModelEditor {
  /** Returns a model with the classifier appended. */
  public static addClassifier(model: Model, classifier: Classifier): Model {
    return { ...model, classifiers: [...model.classifiers, ModelDescriptions.copy(classifier)] };
  }

  /** Returns a model without the classifier, or throws when it does not exist. */
  public static removeClassifierById(model: Model, classifierId: string): Model {
    const classifiers: Classifier[] = model.classifiers;
    const filtered: Classifier[] = classifiers.filter((c: Classifier): boolean => c.id !== classifierId);

    if (filtered.length === classifiers.length) throw new Error(`Classifier not found: ${classifierId}`);
    return { ...model, classifiers: filtered };
  }

  /**
   * Applies a partial update to a node without mutating the source model.
   * @throws When the local node does not exist.
   */
  public static updateNode(model: Model, nodeId: string, patch: UpdateNodeInput): Model {
    const classifiers: Classifier[] = model.classifiers;
    let found: boolean = false;

    const patched: Classifier[] = classifiers.map((classifier: Classifier): Classifier => {
      if (classifier.kind !== 'Node') return classifier;
      if (classifier.id !== nodeId) return classifier;

      found = true;
      return ModelDescriptions.copy({ ...classifier, ...structuredClone(patch) });
    });

    if (!found) throw new Error(`Node not found: ${nodeId}`);
    return { ...model, classifiers: patched };
  }

  /**
   * Applies a partial update to a data type without mutating the source model.
   * @throws When the local data type does not exist.
   */
  public static updateDataType(model: Model, dataTypeId: string, patch: UpdateDataTypeInput): Model {
    const classifiers: Classifier[] = model.classifiers;
    let found: boolean = false;

    const patched: Classifier[] = classifiers.map((collection: Classifier): Classifier => {
      if (collection.kind !== 'DataType') return collection;
      if (collection.id !== dataTypeId) return collection;

      found = true;
      return ModelDescriptions.copy({ ...collection, ...structuredClone(patch) });
    });

    if (!found) throw new Error(`DataType not found: ${dataTypeId}`);
    return { ...model, classifiers: patched };
  }

  /** Returns a model with the relation appended. */
  public static addRelation(model: Model, relation: Relation): Model {
    return { ...model, relations: [...model.relations, ModelDescriptions.copy(relation)] };
  }

  /**
   * Applies a partial update to a relation without mutating the source model.
   * @throws When the local relation does not exist.
   */
  public static updateRelation(model: Model, relationId: string, patch: UpdateRelationInput): Model {
    const relations: Relation[] = model.relations;
    let found: boolean = false;

    const patched: Relation[] = relations.map((relation: Relation): Relation => {
      if (relation.id !== relationId) return relation;
      found = true;
      return ModelDescriptions.copy({ ...relation, ...structuredClone(patch) });
    });

    if (!found) throw new Error(`Relation not found: ${relationId}`);
    return { ...model, relations: patched };
  }

  /** Adds an attribute; project-wide semantic conflicts are reported by `ModelValidator`. */
  public static addAttribute(model: Model, nodeId: Id, attribute: Attribute): Model {
    const node: Node = this.requireNode(model, nodeId);
    return this.replaceNode(model, { ...node, attributes: [...node.attributes, ModelDescriptions.copy(attribute)] });
  }

  /**
   * Updates an attribute; project-wide semantic conflicts are reported by `ModelValidator`.
   * @throws When the local node or attribute does not exist.
   */
  public static updateAttribute(model: Model, nodeId: Id, attributeId: Id, patch: UpdateAttributeInput): Model {
    const node: Node = this.requireNode(model, nodeId);
    const current: Attribute | undefined = node.attributes.find((attribute: Attribute): boolean => attribute.id === attributeId);

    if (!current) throw new Error(`Attribute not found: '${attributeId}'`);
    const attributes: Attribute[] = node.attributes.map((attribute: Attribute): Attribute => {
      if (attribute.id !== attributeId) return attribute;
      return ModelDescriptions.copy({ ...attribute, ...structuredClone(patch) });
    });
    return this.replaceNode(model, { ...node, attributes });
  }

  /**
   * Removes a named attribute from a node without mutating the source model.
   * @throws When the local node or attribute does not exist.
   */
  public static removeAttribute(model: Model, nodeId: Id, attributeId: Id): Model {
    const node: Node = this.requireNode(model, nodeId);
    const attributes: Attribute[] = node.attributes.filter((attribute: Attribute): boolean => attribute.id !== attributeId);

    if (attributes.length === node.attributes.length) throw new Error(`Attribute not found: '${attributeId}'`);
    return this.replaceNode(model, { ...node, attributes });
  }

  private static requireNode(model: Model, nodeId: Id): Node {
    const classifier: Classifier | undefined = model.classifiers.find(
      (item: Classifier): boolean => item.id === nodeId && item.kind === 'Node',
    );

    if (classifier?.kind !== 'Node') throw new Error(`Node not found: '${nodeId}'`);
    return classifier;
  }

  private static replaceNode(model: Model, node: Node): Model {
    const classifiers: Classifier[] = model.classifiers.map((item: Classifier): Classifier =>
      item.id === node.id && item.kind === 'Node' ? node : item,
    );
    return { ...model, classifiers };
  }
}
