import { BuiltinDataTypes } from '../../model/Builtins';
import { EffectiveModel, ModelRef, Diagnostics, DiagnosticPath } from '../../model/index';
import type { Attribute, Diagnostic, Node, ProjectGraph, ResolvedModelElement } from '../../model/index';
import { Cardinality } from '../../model/validation/Cardinality';
import type { RamenAnnotationProperty } from '../model/Annotations';
import type { ResolvedRamenAnnotation } from './AnnotationGraph';

/** Resolves node attribute selections and properties owned by an annotation type. */
export class AnnotationProperties {
  public static resolve(
    graph: ProjectGraph,
    definition: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<Node>,
  ): readonly Attribute[] {
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
    definition: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<Node>,
  ): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const names: Set<string> = new Set<string>();
    const ids: Set<string> = new Set<string>();
    const nodeAttributes: readonly Attribute[] =
      EffectiveModel.resolveNode(graph, owner.modelId, owner.element.id)?.attributes ?? [];
    for (const property of definition.annotation.properties) {
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
      names.add(attribute.name);
      ids.add(attribute.id);
    }
    return diagnostics;
  }

  private static selected(
    graph: ProjectGraph,
    owner: ResolvedModelElement<Node>,
    property: RamenAnnotationProperty,
  ): Attribute | undefined {
    return 'attributeId' in property ? this.find(graph, owner, property.attributeId) : property;
  }

  private static validateBounds(
    definition: ResolvedRamenAnnotation,
    attribute: Attribute,
    property: RamenAnnotationProperty,
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

  private static find(graph: ProjectGraph, owner: ResolvedModelElement<Node>, reference: string): Attribute | undefined {
    const lineage: readonly ResolvedModelElement<Node>[] = [owner, ...graph.getNodeAncestors(owner.modelId, owner.element.id)];
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

  private static error(definition: ResolvedRamenAnnotation, code: string, message: string): Diagnostic {
    return Diagnostics.error({
      code,
      message,
      ref: definition.annotation.id,
      path: DiagnosticPath.root()
        .property('models')
        .property(definition.modelId)
        .property('annotations')
        .property(definition.annotation.id)
        .property('properties'),
    });
  }
}
