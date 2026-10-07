import {
  Bounds,
  BuiltinType,
  Attribute,
  Constraint,
  DataType,
  Literal,
  Model,
  Node,
  Relation,
  Id,
  RelationEnd,
  TypeRef,
} from '../Types.js';
import { MODEL_SCHEMA_URI } from '../validation/ModelSchema.js';
import ShortUniqueId from 'short-unique-id';
import { ModelRef } from '../graph/References.js';
import { ModelElementIndex } from '../graph/ElementIndex.js';

/** Values needed to create a model that imports a base model. */
export interface CreateModelInput {
  readonly uri: string;
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

/** Values needed to create a node that refines a base node. */
export interface CreateNodeInput {
  readonly name: string;
  readonly baseNodeId: Id;
}

/** Values needed to create a node attribute. */
export interface CreateAttributeInput {
  readonly name: string;
  readonly typeId: TypeRef;
  readonly bounds: Bounds;

  readonly isKey?: boolean;
  readonly isReadOnly?: boolean;
  readonly isUnique?: boolean;
  readonly isOrdered?: boolean;
  readonly constraints?: readonly Constraint[];
}

/** Values needed to create a relation that refines a base relation. */
export interface CreateRelationInput {
  readonly baseRelationId: Id;
  readonly fromNodeId: Id;
  readonly toNodeId: Id;
}

/** Values needed to create a named data type and its value rules. */
export interface CreateDataTypeInput {
  readonly name: string;
  readonly baseType: BuiltinType;
  readonly constraints?: readonly Constraint[];
}

/** Duplicated node together with the duplicated relations connected to it. */
export interface ConnectedNode {
  readonly node: Node;
  readonly relations: readonly Relation[];
}

/** Creates RMF model elements with stable identifiers and empty extension data. */
export class ModelFactory {
  /** Creates a new generic base model without imports. */
  public static createRootModel(input: CreateModelInput): Model {
    return {
      $schema: MODEL_SCHEMA_URI,
      $id: input.uri,
      id: input.id,
      version: input.version,
      kind: 'Model',
      name: input.name,
      imports: [],
      classifiers: [],
      relations: [],
      ext: {},
    };
  }

  /** Creates an empty model with an exact import of the supplied base model. */
  public static createModel(base: Model, input: CreateModelInput): Model {
    return {
      ...this.createRootModel(input),

      imports: [
        {
          modelUri: base.$id,
          modelId: base.id,
          version: base.version,
          name: base.name,
        },
      ],
    };
  }

  /** Creates a node with a qualified reference to its base node. */
  public static createNode(baseId: Id, input: CreateNodeInput): Node {
    return {
      kind: 'Node',
      id: this.createIdentifier(),
      name: input.name,
      superTypes: [ModelRef.qualify(baseId, input.baseNodeId)],
      attributes: [],
      constraints: [],
      ext: {},
    };
  }

  /** Creates an attribute with the requested type, bounds, and feature flags. */
  public static createAttribute(input: CreateAttributeInput): Attribute {
    return {
      id: this.createIdentifier(),
      name: input.name,
      typeId: input.typeId,
      bounds: { ...input.bounds },
      isKey: input.isKey ?? false,
      isReadOnly: input.isReadOnly ?? false,
      isUnique: input.isUnique ?? true,
      isOrdered: input.isOrdered ?? true,
      constraints: structuredClone([...(input.constraints ?? [])]),
      ext: {},
    };
  }

  /** Creates a data type without literals and with optional value rules. */
  public static createDataType(input: CreateDataTypeInput): DataType {
    return {
      kind: 'DataType',
      id: this.createIdentifier(),
      name: input.name,
      baseType: input.baseType,
      constraints: structuredClone([...(input.constraints ?? [])]),
      ext: {},
    };
  }

  /** Creates a relation whose end bounds are copied from a base relation. */
  public static createRelation(base: Model, baseId: Id, input: CreateRelationInput): Relation {
    const baseIndex: ModelElementIndex = new ModelElementIndex(base);
    const baseRelation: Relation | undefined = baseIndex.relationsById.get(input.baseRelationId);

    if (!baseRelation) throw new Error(`Base relation not found: ${input.baseRelationId}`);
    return {
      kind: 'Relation',
      id: this.createIdentifier(),
      superTypes: [ModelRef.qualify(baseId, input.baseRelationId)],
      name: baseRelation.name,
      from: this.refineEnd(baseRelation.from, input.fromNodeId),
      to: this.refineEnd(baseRelation.to, input.toNodeId),
      constraints: [],
      ext: {},
    };
  }

  private static refineEnd(base: RelationEnd, nodeId: Id): RelationEnd {
    return this.createRelationEnd(nodeId, base.bounds);
  }

  /** Deeply duplicates a node and assigns new identifiers to its owned elements. */
  public static duplicateNode(node: Node): Node {
    const cloned: Node = structuredClone(node);
    cloned.id = this.createIdentifier();
    cloned.name = `${node.name} (copy)`;

    const constraintFn: (constraint: Constraint) => Constraint = (constraint: Constraint): Constraint => {
      return { ...constraint, id: this.createIdentifier() };
    };

    cloned.constraints = cloned.constraints?.map(constraintFn);
    cloned.attributes = cloned.attributes.map((attribute: Attribute): Attribute => {
      return { ...attribute, id: this.createIdentifier(), constraints: attribute.constraints?.map(constraintFn) };
    });
    return cloned;
  }

  /** Duplicates a node and every local relation connected to it. */
  public static duplicateConnectedNode(model: Model, sourceNodeId: Id): ConnectedNode {
    const index: ModelElementIndex = new ModelElementIndex(model);
    const source: Node | undefined = index.nodesById.get(sourceNodeId);

    if (!source) throw new Error(`Node not found: ${sourceNodeId}`);
    const clonedNode: Node = this.duplicateNode(source);
    const related: Relation[] = [];

    for (const relation of model.relations) {
      const isRelevant: boolean =
        ModelRef.matches(relation.from.nodeId, model.id, sourceNodeId) ||
        ModelRef.matches(relation.to.nodeId, model.id, sourceNodeId);

      if (!isRelevant) continue;
      const clonedRelation: Relation = structuredClone(relation);
      clonedRelation.id = this.createIdentifier();
      clonedRelation.from.id = this.createIdentifier();
      clonedRelation.to.id = this.createIdentifier();

      if (ModelRef.matches(clonedRelation.from.nodeId, model.id, sourceNodeId)) clonedRelation.from.nodeId = clonedNode.id;
      if (ModelRef.matches(clonedRelation.to.nodeId, model.id, sourceNodeId)) clonedRelation.to.nodeId = clonedNode.id;

      const constraintFn: (constraint: Constraint) => Constraint = (constraint: Constraint): Constraint => {
        return { ...constraint, id: this.createIdentifier() };
      };

      clonedRelation.constraints = clonedRelation.constraints?.map(constraintFn);
      clonedRelation.from.constraints = clonedRelation.from.constraints?.map(constraintFn);
      clonedRelation.to.constraints = clonedRelation.to.constraints?.map(constraintFn);

      related.push(clonedRelation);
    }
    return { node: clonedNode, relations: related };
  }

  /** Creates a named data type literal with optional serialised and numeric values. */
  public static createLiteral(name: string, literal?: string, value?: number): Literal {
    return {
      id: this.createIdentifier(),
      name: name,
      literal: literal,
      value: value,
      constraints: [],
      ext: {},
    };
  }

  /** Creates a relation end for a node and cardinality. */
  public static createRelationEnd(nodeId: Id, bounds: Bounds): RelationEnd {
    return {
      id: this.createIdentifier(),
      nodeId: nodeId,
      bounds: { ...bounds },
      constraints: [],
      ext: {},
    };
  }

  /** Generates a random 16-character identifier for a new model element. */
  public static createIdentifier(): string {
    return new ShortUniqueId({ length: 16 }).rnd();
  }
}
