import { BuiltinDataTypes } from '../Builtins';
import { Bounds, Attribute, Constraint, DataType, Literal, Node, Id } from '../Types';
import { EffectiveModel, EffectiveNode } from '../graph/EffectiveModel';
import { ProjectGraph, ResolvedModelElement } from '../graph/ProjectGraph';
import { ConstraintRegistry } from '../validation/Constraints';
import type { ConstraintGraphContext } from '../validation/Constraints';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../validation/Diagnostics';
import { InstanceValidationOptions, ModelInstanceGraph, ModelInstanceNode, ResolvedInstanceNode } from './InstanceTypes';
import { ValidationCode } from '../validation/Codes';

/** Validates instance properties against effective node attributes and constraints. */
export class InstanceValueValidator {
  /** Creates a value validator with the supplied constraint languages. */
  public constructor(
    private readonly constraints: ConstraintRegistry,
    private readonly graphContext: ConstraintGraphContext,
    private readonly attributes?: InstanceValidationOptions['attributes'],
  ) {}

  /** Resolves instance node types and validates their modeled properties. */
  public validate(graph: ProjectGraph, instance: ModelInstanceGraph, diagnostics: Diagnostic[]): Map<Id, ResolvedInstanceNode> {
    const nodesById: Map<Id, ResolvedInstanceNode> = new Map<Id, ResolvedInstanceNode>();
    instance.nodes.forEach((node: ModelInstanceNode, index: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root().property('nodes').index(index);
      if (nodesById.has(node.id)) {
        diagnostics.push(this.error('INSTANCE_NODE_ID_DUPLICATE', `Instance node id '${node.id}' is duplicated.`, path, node.id));

        return;
      }
      const type: ResolvedModelElement<Node> | undefined = graph.resolveNode(instance.modelId, node.typeId);
      if (!type) {
        diagnostics.push(
          this.error(
            'INSTANCE_NODE_TYPE_NOT_FOUND',
            `Node type '${node.typeId}' was not found.`,
            path.property('typeId'),
            node.id,
          ),
        );

        return;
      }
      nodesById.set(node.id, { instance: node, type: type });
      this.validateProperties(graph, type, node, path, diagnostics);
    });
    return nodesById;
  }

  private validateProperties(
    graph: ProjectGraph,
    type: ResolvedModelElement<Node>,
    instance: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(graph, type.modelId, type.element.id);
    if (!effective) return;
    const attributes: readonly Attribute[] = this.attributes?.(type, instance) ?? effective.attributes;
    const attributesByName: Map<string, Attribute> = new Map<string, Attribute>(
      attributes.map((attribute: Attribute): [string, Attribute] => [attribute.name, attribute]),
    );

    this.validateUnknownProperties(instance, type.element, attributesByName, path, diagnostics);
    for (const attribute of attributes) {
      const value: unknown = instance.properties[attribute.name];
      const attributePath: DiagnosticPath = path.property('properties').property(attribute.name);

      this.validateAttributeValue(graph, type.modelId, instance.id, attribute, value, attributePath, diagnostics);
    }
    this.validateNodeConstraints(type, instance, effective.constraints, path, diagnostics);
  }

  private validateUnknownProperties(
    instance: ModelInstanceNode,
    type: Node,
    attributesByName: ReadonlyMap<string, Attribute>,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    for (const name of Object.keys(instance.properties)) {
      if (attributesByName.has(name)) continue;
      diagnostics.push(
        this.error(
          'INSTANCE_PROPERTY_UNKNOWN',
          `Property '${name}' is not declared by node type '${type.name}'.`,
          path.property('properties').property(name),
          instance.id,
        ),
      );
    }
  }

  private validateNodeConstraints(
    type: ResolvedModelElement<Node>,
    instance: ModelInstanceNode,
    constraints: readonly Constraint[],
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    for (const constraint of constraints) {
      diagnostics.push(
        ...this.constraints.evaluate(constraint, {
          modelId: type.modelId,
          ownerId: type.element.id,
          instanceId: instance.id,
          target: 'node',
          value: instance.properties,
          path: path.property('properties'),
          graph: this.graphContext,
        }),
      );
    }
  }

  private validateAttributeValue(
    graph: ProjectGraph,
    modelId: Id,
    instanceId: Id,
    attribute: Attribute,
    value: unknown,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const isMissing: boolean = value === undefined || value === null;
    if (isMissing) {
      if (attribute.bounds.lowerBound > 0) {
        diagnostics.push(
          this.error('INSTANCE_PROPERTY_REQUIRED', `Property '${attribute.name}' is required.`, path, attribute.id),
        );
      }

      return;
    }
    const values: readonly unknown[] = this.readValues(attribute, value, path, diagnostics);
    if (values.length === 0 && !Array.isArray(value)) return;
    this.validateCount(attribute.name, attribute.bounds, values.length, path, attribute.id, diagnostics);
    if (
      attribute.isUnique !== false &&
      new Set(values.map((item: unknown): string => JSON.stringify(item))).size !== values.length
    ) {
      diagnostics.push(
        this.error('INSTANCE_PROPERTY_NOT_UNIQUE', `Property '${attribute.name}' contains duplicate values.`, path, attribute.id),
      );
    }
    values.forEach((item: unknown, index: number): void => {
      const valuePath: DiagnosticPath = Array.isArray(value) ? path.index(index) : path;
      this.validateTypedValue(graph, modelId, instanceId, attribute, item, valuePath, diagnostics);
    });
  }

  private readValues(attribute: Attribute, value: unknown, path: DiagnosticPath, diagnostics: Diagnostic[]): readonly unknown[] {
    const isMany: boolean = attribute.bounds.upperBound !== 1;
    if (isMany && !Array.isArray(value)) {
      diagnostics.push(
        this.error('INSTANCE_PROPERTY_ARRAY_REQUIRED', `Property '${attribute.name}' must be an array.`, path, attribute.id),
      );

      return [];
    }
    if (!isMany && Array.isArray(value)) {
      diagnostics.push(
        this.error(
          'INSTANCE_PROPERTY_SCALAR_REQUIRED',
          `Property '${attribute.name}' must be a scalar value.`,
          path,
          attribute.id,
        ),
      );

      return [];
    }
    return Array.isArray(value) ? value : [value];
  }

  private validateTypedValue(
    graph: ProjectGraph,
    modelId: Id,
    instanceId: Id,
    attribute: Attribute,
    value: unknown,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    if (BuiltinDataTypes.isBuiltin(attribute.typeId)) {
      if (!this.matchesBuiltin(attribute.typeId, value)) {
        diagnostics.push(
          this.error(
            'INSTANCE_PROPERTY_TYPE_INVALID',
            `Property '${attribute.name}' must contain ${attribute.typeId} values.`,
            path,
            attribute.id,
          ),
        );
      }
    } else {
      const dataType: ResolvedModelElement<DataType> | undefined = graph.resolveDataType(modelId, attribute.typeId);

      if (dataType) this.validateDataTypeValue(dataType, instanceId, attribute, value, path, diagnostics);
    }
    for (const constraint of attribute.constraints ?? []) {
      diagnostics.push(
        ...this.constraints.evaluate(constraint, {
          modelId: modelId,
          ownerId: attribute.id,
          instanceId: instanceId,
          target: 'attribute',
          value: value,
          path: path,
          graph: this.graphContext,
        }),
      );
    }
  }

  private validateDataTypeValue(
    dataType: ResolvedModelElement<DataType>,
    instanceId: Id,
    attribute: Attribute,
    value: unknown,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    if (!this.matchesBuiltin(dataType.element.baseType, value)) {
      diagnostics.push(
        this.error(
          'INSTANCE_PROPERTY_TYPE_INVALID',
          `Property '${attribute.name}' must contain ${dataType.element.baseType} values for data type '${dataType.element.name}'.`,
          path,
          attribute.id,
        ),
      );

      return;
    }
    this.validateLiteralValue(dataType, instanceId, attribute, value, path, diagnostics);
    for (const constraint of dataType.element.constraints ?? []) {
      diagnostics.push(
        ...this.constraints.evaluate(constraint, {
          modelId: dataType.modelId,
          ownerId: dataType.element.id,
          instanceId: instanceId,
          target: 'dataType',
          value: value,
          path: path,
          graph: this.graphContext,
        }),
      );
    }
  }

  private validateLiteralValue(
    dataType: ResolvedModelElement<DataType>,
    instanceId: Id,
    attribute: Attribute,
    value: unknown,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const literals: readonly Literal[] | undefined = dataType.element.literals;
    if (!literals) return;
    const literal: Literal | undefined = literals.find((item: Literal): boolean => this.matchesLiteral(item, value));
    if (!literal) {
      diagnostics.push(
        this.error(
          'INSTANCE_PROPERTY_LITERAL_INVALID',
          `Property '${attribute.name}' contains no literal declared by data type '${dataType.element.name}'.`,
          path,
          attribute.id,
        ),
      );

      return;
    }
    for (const constraint of literal.constraints ?? []) {
      diagnostics.push(
        ...this.constraints.evaluate(constraint, {
          modelId: dataType.modelId,
          ownerId: literal.id,
          instanceId: instanceId,
          target: 'literal',
          value: value,
          path: path,
          graph: this.graphContext,
        }),
      );
    }
  }

  private validateCount(
    name: string,
    bounds: Bounds,
    count: number,
    path: DiagnosticPath,
    ref: string,
    diagnostics: Diagnostic[],
  ): void {
    if (count < bounds.lowerBound || (bounds.upperBound !== -1 && count > bounds.upperBound)) {
      diagnostics.push(
        this.error(
          'INSTANCE_CARDINALITY_INVALID',
          `Feature '${name}' has ${count} value(s), expected ${bounds.lowerBound}..${bounds.upperBound}.`,
          path,
          ref,
        ),
      );
    }
  }

  private matchesBuiltin(type: 'String' | 'Boolean' | 'Integer' | 'Float', value: unknown): boolean {
    if (type === 'String') return typeof value === 'string';
    if (type === 'Boolean') return typeof value === 'boolean';
    if (type === 'Integer') return typeof value === 'number' && Number.isInteger(value);
    return typeof value === 'number' && Number.isFinite(value);
  }

  private matchesLiteral(literal: Literal, value: unknown): boolean {
    if (literal.literal !== undefined && value === literal.literal) return true;
    if (literal.value !== undefined && value === literal.value) return true;
    return value === literal.name;
  }

  private error(code: ValidationCode, message: string, path: DiagnosticPath, ref?: string): Diagnostic {
    return Diagnostics.error({ code: code, message: message, path: path, ref: ref });
  }
}
