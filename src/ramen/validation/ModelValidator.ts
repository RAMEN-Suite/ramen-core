import { DiagnosticPath, Diagnostics, EffectiveModel, ModelRef, ModelValidator, ProjectGraph } from '../../gcore/index';
import { ModelSemantics } from '../../gcore/validation/Semantics';
import type {
  Bounds,
  Diagnostic,
  GAttribute,
  GModel,
  GNode,
  GRelation,
  Id,
  ProjectValidationResult,
  Ref,
  ResolvedModelElement,
} from '../../gcore/index';
import { RamenAnnotation, RamenAnnotationProperty, RamenAnnotationRelation, RamenAnnotations } from '../model/Annotations';
import { RAMEN_MODEL } from '../model/ReferenceModel';
import { RamenAnnotationGraph, ResolvedRamenAnnotation } from '../project/AnnotationGraph';

/** Stable diagnostic codes emitted while validating RAMEN project models. */
export const RAMEN_VALIDATION_ERROR: Readonly<{
  BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED';
  ANNOTATIONS_INVALID: 'RAMEN_ANNOTATIONS_INVALID';
  ANNOTATION_ID_DUPLICATE: 'RAMEN_ANNOTATION_ID_DUPLICATE';
  ANNOTATION_TYPE_EMPTY: 'RAMEN_ANNOTATION_TYPE_EMPTY';
  ANNOTATION_TYPE_DUPLICATE: 'RAMEN_ANNOTATION_TYPE_DUPLICATE';
  ANNOTATION_NODE_INVALID: 'RAMEN_ANNOTATION_NODE_INVALID';
  ANNOTATION_REFINES_INVALID: 'RAMEN_ANNOTATION_REFINES_INVALID';
  ANNOTATION_REFINEMENT_REQUIRED: 'RAMEN_ANNOTATION_REFINEMENT_REQUIRED';
  ANNOTATION_PROPERTY_INVALID: 'RAMEN_ANNOTATION_PROPERTY_INVALID';
  ANNOTATION_RELATION_INVALID: 'RAMEN_ANNOTATION_RELATION_INVALID';
  ANNOTATION_BOUNDS_INVALID: 'RAMEN_ANNOTATION_BOUNDS_INVALID';
  ANNOTATION_RELATION_EXTENSION: 'RAMEN_ANNOTATION_RELATION_EXTENSION';
}> = {
  BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED',
  ANNOTATIONS_INVALID: 'RAMEN_ANNOTATIONS_INVALID',
  ANNOTATION_ID_DUPLICATE: 'RAMEN_ANNOTATION_ID_DUPLICATE',
  ANNOTATION_TYPE_EMPTY: 'RAMEN_ANNOTATION_TYPE_EMPTY',
  ANNOTATION_TYPE_DUPLICATE: 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
  ANNOTATION_NODE_INVALID: 'RAMEN_ANNOTATION_NODE_INVALID',
  ANNOTATION_REFINES_INVALID: 'RAMEN_ANNOTATION_REFINES_INVALID',
  ANNOTATION_REFINEMENT_REQUIRED: 'RAMEN_ANNOTATION_REFINEMENT_REQUIRED',
  ANNOTATION_PROPERTY_INVALID: 'RAMEN_ANNOTATION_PROPERTY_INVALID',
  ANNOTATION_RELATION_INVALID: 'RAMEN_ANNOTATION_RELATION_INVALID',
  ANNOTATION_BOUNDS_INVALID: 'RAMEN_ANNOTATION_BOUNDS_INVALID',
  ANNOTATION_RELATION_EXTENSION: 'RAMEN_ANNOTATION_RELATION_EXTENSION',
} as const;

/** Validates GCore first and then the closed RAMEN annotation definitions. */
export class RamenValidator {
  public constructor(private readonly models: ModelValidator = new ModelValidator()) {}

  /** Validates a complete RAMEN project and exposes its graph only on success. */
  public validateProject(rootModelId: Id, inputs: readonly unknown[]): ProjectValidationResult {
    const result: ProjectValidationResult = this.models.validateProject(rootModelId, inputs);
    if (!result.valid) return result;
    if (!result.graph.getModels().some((model: GModel): boolean => model.id === RAMEN_MODEL.id)) {
      return {
        valid: false,
        hasErrors: true,
        diagnostics: [
          Diagnostics.error({
            code: RAMEN_VALIDATION_ERROR.BASE_MODEL_REQUIRED,
            message: `RAMEN project '${rootModelId}' must import RAMEN '${RAMEN_MODEL.id}' directly or transitively.`,
            path: DiagnosticPath.root().property('imports'),
            ref: RAMEN_MODEL.id,
          }),
        ],
      };
    }
    const diagnostics: readonly Diagnostic[] = this.validateAnnotations(result.graph);
    if (diagnostics.length === 0) return result;
    return { valid: false, hasErrors: true, diagnostics: [...result.diagnostics, ...diagnostics] };
  }

  private validateAnnotations(graph: ProjectGraph): readonly Diagnostic[] {
    const annotations: RamenAnnotationGraph = new RamenAnnotationGraph(graph);
    const diagnostics: Diagnostic[] = [];
    const identifiers: Set<string> = new Set<string>();
    const ownerTypes: Set<string> = new Set<string>();
    for (const model of graph.getModels()) {
      if (RamenAnnotations.hasValidSection(model)) continue;
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATIONS_INVALID,
        `Model '${model.id}' has an invalid RAMEN annotations section.`,
        DiagnosticPath.root().property('models').property(model.id).property('ext').property('ramen').property('annotations'),
        model.id,
      );
    }
    for (const resolved of annotations.getAll()) {
      this.validateAnnotation(graph, annotations, resolved, identifiers, ownerTypes, diagnostics);
    }
    return diagnostics;
  }

  private validateAnnotation(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    resolved: ResolvedRamenAnnotation,
    identifiers: Set<string>,
    ownerTypes: Set<string>,
    diagnostics: Diagnostic[],
  ): void {
    const definition: RamenAnnotation = resolved.annotation;
    const path: DiagnosticPath = this.path(resolved.modelId, definition.id);
    this.registerIdentifier(resolved, identifiers, path, diagnostics);
    const owner: ResolvedModelElement<GNode> | undefined = graph.resolveNode(resolved.modelId, definition.annotationId);
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
    this.registerOwnerType(definition, owner, ownerTypes, path, diagnostics);
    this.validateProperties(graph, resolved, owner, diagnostics);
    this.validateRelations(graph, annotations, resolved, owner, diagnostics);
    this.validateRefinement(graph, annotations, resolved, owner, diagnostics);
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
    definition: RamenAnnotation,
    owner: ResolvedModelElement<GNode>,
    ownerTypes: Set<string>,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const ownerType: string = `${owner.modelId}:${owner.element.id}:${definition.type}`;
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

  private validateProperties(
    graph: ProjectGraph,
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<GNode>,
    diagnostics: Diagnostic[],
  ): void {
    const attributes: readonly GAttribute[] =
      EffectiveModel.resolveNode(graph, owner.modelId, owner.element.id)?.attributes ?? [];
    const seen: Set<Id> = new Set<Id>();
    for (const property of resolved.annotation.properties) {
      const attributeId: Id = this.refId(property.attributeId);
      const attribute: GAttribute | undefined = attributes.find((candidate: GAttribute): boolean => candidate.id === attributeId);
      const path: DiagnosticPath = this.path(resolved.modelId, resolved.annotation.id).property('properties');
      if (!attribute || seen.has(attributeId)) {
        this.error(
          diagnostics,
          RAMEN_VALIDATION_ERROR.ANNOTATION_PROPERTY_INVALID,
          `Annotation property '${property.attributeId}' must reference one effective attribute exactly once.`,
          path,
          resolved.annotation.id,
        );
      } else if (property.bounds && !this.narrows(property.bounds, attribute.bounds)) {
        this.error(
          diagnostics,
          RAMEN_VALIDATION_ERROR.ANNOTATION_BOUNDS_INVALID,
          `Annotation property '${attribute.name}' must narrow its modeled bounds.`,
          path,
          resolved.annotation.id,
        );
      }
      seen.add(attributeId);
    }
  }

  private validateRelations(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<GNode>,
    diagnostics: Diagnostic[],
  ): void {
    const seen: Set<string> = new Set<string>();
    const parent: ResolvedRamenAnnotation | undefined = resolved.annotation.refines
      ? annotations.resolve(resolved.modelId, resolved.annotation.refines)
      : undefined;
    for (const requirement of resolved.annotation.relations) {
      this.validateRelation(graph, annotations, resolved, owner, parent, requirement, seen, diagnostics);
    }
  }

  private validateRelation(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<GNode>,
    parent: ResolvedRamenAnnotation | undefined,
    requirement: RamenAnnotationRelation,
    seen: Set<string>,
    diagnostics: Diagnostic[],
  ): void {
    const key: string = `${requirement.direction}:${requirement.relationId}`;
    const relation: ResolvedModelElement<GRelation> | undefined = graph.resolveRelation(resolved.modelId, requirement.relationId);
    const endpointRef: Ref | undefined = this.annotationEnd(relation, requirement.direction);
    const validEndpoint: boolean =
      relation !== undefined && endpointRef !== undefined ? graph.acceptsNode(relation.modelId, endpointRef, owner) : false;
    const modeledBounds: Bounds | undefined = this.targetBounds(relation, requirement.direction);
    const path: DiagnosticPath = this.path(resolved.modelId, resolved.annotation.id).property('relations');
    this.validateRelationShape(resolved, requirement, relation, modeledBounds, validEndpoint, seen.has(key), path, diagnostics);
    if (parent) this.validateRefinedRelation(graph, annotations, resolved, parent, requirement, path, diagnostics);
    seen.add(key);
  }

  private validateRelationShape(
    resolved: ResolvedRamenAnnotation,
    requirement: RamenAnnotationRelation,
    relation: ResolvedModelElement<GRelation> | undefined,
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
        `Annotation relation '${requirement.relationId}' must reference one applicable relation exactly once.`,
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
    relation: ResolvedModelElement<GRelation> | undefined,
    direction: 'outgoing' | 'incoming',
  ): Ref | undefined {
    if (!relation) return undefined;
    return direction === 'outgoing' ? relation.element.from.nodeId : relation.element.to.nodeId;
  }

  private targetBounds(
    relation: ResolvedModelElement<GRelation> | undefined,
    direction: 'outgoing' | 'incoming',
  ): Bounds | undefined {
    if (!relation) return undefined;
    return direction === 'outgoing' ? relation.element.to.bounds : relation.element.from.bounds;
  }

  private validateRefinement(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<GNode>,
    diagnostics: Diagnostic[],
  ): void {
    const path: DiagnosticPath = this.path(resolved.modelId, resolved.annotation.id).property('refines');
    const parent: ResolvedRamenAnnotation | undefined = resolved.annotation.refines
      ? annotations.resolve(resolved.modelId, resolved.annotation.refines)
      : undefined;
    const inherited: ResolvedRamenAnnotation | undefined = this.findInheritedAnnotation(
      graph,
      annotations,
      owner,
      resolved.annotation.type,
    );
    if (!resolved.annotation.refines && inherited) {
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_REFINEMENT_REQUIRED,
        `Annotation '${resolved.annotation.type}' already exists on an ancestor; refine it explicitly.`,
        path,
        resolved.annotation.id,
      );
      return;
    }
    if (!resolved.annotation.refines) return;
    if (!this.isValidRefinement(graph, resolved, owner, parent)) {
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_REFINES_INVALID,
        'Annotation refinement must preserve its type and belong to a refined Annotation node.',
        path,
        resolved.annotation.id,
      );
      return;
    }
    if (parent) this.validateRefinedProperties(annotations, resolved, parent, diagnostics);
  }

  private validateRefinedProperties(
    annotations: RamenAnnotationGraph,
    resolved: ResolvedRamenAnnotation,
    parent: ResolvedRamenAnnotation,
    diagnostics: Diagnostic[],
  ): void {
    for (const property of resolved.annotation.properties) {
      const inherited: RamenAnnotationProperty | undefined = this.findParentProperty(annotations, parent, property.attributeId);
      if (!property.bounds || !inherited?.bounds || this.narrows(property.bounds, inherited.bounds)) continue;
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_BOUNDS_INVALID,
        `Refined annotation '${resolved.annotation.type}' must narrow inherited property cardinality.`,
        this.path(resolved.modelId, resolved.annotation.id).property('properties'),
        resolved.annotation.id,
      );
    }
  }

  private findParentProperty(
    annotations: RamenAnnotationGraph,
    parent: ResolvedRamenAnnotation,
    attributeRef: Ref,
  ): RamenAnnotationProperty | undefined {
    const attributeId: Id = this.refId(attributeRef);
    for (const current of annotations.getRefinementLineage(parent)) {
      const inherited: RamenAnnotationProperty | undefined = current.annotation.properties.find(
        (property: RamenAnnotationProperty): boolean => this.refId(property.attributeId) === attributeId,
      );
      if (inherited) return inherited;
    }
    return undefined;
  }

  private findInheritedAnnotation(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    owner: ResolvedModelElement<GNode>,
    type: string,
  ): ResolvedRamenAnnotation | undefined {
    for (const ancestor of graph.getNodeAncestors(owner.modelId, owner.element.id)) {
      const annotation: RamenAnnotation | undefined = annotations
        .getDeclared(ancestor.modelId)
        .find((candidate: RamenAnnotation): boolean => candidate.annotationId === ancestor.element.id && candidate.type === type);
      if (annotation) return { modelId: ancestor.modelId, annotation: annotation };
    }
    return undefined;
  }

  private isValidRefinement(
    graph: ProjectGraph,
    resolved: ResolvedRamenAnnotation,
    owner: ResolvedModelElement<GNode>,
    parent: ResolvedRamenAnnotation | undefined,
  ): boolean {
    if (parent?.annotation.type !== resolved.annotation.type) return false;
    const parentOwner: ResolvedModelElement<GNode> | undefined = graph.resolveNode(
      parent.modelId,
      parent.annotation.annotationId,
    );
    if (!parentOwner) return false;
    if (owner.modelId === parentOwner.modelId && owner.element.id === parentOwner.element.id) return false;
    return graph.isNodeSameOrSubtype(owner, parentOwner);
  }

  private validateRefinedRelation(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    resolved: ResolvedRamenAnnotation,
    parent: ResolvedRamenAnnotation,
    requirement: RamenAnnotationRelation,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const inherited: RamenAnnotationRelation | undefined = this.findParentRelation(
      graph,
      annotations,
      resolved.modelId,
      parent,
      requirement,
    );
    if (!inherited)
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_RELATION_EXTENSION,
        `Refined annotation '${resolved.annotation.type}' cannot introduce relation '${requirement.relationId}'.`,
        path,
        resolved.annotation.id,
      );
    else if (!this.narrows(requirement.bounds, inherited.bounds))
      this.error(
        diagnostics,
        RAMEN_VALIDATION_ERROR.ANNOTATION_BOUNDS_INVALID,
        `Refined annotation '${resolved.annotation.type}' must narrow inherited relation cardinality.`,
        path,
        resolved.annotation.id,
      );
  }

  private findParentRelation(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    actualModelId: Id,
    parent: ResolvedRamenAnnotation,
    requirement: RamenAnnotationRelation,
  ): RamenAnnotationRelation | undefined {
    for (const current of annotations.getRefinementLineage(parent)) {
      const modelId: Id = current.modelId;
      const inherited: RamenAnnotationRelation | undefined = current.annotation.relations.find(
        (candidate: RamenAnnotationRelation): boolean =>
          candidate.direction === requirement.direction &&
          graph.isRelationRefSameOrSubtype(actualModelId, requirement.relationId, modelId, candidate.relationId),
      );
      if (inherited) return inherited;
    }
    return undefined;
  }

  private narrows(actual: Bounds, modeled: Bounds): boolean {
    return ModelSemantics.isModelBoundsCompatible(modeled, actual);
  }

  private refId(reference: Ref): Id {
    return ModelRef.localId(reference);
  }

  private path(modelId: Id, annotationId: Id): DiagnosticPath {
    return DiagnosticPath.root()
      .property('models')
      .property(modelId)
      .property('ext')
      .property('ramen')
      .property('annotations')
      .property(annotationId);
  }

  private error(diagnostics: Diagnostic[], code: string, message: string, path: DiagnosticPath, ref: Id): void {
    diagnostics.push(Diagnostics.error({ code: code, message: message, path: path, ref: ref }));
  }
}
