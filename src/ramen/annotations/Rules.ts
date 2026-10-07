import { AnnotationProperties } from './Properties';
import {
  DiagnosticPath,
  Diagnostics,
  type Diagnostic,
  ModelRef,
  ProjectGraph,
  type ResolvedElement,
  type Bounds,
  type Model,
  type Node,
  type Relation,
  type Id,
  type Ref,
} from '../../model';

import { ModelIdentifiers } from '../../model/graph/Identifiers';

import { Cardinality } from '../../model/validation/Cardinality';

import { RamenAnnotation, AnnotationRelation } from './Definitions';
import { AnnotationIndex, ResolvedAnnotation } from './AnnotationIndex';

/** Stable diagnostic codes emitted while validating RAMEN project models. */
export enum RAMEN_VALIDATION_ERROR {
  /** The root model is not a RAMEN project document. */
  PROJECT_FORMAT_REQUIRED = 'RAMEN_PROJECT_FORMAT_REQUIRED',
  /** A RAMEN project does not import the RAMEN reference model. */
  BASE_MODEL_REQUIRED = 'RAMEN_BASE_MODEL_REQUIRED',
  /** The `annotations` section does not match its schema. */
  ANNOTATIONS_INVALID = 'RAMEN_ANNOTATIONS_INVALID',
  /** An annotation definition reuses an ID already declared in its model. */
  ANNOTATION_ID_DUPLICATE = 'RAMEN_ANNOTATION_ID_DUPLICATE',
  /** An annotation type name is empty. */
  ANNOTATION_TYPE_EMPTY = 'RAMEN_ANNOTATION_TYPE_EMPTY',
  /** A type is declared twice for one Annotation node or redeclares an inherited type. */
  ANNOTATION_TYPE_DUPLICATE = 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
  /** A type belongs to a node that does not refine RAMEN Annotation. */
  ANNOTATION_NODE_INVALID = 'RAMEN_ANNOTATION_NODE_INVALID',
  /** A property has an invalid reference, name or data type, duplicates another property, or omits a required node property. */
  ANNOTATION_PROPERTY_INVALID = 'RAMEN_ANNOTATION_PROPERTY_INVALID',
  /** A selected relationship is missing, incompatible, repeated or overlaps another selected relationship. */
  ANNOTATION_RELATION_INVALID = 'RAMEN_ANNOTATION_RELATION_INVALID',
  /** A type's property or relationship bounds are invalid or widen their modelled bounds. */
  ANNOTATION_BOUNDS_INVALID = 'RAMEN_ANNOTATION_BOUNDS_INVALID',
}

interface RelationIndex {
  readonly selected: Set<string>;
  readonly ancestors: Set<string>;
}

/** Applies only the additional rules of RAMEN annotation definitions. */
export class RamenAnnotationRules {
  public validate(graph: ProjectGraph, models: readonly Model[]): readonly Diagnostic[] {
    const annotations: AnnotationIndex = new AnnotationIndex(graph, models);
    const diagnostics: Diagnostic[] = [];
    const identifiers: ReadonlyMap<Id, ModelIdentifiers> = new Map<Id, ModelIdentifiers>(
      graph.getModels().map((model: Model): [Id, ModelIdentifiers] => [model.id, new ModelIdentifiers(model)]),
    );
    const ownerTypes: Set<string> = new Set<string>();

    for (const resolved of annotations.getAll()) {
      this.validateAnnotation(graph, annotations, resolved, identifiers, ownerTypes, diagnostics);
    }

    this.validateInheritedProperties(graph, annotations, diagnostics);
    return diagnostics;
  }

  private validateInheritedProperties(graph: ProjectGraph, annotations: AnnotationIndex, diagnostics: Diagnostic[]): void {
    for (const owner of graph.getAvailableNodes(graph.getRootModel().id)) {
      if (owner.element.superTypes.length === 0) continue;
      for (const definition of annotations.getEffective(owner.modelId, owner.element.id)) {
        const declared: ResolvedElement<Node> | undefined = graph.resolveNode(
          definition.modelId,
          definition.annotation.annotationId,
        );
        if (declared?.modelId === owner.modelId && declared.element.id === owner.element.id) continue;
        diagnostics.push(...AnnotationProperties.validateRequired(graph, definition, owner));
      }
    }
  }

  private validateAnnotation(
    graph: ProjectGraph,
    annotations: AnnotationIndex,
    resolved: ResolvedAnnotation,
    identifiers: ReadonlyMap<Id, ModelIdentifiers>,
    ownerTypes: Set<string>,
    diagnostics: Diagnostic[],
  ): void {
    const definition: RamenAnnotation = resolved.annotation;
    const path: DiagnosticPath = this.path(resolved.modelId, definition.id);

    this.registerIdentifier(resolved, identifiers, path, diagnostics);
    const owner: ResolvedElement<Node> | undefined = graph.resolveNode(resolved.modelId, definition.annotationId);
    if (!owner || !annotations.isAnnotationNode(owner.modelId, owner.element.id)) {
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_NODE_INVALID,
        `Annotation '${definition.type}' must belong to a node refining RAMEN Annotation.`,
        path,
        definition.id,
      );

      return;
    }

    if (definition.type.trim().length === 0)
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_TYPE_EMPTY,
        'Annotation type must not be empty.',
        path,
        definition.id,
      );

    this.registerOwnerType(resolved.modelId, definition, owner, ownerTypes, path, diagnostics);
    diagnostics.push(...AnnotationProperties.validate(graph, resolved, owner));
    this.validateRelations(graph, resolved, owner, diagnostics);
    this.validateInheritedType(graph, annotations, resolved, owner, diagnostics);
  }

  private registerIdentifier(
    resolved: ResolvedAnnotation,
    identifiers: ReadonlyMap<Id, ModelIdentifiers>,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const index: ModelIdentifiers | undefined = identifiers.get(resolved.modelId);
    if (!index) return;
    diagnostics.push(...index.register(resolved.annotation, path, RAMEN_VALIDATION_ERROR.ANNOTATION_ID_DUPLICATE));
    for (const [propertyIndex, property] of resolved.annotation.properties.entries()) {
      if ('attributeId' in property) continue;
      diagnostics.push(...index.register(property, path.property('properties').index(propertyIndex)));
    }
  }

  private registerOwnerType(
    modelId: Id,
    definition: RamenAnnotation,
    owner: ResolvedElement<Node>,
    ownerTypes: Set<string>,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const ownerType: string = `${modelId}:${owner.modelId}:${owner.element.id}:${definition.type}`;
    if (ownerTypes.has(ownerType))
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_TYPE_DUPLICATE,
        `Annotation type '${definition.type}' is declared more than once for '${owner.element.name}'.`,
        path,
        definition.id,
      );
    ownerTypes.add(ownerType);
  }

  private validateRelations(
    graph: ProjectGraph,
    resolved: ResolvedAnnotation,
    owner: ResolvedElement<Node>,
    diagnostics: Diagnostic[],
  ): void {
    const seen: RelationIndex = { selected: new Set<string>(), ancestors: new Set<string>() };

    for (const requirement of resolved.annotation.relations) {
      this.validateRelation(graph, resolved, owner, requirement, seen, diagnostics);
    }
  }

  private validateRelation(
    graph: ProjectGraph,
    resolved: ResolvedAnnotation,
    owner: ResolvedElement<Node>,
    requirement: AnnotationRelation,
    seen: RelationIndex,
    diagnostics: Diagnostic[],
  ): void {
    const refs: readonly Ref[] = requirement.relationIds;
    const relations: readonly (ResolvedElement<Relation> | undefined)[] = refs.map(
      (ref: Ref): ResolvedElement<Relation> | undefined => graph.resolveRelation(resolved.modelId, ref),
    );
    const validEndpoint: boolean = relations.every((relation: ResolvedElement<Relation> | undefined): boolean => {
      const endpoint: Ref | undefined = this.annotationEnd(relation, requirement.direction);
      return relation !== undefined && endpoint !== undefined && graph.acceptsNode(relation.modelId, endpoint, owner);
    });
    const bounds: readonly Bounds[] = relations.flatMap((relation: ResolvedElement<Relation> | undefined): Bounds[] => {
      const bound: Bounds | undefined = this.targetBounds(relation, requirement.direction);
      return bound ? [bound] : [];
    });
    const modelledBounds: Bounds = {
      lowerBound: bounds.reduce((sum: number, value: Bounds): number => sum + value.lowerBound, 0),
      upperBound: bounds.some((value: Bounds): boolean => value.upperBound === -1)
        ? -1
        : bounds.reduce((sum: number, value: Bounds): number => sum + value.upperBound, 0),
    };
    const duplicate: boolean = this.overlaps(graph, relations, requirement.direction, seen);
    const path: DiagnosticPath = this.path(resolved.modelId, resolved.annotation.id).property('relations');
    this.validateRelationShape(resolved, requirement, relations[0], modelledBounds, validEndpoint, duplicate, path, diagnostics);
  }

  private overlaps(
    graph: ProjectGraph,
    relations: readonly (ResolvedElement<Relation> | undefined)[],
    direction: AnnotationRelation['direction'],
    seen: RelationIndex,
  ): boolean {
    let overlap: boolean = false;
    const prefix: string = `${direction}:`;

    for (const relation of relations) {
      if (!relation) continue;
      const key: string = `${prefix}${ModelRef.qualify(relation.modelId, relation.element.id)}`;
      const ancestors: readonly string[] = graph
        .getRelationAncestors(relation.modelId, relation.element.id)
        .map((item: ResolvedElement<Relation>): string => `${prefix}${ModelRef.qualify(item.modelId, item.element.id)}`);

      if (
        seen.selected.has(key) ||
        seen.ancestors.has(key) ||
        ancestors.some((ancestor: string): boolean => seen.selected.has(ancestor))
      )
        overlap = true;
      seen.selected.add(key);
      for (const ancestor of ancestors) seen.ancestors.add(ancestor);
    }
    return overlap;
  }

  private validateRelationShape(
    resolved: ResolvedAnnotation,
    requirement: AnnotationRelation,
    relation: ResolvedElement<Relation> | undefined,
    modelledBounds: Bounds | undefined,
    validEndpoint: boolean,
    duplicate: boolean,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    if (!relation || !validEndpoint || duplicate) {
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_RELATION_INVALID,
        `Annotation relations '${requirement.relationIds.join(', ')}' must select applicable, non-overlapping relations exactly once.`,
        path,
        resolved.annotation.id,
      );
    } else if (!modelledBounds || !this.narrows(requirement.bounds, modelledBounds)) {
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_BOUNDS_INVALID,
        `Annotation relation '${relation.element.name}' must narrow its modelled target bounds.`,
        path,
        resolved.annotation.id,
      );
    }
  }

  private annotationEnd(relation: ResolvedElement<Relation> | undefined, direction: 'outgoing' | 'incoming'): Ref | undefined {
    if (!relation) return undefined;
    return direction === 'outgoing' ? relation.element.from.nodeId : relation.element.to.nodeId;
  }

  private targetBounds(relation: ResolvedElement<Relation> | undefined, direction: 'outgoing' | 'incoming'): Bounds | undefined {
    if (!relation) return undefined;
    return direction === 'outgoing' ? relation.element.to.bounds : relation.element.from.bounds;
  }

  private validateInheritedType(
    graph: ProjectGraph,
    annotations: AnnotationIndex,
    resolved: ResolvedAnnotation,
    owner: ResolvedElement<Node>,
    diagnostics: Diagnostic[],
  ): void {
    const inherited: ResolvedAnnotation | undefined = this.findInheritedAnnotation(graph, annotations, resolved, owner);
    if (!inherited) return;
    this.error(
      diagnostics,
      RAMEN_VALIDATION_ERROR.ANNOTATION_TYPE_DUPLICATE,
      `Annotation type '${resolved.annotation.type}' is already inherited from an ancestor.`,
      this.path(resolved.modelId, resolved.annotation.id).property('type'),
      resolved.annotation.id,
    );
  }

  private findInheritedAnnotation(
    graph: ProjectGraph,
    annotations: AnnotationIndex,
    current: ResolvedAnnotation,
    owner: ResolvedElement<Node>,
  ): ResolvedAnnotation | undefined {
    for (const candidate of annotations.getApplicable(current.modelId, current.annotation.annotationId)) {
      if (candidate.annotation.type !== current.annotation.type) continue;
      if (candidate.modelId === current.modelId) {
        const candidateOwner: ResolvedElement<Node> | undefined = graph.resolveNode(
          candidate.modelId,
          candidate.annotation.annotationId,
        );
        if (candidateOwner?.modelId === owner.modelId && candidateOwner.element.id === owner.element.id) continue;
      }
      return candidate;
    }
    return undefined;
  }

  private narrows(actual: Bounds, modelled: Bounds): boolean {
    return Cardinality.isModelBoundsCompatible(modelled, actual);
  }

  private path(modelId: Id, annotationId: Id): DiagnosticPath {
    return DiagnosticPath.root().property('models').property(modelId).property('annotations').property(annotationId);
  }

  private error(diagnostics: Diagnostic[], code: string, message: string, path: DiagnosticPath, ref: Id): void {
    diagnostics.push(Diagnostics.error({ code: code, message: message, path: path, ref: ref }));
  }
}
