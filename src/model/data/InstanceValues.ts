import { BuiltinDataTypes } from '../Builtins';
import { ModelRef } from '../graph/References';
import { Bounds, Attribute, BuiltinType, Constraint, DataType, Node, Id } from '../Types';
import { EffectiveModel, EffectiveNode } from '../graph/EffectiveModel';
import { ProjectGraph, ResolvedElement } from '../graph/ProjectGraph';
import { ConstraintRegistry } from '../validation/Constraints';
import type { ConstraintGraph } from '../validation/Constraints';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../validation/Diagnostics';
import { InstanceValidationOptions, ModelInstanceGraph, ModelInstanceNode, ResolvedInstanceNode } from './InstanceTypes';
import { ValidationCode } from '../validation/Codes';
import { jsonValueKey } from '../JsonValue';
import { ValueValidator } from './ValueValidator';
import type { ValueCheck } from './ValueValidator';
import type { ValidationResult } from '../validation/ModelValidator';

/** Validates instance properties against effective node attributes and constraints. */
export class InstanceValueValidator {
  private readonly nodes: Map<string, EffectiveNode> = new Map<string, EffectiveNode>();
  private readonly keys: Map<string, Map<unknown, Id>> = new Map<string, Map<unknown, Id>>();
  private readonly values: ValueValidator;

  /** Creates a value validator with the supplied constraint languages. */
  public constructor(
    private readonly constraints: ConstraintRegistry,
    private readonly graphContext?: ConstraintGraph,
    private readonly attributes?: InstanceValidationOptions['attributes'],
  ) {
    this.values = new ValueValidator(constraints);
  }

  /** Checks one property input without requiring a complete recorded graph. */
  public validateOneAttribute(graph: ProjectGraph, modelId: Id, attribute: Attribute, value: unknown): ValidationResult {
    const diagnostics: Diagnostic[] = [];
    this.validateAttributeValue(
      graph,
      modelId,
      undefined,
      attribute,
      value,
      DiagnosticPath.root().property('value'),
      diagnostics,
    );
    return { diagnostics, hasErrors: diagnostics.some((item: Diagnostic): boolean => item.severity === 'error') };
  }

  /** Resolves instance node types and validates their modelled properties. */
  public validate(graph: ProjectGraph, instance: ModelInstanceGraph, diagnostics: Diagnostic[]): Map<Id, ResolvedInstanceNode> {
    this.keys.clear();
    this.nodes.clear();
    const nodesById: Map<Id, ResolvedInstanceNode> = new Map<Id, ResolvedInstanceNode>();
    instance.nodes.forEach((node: ModelInstanceNode, index: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root().property('nodes').index(index);
      if (nodesById.has(node.id)) {
        diagnostics.push(this.error('INSTANCE_NODE_ID_DUPLICATE', `Instance node id '${node.id}' is duplicated.`, path, node.id));

        return;
      }
      const type: ResolvedElement<Node> | undefined = graph.resolveNode(graph.getRootModel().id, node.typeId);
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
    type: ResolvedElement<Node>,
    instance: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const reference: string = ModelRef.qualify(type.modelId, type.element.id);
    const effective: EffectiveNode | undefined =
      this.nodes.get(reference) ?? EffectiveModel.resolveNode(graph, type.modelId, type.element.id);
    if (!effective) return;
    this.nodes.set(reference, effective);
    const attributes: readonly Attribute[] = this.attributes?.(type, instance) ?? effective.attributes;
    const attributesByName: Map<string, Attribute> = new Map<string, Attribute>(
      attributes.map((attribute: Attribute): [string, Attribute] => [attribute.name, attribute]),
    );

    this.validateUnknownProperties(instance, type.element, attributesByName, path, diagnostics);
    for (const attribute of attributes) {
      const value: unknown = Object.hasOwn(instance.properties, attribute.name) ? instance.properties[attribute.name] : undefined;
      const attributePath: DiagnosticPath = path.property('properties').property(attribute.name);

      const start: number = diagnostics.length;
      this.validateAttributeValue(graph, type.modelId, instance.id, attribute, value, attributePath, diagnostics);
      const invalid: boolean = diagnostics.slice(start).some((item: Diagnostic): boolean => item.severity === 'error');
      if (attribute.isKey && !invalid) this.validateKey(effective, attribute, value, instance.id, attributePath, diagnostics);
    }
    this.validateNodeConstraints(type, instance, effective.constraints, path, diagnostics);
  }

  private validateKey(
    effective: EffectiveNode,
    attribute: Attribute,
    value: unknown,
    instanceId: Id,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const owner: ResolvedElement<Node> | undefined = effective.lineage.find((item: ResolvedElement<Node>): boolean =>
      item.element.attributes.some(
        (candidate: Attribute): boolean => candidate.id === attribute.id && candidate.name === attribute.name,
      ),
    );
    const key: string = ModelRef.qualify(owner?.modelId ?? effective.modelId, attribute.id);
    const values: Map<unknown, Id> = this.keys.get(key) ?? new Map<unknown, Id>();
    const previous: Id | undefined = values.get(value);
    if (previous !== undefined) {
      const message: string = `Key '${attribute.name}' duplicates the value on instance '${previous}'.`;
      diagnostics.push(this.error('INSTANCE_KEY_DUPLICATE', message, path, instanceId));
      return;
    }
    values.set(value, instanceId);
    this.keys.set(key, values);
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
    type: ResolvedElement<Node>,
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
    instanceId: Id | undefined,
    attribute: Attribute,
    value: unknown,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const isMissing: boolean = value === undefined;
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
      new Set(values.map((item: unknown): string => jsonValueKey(item))).size !== values.length
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
    instanceId: Id | undefined,
    attribute: Attribute,
    value: unknown,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const type: BuiltinType | ResolvedElement<DataType> | undefined = BuiltinDataTypes.isBuiltin(attribute.typeId)
      ? attribute.typeId
      : graph.resolveDataType(ModelRef.isQualified(attribute.typeId) ? graph.getRootModel().id : modelId, attribute.typeId);
    if (type) {
      const result: ValueCheck = this.values.validate(type, value, {
        path,
        label: `Property '${attribute.name}'`,
        ref: attribute.id,
        instanceId,
        graph: this.graphContext,
      });
      diagnostics.push(...result.diagnostics);
      if (!result.typeValid) return;
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

  private error(code: ValidationCode, message: string, path: DiagnosticPath, ref?: string): Diagnostic {
    return Diagnostics.error({ code: code, message: message, path: path, ref: ref });
  }
}
