import { BuiltinDataTypes } from '../../model/Builtins.js';
import {
  EffectiveModel,
  ModelRef,
  Diagnostics,
  DiagnosticPath,
  type Diagnostic,
  type ProjectGraph,
  type ResolvedElement,
  type Attribute,
  type Node,
} from '../../model/index.js';

import { Cardinality } from '../../model/validation/Cardinality.js';
import type { AnnotationProperty } from './Definitions.js';
import type { ResolvedAnnotation } from './AnnotationIndex.js';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../ReferenceModel.js';
import { ConstraintRules } from '../../model/validation/ConstraintRules.js';

/** Resolves node attribute selections and properties owned by an annotation type. */
export class AnnotationProperties {
  private static readonly constraints: ConstraintRules = new ConstraintRules();
  /** Combines the common RAMEN fields with properties permitted by the selected annotation type. */
  public static allowed(graph: ProjectGraph, definition: ResolvedAnnotation, owner: ResolvedElement<Node>): readonly Attribute[] {
    const common: readonly Attribute[] =
      EffectiveModel.resolveNode(graph, RAMEN_MODEL.id, RAMEN_ELEMENT.ANNOTATION)?.attributes ?? [];
    const qualified: readonly Attribute[] = common.map((attribute: Attribute): Attribute =>
      this.qualify(attribute, RAMEN_MODEL.id),
    );
    return [...qualified, ...this.resolve(graph, definition, owner)];
  }

  public static resolve(graph: ProjectGraph, definition: ResolvedAnnotation, owner: ResolvedElement<Node>): readonly Attribute[] {
    const result: Attribute[] = [];
    for (const property of definition.annotation.properties) {
      if ('attributeId' in property) {
        const inherited: Attribute | undefined = this.find(graph, owner, property.attributeId);
        if (inherited) result.push({ ...inherited, bounds: property.bounds ?? inherited.bounds });
      } else result.push(this.qualify(property, definition.modelId));
    }
    return result;
  }

  public static validate(
    graph: ProjectGraph,
    definition: ResolvedAnnotation,
    owner: ResolvedElement<Node>,
  ): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const names: Set<string> = new Set<string>();
    const ids: Set<string> = new Set<string>();
    const nodeAttributes: readonly Attribute[] =
      EffectiveModel.resolveNode(graph, owner.modelId, owner.element.id)?.attributes ?? [];

    for (const [index, property] of definition.annotation.properties.entries()) {
      const attribute: Attribute | undefined = this.selected(graph, owner, property);
      if (!attribute || !this.isValid(graph, definition.modelId, attribute, 'attributeId' in property ? [] : nodeAttributes)) {
        diagnostics.push(
          this.error(definition, 'RAMEN_ANNOTATION_PROPERTY_INVALID', 'Property reference, name or data type is invalid.'),
        );
        continue;
      }

      if (names.has(attribute.name) || ids.has(attribute.id)) {
        diagnostics.push(
          this.error(definition, 'RAMEN_ANNOTATION_PROPERTY_INVALID', 'Property names and identifiers must be unique.'),
        );
      }
      diagnostics.push(...this.validateBounds(definition, attribute, property));
      if (!('attributeId' in property)) {
        diagnostics.push(...this.validateOwned(definition, attribute, nodeAttributes, index));
      }

      names.add(attribute.name);
      ids.add(attribute.id);
    }
    return [...diagnostics, ...this.validateRequired(graph, definition, owner)];
  }

  private static validateOwned(
    definition: ResolvedAnnotation,
    attribute: Attribute,
    nodeAttributes: readonly Attribute[],
    index: number,
  ): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [...this.constraints.validate(attribute.constraints, this.path(definition).index(index))];
    if (attribute.isKey && nodeAttributes.some((item: Attribute): boolean => item.isKey === true)) {
      diagnostics.push(this.error(definition, 'ATTRIBUTE_MULTIPLE_KEYS', 'An annotation property cannot add a second node key.'));
    }
    return diagnostics;
  }

  /** Required node properties cannot be excluded by a closed annotation definition. */
  public static validateRequired(
    graph: ProjectGraph,
    definition: ResolvedAnnotation,
    owner: ResolvedElement<Node>,
  ): readonly Diagnostic[] {
    const attributes: readonly Attribute[] = EffectiveModel.resolveNode(graph, owner.modelId, owner.element.id)?.attributes ?? [];
    const allowed: ReadonlySet<string> = new Set<string>(
      this.allowed(graph, definition, owner).map((attribute: Attribute): string => attribute.name),
    );

    return attributes
      .filter((attribute: Attribute): boolean => attribute.bounds.lowerBound > 0 && !allowed.has(attribute.name))
      .map((attribute: Attribute): Diagnostic =>
        this.error(
          definition,
          'RAMEN_ANNOTATION_PROPERTY_INVALID',
          `Annotation '${definition.annotation.type}' must select required property '${attribute.name}' on '${owner.element.name}'.`,
        ),
      );
  }

  private static selected(
    graph: ProjectGraph,
    owner: ResolvedElement<Node>,
    property: AnnotationProperty,
  ): Attribute | undefined {
    return 'attributeId' in property ? this.find(graph, owner, property.attributeId) : property;
  }

  private static validateBounds(
    definition: ResolvedAnnotation,
    attribute: Attribute,
    property: AnnotationProperty,
  ): readonly Diagnostic[] {
    const bounds: Attribute['bounds'] = property.bounds ?? attribute.bounds;
    if (Cardinality.isModelBoundsCompatible(attribute.bounds, bounds) && !this.hasInvalidKeyBounds(attribute, bounds)) return [];
    return [
      this.error(
        definition,
        'RAMEN_ANNOTATION_BOUNDS_INVALID',
        'Property cardinality must be valid and must not widen the selected attribute.',
      ),
    ];
  }

  private static isValid(graph: ProjectGraph, modelId: string, attribute: Attribute, others: readonly Attribute[]): boolean {
    const validType: boolean =
      BuiltinDataTypes.isBuiltin(attribute.typeId) || graph.resolveDataType(modelId, attribute.typeId) !== undefined;
    const collides: boolean = others.some((item: Attribute): boolean => item.name === attribute.name || item.id === attribute.id);
    return validType && !collides;
  }

  private static hasInvalidKeyBounds(attribute: Attribute, bounds: Attribute['bounds']): boolean {
    return attribute.isKey === true && (bounds.lowerBound !== 1 || bounds.upperBound !== 1);
  }

  private static find(graph: ProjectGraph, owner: ResolvedElement<Node>, reference: string): Attribute | undefined {
    const lineage: readonly ResolvedElement<Node>[] = [owner, ...graph.getNodeAncestors(owner.modelId, owner.element.id)];
    for (const item of lineage) {
      if (ModelRef.isQualified(reference) && ModelRef.splitQualified(reference).modelId !== item.modelId) continue;
      const attribute: Attribute | undefined = item.element.attributes.find(
        (candidate: Attribute): boolean => candidate.id === ModelRef.localId(reference),
      );
      if (attribute) return this.qualify(attribute, item.modelId);
    }
    return undefined;
  }

  private static qualify(attribute: Attribute, modelId: string): Attribute {
    const typeId: string =
      BuiltinDataTypes.isBuiltin(attribute.typeId) || ModelRef.isQualified(attribute.typeId)
        ? attribute.typeId
        : ModelRef.qualify(modelId, attribute.typeId);
    return { ...attribute, typeId };
  }

  private static error(definition: ResolvedAnnotation, code: string, message: string): Diagnostic {
    return Diagnostics.error({
      code,
      message,
      ref: definition.annotation.id,
      path: this.path(definition),
    });
  }

  private static path(definition: ResolvedAnnotation): DiagnosticPath {
    return DiagnosticPath.root()
      .property('models')
      .property(definition.modelId)
      .property('annotations')
      .property(definition.annotation.id)
      .property('properties');
  }
}
