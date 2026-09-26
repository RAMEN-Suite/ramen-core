import { AnnotationProperties } from './Properties';
import { DiagnosticPath, Diagnostics, ModelRef, ProjectGraph } from '../../model/index';
import { Cardinality } from '../../model/validation/Cardinality';
import type { Bounds, Diagnostic, Model, Node, Relation, Id, Ref, ResolvedModelElement } from '../../model/index';
import { RamenAnnotation, RamenAnnotationRelation, RamenAnnotations } from './Definitions';
import { RamenAnnotationIndex, ResolvedRamenAnnotation } from './AnnotationIndex';

/** Stable diagnostic codes emitted while validating RAMEN project models. */
export const RAMEN_VALIDATION_ERROR: Readonly<{
  RELATION_SCOPE_INVALID: 'RELATION_SCOPE_INVALID';
  BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED';
  ANNOTATIONS_INVALID: 'RAMEN_ANNOTATIONS_INVALID';
  ANNOTATION_ID_DUPLICATE: 'RAMEN_ANNOTATION_ID_DUPLICATE';
  ANNOTATION_TYPE_EMPTY: 'RAMEN_ANNOTATION_TYPE_EMPTY';
  ANNOTATION_TYPE_DUPLICATE: 'RAMEN_ANNOTATION_TYPE_DUPLICATE';
  ANNOTATION_NODE_INVALID: 'RAMEN_ANNOTATION_NODE_INVALID';
  ANNOTATION_PROPERTY_INVALID: 'RAMEN_ANNOTATION_PROPERTY_INVALID';
  ANNOTATION_RELATION_INVALID: 'RAMEN_ANNOTATION_RELATION_INVALID';
  ANNOTATION_BOUNDS_INVALID: 'RAMEN_ANNOTATION_BOUNDS_INVALID';
  PROJECT_FORMAT_REQUIRED: 'RAMEN_PROJECT_FORMAT_REQUIRED';
}> = {
  RELATION_SCOPE_INVALID: 'RELATION_SCOPE_INVALID',
  BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED',
  ANNOTATIONS_INVALID: 'RAMEN_ANNOTATIONS_INVALID',
  ANNOTATION_ID_DUPLICATE: 'RAMEN_ANNOTATION_ID_DUPLICATE',
  ANNOTATION_TYPE_EMPTY: 'RAMEN_ANNOTATION_TYPE_EMPTY',
  ANNOTATION_TYPE_DUPLICATE: 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
  ANNOTATION_NODE_INVALID: 'RAMEN_ANNOTATION_NODE_INVALID',
  ANNOTATION_PROPERTY_INVALID: 'RAMEN_ANNOTATION_PROPERTY_INVALID',
  ANNOTATION_RELATION_INVALID: 'RAMEN_ANNOTATION_RELATION_INVALID',
  ANNOTATION_BOUNDS_INVALID: 'RAMEN_ANNOTATION_BOUNDS_INVALID',
  PROJECT_FORMAT_REQUIRED: 'RAMEN_PROJECT_FORMAT_REQUIRED',
} as const;

/** Applies only the additional rules of RAMEN annotation definitions. */
export class RamenAnnotationRules {
  public validate(graph: ProjectGraph, models: readonly Model[]): readonly Diagnostic[] {
    const annotations: RamenAnnotationIndex = new RamenAnnotationIndex(graph, models);
    const diagnostics: Diagnostic[] = [];
    const identifiers: Set<string> = new Set<string>();
    const ownerTypes: Set<string> = new Set<string>();

    for (const resolved of annotations.getAll()) {
      this.validateAnnotation(graph, annotations, resolved, identifiers, ownerTypes, diagnostics);
    }
    return diagnostics;
  }

  private validateAnnotation(
    graph: ProjectGraph,
    annotations: RamenAnnotationIndex,
    resolved: ResolvedRamenAnnotation,
    identifiers: Set<string>,
    ownerTypes: Set<string>,
    diagnostics: Diagnostic[],
  ): void {
    const definition: RamenAnnotation = resolved.annotation;
    const path: DiagnosticPath = this.path(resolved.modelId, definition.id);

    this.registerIdentifier(resolved, identifiers, path, diagnostics);
    const owner: ResolvedModelElement<Node> | undefined = graph.resolveNode(resolved.modelId, definition.annotationId);
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
    resolved: ResolvedRamenAnnotation,
    identifiers: Set<string>,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const identity: string = `${resolved.modelId}:${resolved.annotation.id}`;
    if (identifiers.has(identity))
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_ID_DUPLICATE,
        'Duplicate annotation identifier.',
        path,
        resolved.annotation.id,
      );
    identifiers.add(identity);
  }

  private registerOwnerType(
    modelId: Id,
    definition: RamenAnnotation,
    owner: ResolvedModelElement<Node>,
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
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<Node>,
    diagnostics: Diagnostic[],
  ): void {
    const seen: Set<string> = new Set<string>();

    for (const requirement of resolved.annotation.relations) {
      this.validateRelation(graph, resolved, owner, requirement, seen, diagnostics);
    }
  }

  private validateRelation(
    graph: ProjectGraph,
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<Node>,
    requirement: RamenAnnotationRelation,
    seen: Set<string>,
    diagnostics: Diagnostic[],
  ): void {
    const refs: readonly Ref[] = RamenAnnotations.relationRefs(requirement);
    const relations: readonly (ResolvedModelElement<Relation> | undefined)[] = refs.map(
      (ref: Ref): ResolvedModelElement<Relation> | undefined => graph.resolveRelation(resolved.modelId, ref),
    );
    const validEndpoint: boolean = relations.every((relation: ResolvedModelElement<Relation> | undefined): boolean => {
      const endpoint: Ref | undefined = this.annotationEnd(relation, requirement.direction);
      return relation !== undefined && endpoint !== undefined && graph.acceptsNode(relation.modelId, endpoint, owner);
    });
    const bounds: readonly Bounds[] = relations.flatMap((relation: ResolvedModelElement<Relation> | undefined): Bounds[] => {
      const bound: Bounds | undefined = this.targetBounds(relation, requirement.direction);
      return bound ? [bound] : [];
    });
    const modeledBounds: Bounds = {
      lowerBound: bounds.reduce((sum: number, value: Bounds): number => sum + value.lowerBound, 0),
      upperBound: bounds.some((value: Bounds): boolean => value.upperBound === -1)
        ? -1
        : bounds.reduce((sum: number, value: Bounds): number => sum + value.upperBound, 0),
    };
    const duplicate: boolean = this.overlaps(graph, resolved.modelId, requirement, seen);
    const path: DiagnosticPath = this.path(resolved.modelId, resolved.annotation.id).property('relations');
    this.validateRelationShape(resolved, requirement, relations[0], modeledBounds, validEndpoint, duplicate, path, diagnostics);
  }

  private overlaps(graph: ProjectGraph, modelId: Id, requirement: RamenAnnotationRelation, seen: Set<string>): boolean {
    let overlap: boolean = false;
    const prefix: string = `${requirement.direction}:`;
    for (const ref of RamenAnnotations.relationRefs(requirement)) {
      const qualified: Ref = ModelRef.isQualified(ref) ? ref : ModelRef.qualify(modelId, ref);
      for (const previous of seen) {
        if (!previous.startsWith(prefix)) continue;
        const other: Ref = previous.slice(prefix.length);
        if (
          graph.isRelationRefSameOrSubtype(modelId, qualified, modelId, other) ||
          graph.isRelationRefSameOrSubtype(modelId, other, modelId, qualified)
        )
          overlap = true;
      }
      seen.add(`${prefix}${qualified}`);
    }
    return overlap;
  }

  private validateRelationShape(
    resolved: ResolvedRamenAnnotation,
    requirement: RamenAnnotationRelation,
    relation: ResolvedModelElement<Relation> | undefined,
    modeledBounds: Bounds | undefined,
    validEndpoint: boolean,
    duplicate: boolean,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    if (!relation || !validEndpoint || duplicate) {
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_RELATION_INVALID,
        `Annotation relation '${requirement.relationId}' must select applicable, non-overlapping relations exactly once.`,
        path,
        resolved.annotation.id,
      );
    } else if (!modeledBounds || !this.narrows(requirement.bounds, modeledBounds)) {
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_BOUNDS_INVALID,
        `Annotation relation '${relation.element.name}' must narrow its modeled target bounds.`,
        path,
        resolved.annotation.id,
      );
    }
  }

  private annotationEnd(
    relation: ResolvedModelElement<Relation> | undefined,
    direction: 'outgoing' | 'incoming',
  ): Ref | undefined {
    if (!relation) return undefined;
    return direction === 'outgoing' ? relation.element.from.nodeId : relation.element.to.nodeId;
  }

  private targetBounds(
    relation: ResolvedModelElement<Relation> | undefined,
    direction: 'outgoing' | 'incoming',
  ): Bounds | undefined {
    if (!relation) return undefined;
    return direction === 'outgoing' ? relation.element.to.bounds : relation.element.from.bounds;
  }

  private validateInheritedType(
    graph: ProjectGraph,
    annotations: RamenAnnotationIndex,
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<Node>,
    diagnostics: Diagnostic[],
  ): void {
    const inherited: ResolvedRamenAnnotation | undefined = this.findInheritedAnnotation(graph, annotations, resolved, owner);
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
    annotations: RamenAnnotationIndex,
    current: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<Node>,
  ): ResolvedRamenAnnotation | undefined {
    for (const candidate of annotations.getApplicable(current.modelId, current.annotation.annotationId)) {
      if (candidate.annotation.type !== current.annotation.type) continue;
      if (candidate.modelId === current.modelId) {
        const candidateOwner: ResolvedModelElement<Node> | undefined = graph.resolveNode(
          candidate.modelId,
          candidate.annotation.annotationId,
        );
        if (candidateOwner?.modelId === owner.modelId && candidateOwner.element.id === owner.element.id) continue;
      }
      return candidate;
    }
    return undefined;
  }

  private narrows(actual: Bounds, modeled: Bounds): boolean {
    return Cardinality.isModelBoundsCompatible(modeled, actual);
  }

  private path(modelId: Id, annotationId: Id): DiagnosticPath {
    return DiagnosticPath.root().property('models').property(modelId).property('annotations').property(annotationId);
  }

  private error(diagnostics: Diagnostic[], code: string, message: string, path: DiagnosticPath, ref: Id): void {
    diagnostics.push(Diagnostics.error({ code: code, message: message, path: path, ref: ref }));
  }
}
