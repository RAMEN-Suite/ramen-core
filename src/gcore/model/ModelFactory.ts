import {
  Bounds,
  GAttribute,
  GConstraint,
  GDataType,
  GLiteral,
  GModel,
  GNode,
  GRelation,
  Id,
  RelationEnd,
  TypeRef,
} from './ModelTypes';
import { SchemaValidator } from '../validation/SchemaValidator';
import ShortUniqueId from 'short-unique-id';
import { ModelRef } from '../graph/ModelRef';
import { ModelElementIndex } from '../graph/ModelElementIndex';

export interface CreateModelInput {
  readonly uri: string;
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export interface CreateNodeInput {
  readonly name: string;
  readonly baseNodeId: Id;
}

export interface CreateAttributeInput {
  readonly name: string;
  readonly typeId: TypeRef;
  readonly bounds: Bounds;

  readonly isKey?: boolean;
  readonly isReadOnly?: boolean;
  readonly isUnique?: boolean;
  readonly isOrdered?: boolean;
}

export interface CreateRelationInput {
  readonly baseRelationId: Id;
  readonly fromNodeId: Id;
  readonly toNodeId: Id;
}

export interface CreateDataTypeInput {
  readonly name: string;
}

export interface ConnectedNode {
  readonly node: GNode;
  readonly relations: readonly GRelation[];
}

export class ModelFactory {
  public static createModel(base: GModel, input: CreateModelInput): GModel {
    const schemaId: string | undefined = SchemaValidator.getSchemaNode().$id;
    if (!schemaId) throw new Error('GCore schema has no $id.');

    return {
      $schema: schemaId,
      $id: input.uri,
      id: input.id,
      version: input.version,
      kind: 'GModel',
      name: input.name,

      imports: [
        {
          schemaId: base.$id,
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

  public static createNode(baseId: Id, input: CreateNodeInput): GNode {
    return {
      kind: 'GNode',
      id: this.createIdentifier(),
      name: input.name,
      superTypes: [ModelRef.qualify(baseId, input.baseNodeId)],
      attributes: [],
      constraints: [],
      ext: {},
    };
  }

  public static createAttribute(input: CreateAttributeInput): GAttribute {
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

  public static createDataType(input: CreateDataTypeInput): GDataType {
    return {
      kind: 'GDataType',
      id: this.createIdentifier(),
      name: input.name,
      literals: undefined,
      constraints: [],
      ext: {},
    };
  }

  public static createRelation(base: GModel, baseId: Id, input: CreateRelationInput): GRelation {
    const baseIndex: ModelElementIndex = new ModelElementIndex(base);
    const baseRelation: GRelation | undefined = baseIndex.relationsById.get(input.baseRelationId);
    if (!baseRelation) throw new Error(`Base relation not found: ${input.baseRelationId}`);

    return {
      kind: 'GRelation',
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

  public static duplicateNode(node: GNode): GNode {
    const cloned: GNode = structuredClone(node);
    cloned.id = this.createIdentifier();
    cloned.name = `${node.name} (copy)`;

    const constraintFn: (constraint: GConstraint) => GConstraint = (constraint: GConstraint): GConstraint => {
      return { ...constraint, id: this.createIdentifier() };
    };
    cloned.constraints = cloned.constraints?.map(constraintFn);
    cloned.attributes = cloned.attributes.map((attribute: GAttribute): GAttribute => {
      return { ...attribute, id: this.createIdentifier(), constraints: attribute.constraints?.map(constraintFn) };
    });

    return cloned;
  }

  public static duplicateConnectedNode(model: GModel, sourceNodeId: Id): ConnectedNode {
    const index: ModelElementIndex = new ModelElementIndex(model);
    const source: GNode | undefined = index.nodesById.get(sourceNodeId);
    if (!source) throw new Error(`Node not found: ${sourceNodeId}`);

    const clonedNode: GNode = this.duplicateNode(source);
    const related: GRelation[] = [];

    for (const relation of model.relations) {
      const isRelevant: boolean = relation.from.nodeId === sourceNodeId || relation.to.nodeId === sourceNodeId;
      if (!isRelevant) continue;

      const clonedRelation: GRelation = structuredClone(relation);
      clonedRelation.id = this.createIdentifier();
      clonedRelation.from.id = this.createIdentifier();
      clonedRelation.to.id = this.createIdentifier();

      if (clonedRelation.from.nodeId === sourceNodeId) clonedRelation.from.nodeId = clonedNode.id;
      if (clonedRelation.to.nodeId === sourceNodeId) clonedRelation.to.nodeId = clonedNode.id;

      const constraintFn: (constraint: GConstraint) => GConstraint = (constraint: GConstraint): GConstraint => {
        return { ...constraint, id: this.createIdentifier() };
      };

      clonedRelation.constraints = clonedRelation.constraints?.map(constraintFn);
      clonedRelation.from.constraints = clonedRelation.from.constraints?.map(constraintFn);
      clonedRelation.to.constraints = clonedRelation.to.constraints?.map(constraintFn);

      related.push(clonedRelation);
    }

    return { node: clonedNode, relations: related };
  }

  public static createLiteral(name: string, literal?: string, value?: number): GLiteral {
    return {
      id: this.createIdentifier(),
      name: name,
      literal: literal,
      value: value,
      constraints: [],
      ext: {},
    };
  }

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

  public static createIdentifier(): string {
    return new ShortUniqueId({ length: 16 }).rnd();
  }
}
