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
import type { ResolvedAnnotation } from './AnnotationIndex.js';
import { ConstraintRules } from '../../model/validation/ConstraintRules.js';

/** Combines shared node properties with independently owned annotation shape properties. */
export class AnnotationProperties {
  private static readonly constraints: ConstraintRules = new ConstraintRules();
  /** Node properties always apply; the selected shape adds its own declarations. */
  public static allowed(graph: ProjectGraph, definition: ResolvedAnnotation, owner: ResolvedElement<Node>): readonly Attribute[] {
    const attributes: readonly Attribute[] = EffectiveModel.resolveNode(graph, owner.modelId, owner.element.id)?.attributes ?? [];
    return [
      ...attributes.map((attribute: Attribute): Attribute => this.qualify(attribute, owner.modelId)),
      ...this.resolve(definition),
    ];
  }

  public static resolve(definition: ResolvedAnnotation): readonly Attribute[] {
    return definition.annotation.properties.map((attribute: Attribute): Attribute => this.qualify(attribute, definition.modelId));
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

    for (const [index, attribute] of definition.annotation.properties.entries()) {
      if (!this.isValid(graph, definition.modelId, attribute, nodeAttributes)) {
        diagnostics.push(
          this.error(
            definition,
            'RAMEN_ANNOTATION_PROPERTY_INVALID',
            'Property name or data type is invalid, or conflicts with a shared node property.',
          ),
        );
        continue;
      }

      if (names.has(attribute.name) || ids.has(attribute.id)) {
        diagnostics.push(
          this.error(definition, 'RAMEN_ANNOTATION_PROPERTY_INVALID', 'Property names and identifiers must be unique.'),
        );
      }
      diagnostics.push(...this.validateBounds(definition, attribute));
      diagnostics.push(...this.validateOwned(definition, attribute, nodeAttributes, index));

      names.add(attribute.name);
      ids.add(attribute.id);
    }
    return diagnostics;
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

  private static validateBounds(definition: ResolvedAnnotation, attribute: Attribute): readonly Diagnostic[] {
    if (Cardinality.areBoundsCoherent(attribute.bounds) && !this.hasInvalidKeyBounds(attribute, attribute.bounds)) return [];
    return [
      this.error(
        definition,
        'RAMEN_ANNOTATION_BOUNDS_INVALID',
        'Property cardinality must be valid; a key must have bounds 1..1.',
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
