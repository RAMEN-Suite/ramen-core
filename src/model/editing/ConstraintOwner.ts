import type { Attribute, Classifier, Constraint, DataType, Id, Literal, Model, Node, Relation, RelationEnd } from '../Types';

/** Model element whose declared constraints can be read or edited. */
export type ConstraintOwner = Node | Attribute | DataType | Literal | Relation | RelationEnd;

/** A constraint owner object, or its identity when local IDs overlap across models. */
export type ConstraintOwnerInput = ConstraintOwner | { readonly modelId: Id; readonly elementId: Id };

export interface ConstraintLocation {
  readonly modelId: Id;
  readonly kind: 'node' | 'attribute' | 'dataType' | 'literal' | 'relation' | 'from' | 'to';
  readonly id: Id;
  readonly parentId?: Id;
  readonly constraints: readonly Constraint[];
}

/** Finds a constraint owner without guessing when the same local ID occurs in several models. */
export class ConstraintOwners {
  public static find(models: readonly Model[], owner: ConstraintOwnerInput): ConstraintLocation {
    const ownerId: Id = 'elementId' in owner ? owner.elementId : owner.id;
    const modelId: Id | undefined = 'modelId' in owner ? owner.modelId : undefined;
    let found: ConstraintLocation | undefined;

    for (const model of models) {
      if (modelId !== undefined && model.id !== modelId) continue;
      const location: ConstraintLocation | undefined = this.inModel(model, ownerId);
      if (!location) continue;
      if (found) throw new Error(`Constraint owner '${ownerId}' is ambiguous. Supply its modelId and elementId.`);
      found = location;
    }
    if (!found) throw new Error(`Constraint owner not found: '${ownerId}'.`);
    return found;
  }

  private static inModel(model: Model, ownerId: Id): ConstraintLocation | undefined {
    for (const classifier of model.classifiers) {
      const location: ConstraintLocation | undefined = this.inClassifier(model.id, classifier, ownerId);
      if (location) return location;
    }
    for (const relation of model.relations) {
      if (relation.id === ownerId) return this.location(model.id, 'relation', relation);
      if (relation.from.id === ownerId) return this.location(model.id, 'from', relation.from, relation.id);
      if (relation.to.id === ownerId) return this.location(model.id, 'to', relation.to, relation.id);
    }
    return undefined;
  }

  private static inClassifier(modelId: Id, classifier: Classifier, ownerId: Id): ConstraintLocation | undefined {
    if (classifier.id === ownerId) return this.location(modelId, classifier.kind === 'Node' ? 'node' : 'dataType', classifier);
    if (classifier.kind === 'Node') {
      const attribute: Attribute | undefined = classifier.attributes.find((item: Attribute): boolean => item.id === ownerId);
      return attribute ? this.location(modelId, 'attribute', attribute, classifier.id) : undefined;
    }
    const literal: Literal | undefined = classifier.literals?.find((item: Literal): boolean => item.id === ownerId);
    return literal ? this.location(modelId, 'literal', literal, classifier.id) : undefined;
  }

  private static location(
    modelId: Id,
    kind: ConstraintLocation['kind'],
    owner: ConstraintOwner,
    parentId?: Id,
  ): ConstraintLocation {
    return { modelId, kind, id: owner.id, parentId, constraints: owner.constraints ?? [] };
  }
}
