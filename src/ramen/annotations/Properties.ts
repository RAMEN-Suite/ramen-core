import { VALIDATION_ERROR } from '../../model/validation/Codes.js';
import { RAMEN_VALIDATION_ERROR } from '../validation/Codes.js';
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
import type { ResolvedAnnotationShape } from './AnnotationIndex.js';
import { ConstraintRules } from '../../model/validation/ConstraintRules.js';

/** Combines shared node properties with independently owned annotation shape properties. */
export class AnnotationProperties {
  private static readonly constraints: ConstraintRules = new ConstraintRules();
  /** Node properties always apply; the selected shape adds its own declarations. */
  public static allowed(
    graph: ProjectGraph,
    definition: ResolvedAnnotationShape,
    owner: ResolvedElement<Node>,
  ): readonly Attribute[] {
    const attributes: readonly Attribute[] = EffectiveModel.resolveNode(graph, owner.modelId, owner.element.id)?.attributes ?? [];
    return [
      ...attributes.map((attribute: Attribute): Attribute => this.qualify(attribute, owner.modelId)),
      ...this.resolve(definition),
    ];
  }

  public static resolve(definition: ResolvedAnnotationShape): readonly Attribute[] {
    return definition.annotation.properties.map((attribute: Attribute): Attribute => this.qualify(attribute, definition.modelId));
  }

  public static validate(
    graph: ProjectGraph,
    definition: ResolvedAnnotationShape,
    owner: ResolvedElement<Node>,
  ): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const names: Set<string> = new Set<string>();
    const ids: Set<string> = new Set<string>();
    const nodeAttributes: readonly Attribute[] =
      EffectiveModel.resolveNode(graph, owner.modelId, owner.element.id)?.attributes ?? [];

    const properties: readonly Attribute[] = definition.annotation.properties;
    for (const [index, attribute] of properties.entries()) {
      if (!this.isValid(graph, definition.modelId, attribute, nodeAttributes)) {
        diagnostics.push(
          this.error(
            definition,
            RAMEN_VALIDATION_ERROR.ANNOTATION_PROPERTY_INVALID,
            'Property name or data type is invalid, or conflicts with a shared node property.',
          ),
        );
        continue;
      }

      if (names.has(attribute.name) || ids.has(attribute.id)) {
        diagnostics.push(
          this.error(
            definition,
            RAMEN_VALIDATION_ERROR.ANNOTATION_PROPERTY_INVALID,
            'Property names and identifiers must be unique.',
          ),
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
    definition: ResolvedAnnotationShape,
    attribute: Attribute,
    nodeAttributes: readonly Attribute[],
    index: number,
  ): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [...this.constraints.validate(attribute.constraints, this.path(definition).index(index))];
    const hasSharedKey: boolean = nodeAttributes.some((item: Attribute): boolean => item.isKey === true);

    if (attribute.isKey && hasSharedKey) {
      diagnostics.push(
        this.error(definition, VALIDATION_ERROR.ATTRIBUTE_MULTIPLE_KEYS, 'An annotation property cannot add a second node key.'),
      );
    }
    return diagnostics;
  }

  private static validateBounds(definition: ResolvedAnnotationShape, attribute: Attribute): readonly Diagnostic[] {
    const coherent: boolean = Cardinality.areBoundsCoherent(attribute.bounds);
    const invalidKey: boolean = this.hasInvalidKeyBounds(attribute, attribute.bounds);
    if (coherent && !invalidKey) return [];

    return [
      this.error(
        definition,
        RAMEN_VALIDATION_ERROR.ANNOTATION_BOUNDS_INVALID,
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

  private static error(
    definition: ResolvedAnnotationShape,
    code: VALIDATION_ERROR | RAMEN_VALIDATION_ERROR,
    message: string,
  ): Diagnostic {
    return Diagnostics.error({
      code,
      message,
      ref: definition.annotation.id,
      path: this.path(definition),
    });
  }

  private static path(definition: ResolvedAnnotationShape): DiagnosticPath {
    return DiagnosticPath.root()
      .property('models')
      .property(definition.modelId)
      .property('annotations')
      .property(definition.annotation.id)
      .property('properties');
  }
}
