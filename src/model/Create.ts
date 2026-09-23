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
} from './Types';
import { ModelSchemaValidator } from './validation/ModelSchema';
import ShortUniqueId from 'short-unique-id';
import { ModelRef } from './project/Refs';
import { ModelElementIndex } from './project/Elements';

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
}

/** Values needed to create a relation that refines a base relation. */
export interface CreateRelationInput {
  readonly baseRelationId: Id;
  readonly fromNodeId: Id;
  readonly toNodeId: Id;
}

/** Values needed to create an initially unrestricted data type. */
export interface CreateDataTypeInput {
  readonly name: string;
  readonly baseType: BuiltinType;
}

/** Duplicated node together with the duplicated relations connected to it. */
export interface ConnectedNode {
  readonly node: Node;
  readonly relations: readonly Relation[];
}

/** Creates valid RAMEN model elements with stable identifiers and empty extension data. */
export class ModelFactory {
  /** Creates an empty model with an exact import of the supplied base model. */
  public static createModel(base: Model, input: CreateModelInput): Model {
    const schemaUri: string | undefined = ModelSchemaValidator.getSchemaNode().$id;

    if (!schemaUri) throw new Error('RAMEN model format schema has no $id.');

    return {
      $schema: schemaUri,
      $id: input.uri,
      id: input.id,
      version: input.version,
      kind: 'Model',
      name: input.name,

      imports: [
        {
          modelUri: base.$id,
          modelId: base.id,
          version: base.version,
          name: base.name,
        },
      ],

      classifiers: [],
      relations: [],
      ext: {},
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
      bounds: input.bounds,
      isKey: input.isKey,
      isReadOnly: input.isReadOnly,
      isUnique: input.isUnique,
      isOrdered: input.isOrdered,
      constraints: [],
      ext: {},
    };
  }

  /** Creates a data type without literals or constraints. */
  public static createDataType(input: CreateDataTypeInput): DataType {
    return {
      kind: 'DataType',
      id: this.createIdentifier(),
      name: input.name,
      baseType: input.baseType,
      literals: undefined,
      constraints: [],
      ext: {},
    };
  }

  /** Creates a relation whose roles and bounds are copied from a base relation. */
  public static createRelation(base: Model, baseId: Id, input: CreateRelationInput): Relation {
    const baseIndex: ModelElementIndex = new ModelElementIndex(base);
    const baseRelation: Relation | undefined = baseIndex.relationsById.get(input.baseRelationId);

    if (!baseRelation) throw new Error(`Base relation not found: ${input.baseRelationId}`);

    return {
      kind: 'Relation',
      id: this.createIdentifier(),
      superTypes: [ModelRef.qualify(baseId, input.baseRelationId)],
      name: baseRelation.name,
      from: {
        id: this.createIdentifier(),
        nodeId: input.fromNodeId,
        role: baseRelation.from.role,
        bounds: { ...baseRelation.from.bounds },
        constraints: [],
        ext: {},
      },
      to: {
        id: this.createIdentifier(),
        nodeId: input.toNodeId,
        role: baseRelation.to.role,
        bounds: { ...baseRelation.to.bounds },
        constraints: [],
        ext: {},
      },
      constraints: [],
      ext: {},
    };
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
      const isRelevant: boolean = relation.from.nodeId === sourceNodeId || relation.to.nodeId === sourceNodeId;

      if (!isRelevant) continue;

      const clonedRelation: Relation = structuredClone(relation);

      clonedRelation.id = this.createIdentifier();
      clonedRelation.from.id = this.createIdentifier();
      clonedRelation.to.id = this.createIdentifier();

      if (clonedRelation.from.nodeId === sourceNodeId) clonedRelation.from.nodeId = clonedNode.id;
      if (clonedRelation.to.nodeId === sourceNodeId) clonedRelation.to.nodeId = clonedNode.id;

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

  /** Creates a named data type literal with optional serialized and numeric values. */
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

  /** Creates a relation end for a node, role, and cardinality. */
  public static createRelationEnd(nodeId: Id, role: string, bounds: Bounds): RelationEnd {
    return {
      id: this.createIdentifier(),
      nodeId: nodeId,
      role: role,
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
