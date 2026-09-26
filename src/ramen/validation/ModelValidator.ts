import { AnnotationProperties } from '../project/AnnotationProperties';
import { RamenRelationScope } from '../project/RelationScope';
import { DiagnosticPath, Diagnostics, ModelRef, ModelValidator, ProjectGraph, VALIDATION_ERROR } from '../../model/index';
import { Cardinality } from '../../model/validation/Cardinality';
import type {
  Bounds,
  Diagnostic,
  Model,
  Node,
  Relation,
  Id,
  ProjectValidationResult,
  Ref,
  ResolvedModelElement,
} from '../../model/index';
import { RamenAnnotation, RamenAnnotationRelation, RamenAnnotations } from '../model/Annotations';
import { RamenModelFormat } from '../model/Document';
import { RAMEN_MODEL } from '../model/ReferenceModel';
import { RamenAnnotationGraph, ResolvedRamenAnnotation } from '../project/AnnotationGraph';
import { RamenProjectSchemaValidator } from './ProjectSchema';

/** Stable diagnostic codes emitted while validating RAMEN project models. */
export const RAMEN_VALIDATION_ERROR: Readonly<{
  RELATION_SCOPE_INVALID: 'RAMEN_RELATION_SCOPE_INVALID';
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
  RELATION_SCOPE_INVALID: 'RAMEN_RELATION_SCOPE_INVALID',
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

/** Validates the RAMEN model format first and then the closed annotation definitions. */
export class RamenValidator {
  public constructor(private readonly models: ModelValidator = new ModelValidator()) {}

  /** Validates a complete RAMEN project and exposes its graph only on success. */
  public validateProject(rootModelId: Id, inputs: readonly unknown[]): ProjectValidationResult {
    const documentErrors: readonly Diagnostic[] = this.validateDocuments(inputs);
    if (documentErrors.length > 0) return { valid: false, hasErrors: true, diagnostics: documentErrors };

    const normalized: readonly unknown[] = inputs.map((input: unknown): unknown =>
      RamenModelFormat.isDocument(input) ? RamenModelFormat.toGeneric(input) : input,
    );
    const result: ProjectValidationResult = this.models.validateProject(rootModelId, normalized);
    if (!result.valid) return result;
    const requirements: readonly Diagnostic[] = this.validateRequirements(rootModelId, inputs, result.graph);
    if (requirements.length > 0) return { valid: false, hasErrors: true, diagnostics: requirements };

    const diagnostics: readonly Diagnostic[] = [
      ...new RamenRelationScope(result.graph, inputs as readonly Model[]).validate(),
      ...this.validateAnnotations(result.graph, inputs as readonly Model[]),
    ];
    if (diagnostics.length === 0) return result;
    return { valid: false, hasErrors: true, diagnostics: [...result.diagnostics, ...diagnostics] };
  }

  private validateRequirements(rootModelId: Id, inputs: readonly unknown[], graph: ProjectGraph): readonly Diagnostic[] {
    const root: unknown = inputs.find(
      (input: unknown): boolean => typeof input === 'object' && input !== null && 'id' in input && input.id === rootModelId,
    );
    if (!RamenModelFormat.isDocument(root)) {
      return [
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.PROJECT_FORMAT_REQUIRED,
          message: `Root model '${rootModelId}' must use the RAMEN project format.`,
          path: DiagnosticPath.root().property('$schema'),
          ref: rootModelId,
        }),
      ];
    }
    if (!graph.getModels().some((model: Model): boolean => model.id === RAMEN_MODEL.id)) {
      return [
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.BASE_MODEL_REQUIRED,
          message: `RAMEN project '${rootModelId}' must import RAMEN '${RAMEN_MODEL.id}' directly or transitively.`,
          path: DiagnosticPath.root().property('imports'),
          ref: RAMEN_MODEL.id,
        }),
      ];
    }

    return [];
  }

  private validateDocuments(inputs: readonly unknown[]): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    inputs.forEach((input: unknown, index: number): void => {
      if (!RamenModelFormat.isDocument(input)) return;
      const path: DiagnosticPath = DiagnosticPath.root().property('models').index(index);

      if (!RamenAnnotations.hasValidSection(input)) {
        diagnostics.push(
          Diagnostics.error({
            code: RAMEN_VALIDATION_ERROR.ANNOTATIONS_INVALID,
            message: `Model '${input.id}' has invalid annotation definitions.`,
            path: path.property('annotations'),
            ref: input.id,
          }),
        );
      } else if (!RamenProjectSchemaValidator.isValid(input)) {
        diagnostics.push(
          Diagnostics.error({
            code: VALIDATION_ERROR.SCHEMA_INVALID,
            message: `Model '${input.id}' does not match the RAMEN project schema.`,
            path: path,
            ref: input.id,
          }),
        );
      }
    });

    return diagnostics;
  }

  private validateAnnotations(graph: ProjectGraph, models: readonly Model[]): readonly Diagnostic[] {
    const annotations: RamenAnnotationGraph = new RamenAnnotationGraph(graph, models);
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
    annotations: RamenAnnotationGraph,
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
    annotations: RamenAnnotationGraph,
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
    annotations: RamenAnnotationGraph,
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
