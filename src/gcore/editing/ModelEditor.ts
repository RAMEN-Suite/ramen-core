import { GAttribute, GClassifier, GDataType, GModel, GNode, GRelation, Id } from '../model/ModelTypes';
import { NodeInheritanceResolver } from '../resolution/NodeInheritanceResolver';
import { RelationDefinitionResolver } from '../resolution/RelationDefinitionResolver';

export type UpdateNodeInput = Partial<Pick<GNode, 'name' | 'superTypes' | 'attributes'>>;
export type UpdateDataTypeInput = Partial<Pick<GDataType, 'name' | 'literals'>>;
export type UpdateRelationInput = Partial<Pick<GRelation, 'name' | 'from' | 'to'>>;
export type UpdateAttributeInput = Partial<GAttribute>;

export class ModelEditor {
  public static addClassifier(model: GModel, classifier: GClassifier): GModel {
    return { ...model, classifiers: [...(model.classifiers ?? []), classifier] };
  }

  public static removeClassifierById(model: GModel, classifierId: string): GModel {
    const classifiers: GClassifier[] = model.classifiers ?? [];

    const filtered: GClassifier[] = classifiers.filter((c: GClassifier): boolean => c.id !== classifierId);
    if (filtered.length === classifiers.length) throw new Error(`Classifier not found: ${classifierId}`);
    return { ...model, classifiers: filtered };
  }

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

  public static addRelation(model: GModel, relation: GRelation): GModel {
    return { ...model, relations: [...(model.relations ?? []), relation] };
  }

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

  public static removeRelationById(model: GModel, relationId: string): GModel {
    const relations: GRelation[] = model.relations ?? [];
    const filtered: GRelation[] = relations.filter((relation: GRelation): boolean => relation.id !== relationId);
    if (filtered.length === relations.length) throw new Error(`Relation not found: ${relationId}`);
    return { ...model, relations: filtered };
  }

  public static addAttribute(model: GModel, nodeId: Id, attribute: GAttribute, modelsById: ReadonlyMap<Id, GModel>): GModel {
    const startModelId: Id = model.id;

    const blockedNames: ReadonlySet<string> = NodeInheritanceResolver.resolveAttributeNames(startModelId, nodeId, modelsById);
    if (blockedNames.has(attribute.name)) throw new Error(`Attribute already exists: '${attribute.name}'`);

    const roleNames: ReadonlySet<string> = RelationDefinitionResolver.resolveReservedRoleNames(startModelId, nodeId, modelsById);
    if (roleNames.has(attribute.name)) throw new Error(`Attribute reserved by role: '${attribute.name}'`);

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

  public static updateAttribute(
    model: GModel,
    nodeId: Id,
    name: string,
    patch: UpdateAttributeInput,
    modelsById: ReadonlyMap<Id, GModel>,
  ): GModel {
    const newName: string = patch.name ?? name;

    if (newName !== name) {
      const blocked: Set<string> = new Set<string>(NodeInheritanceResolver.resolveAttributeNames(model.id, nodeId, modelsById));
      blocked.delete(name);
      if (blocked.has(newName)) throw new Error(`Attribute already exists: '${newName}'`);

      const roleNames: ReadonlySet<string> = RelationDefinitionResolver.resolveReservedRoleNames(model.id, nodeId, modelsById);
      if (roleNames.has(newName)) throw new Error(`Attribute reserved by role: '${newName}'`);
    }

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
