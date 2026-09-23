import {
  DiagnosticPath,
  Diagnostics,
  EffectiveModel,
  InstanceSchemaValidator,
  InstanceValidator,
  ModelRef,
  ProjectGraph,
} from '../../model/index';
import type {
  Bounds,
  Diagnostic,
  Attribute,
  Model,
  Node,
  Id,
  ModelInstanceGraph,
  ModelInstanceNode,
  ModelInstanceRelation,
  ProjectValidationResult,
  Ref,
  ResolvedModelElement,
  ValidationResult,
} from '../../model/index';
import { RamenAnnotationProperty, RamenAnnotationRelation } from '../model/Annotations';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../model/ReferenceModel';
import { RamenAnnotationGraph, ResolvedRamenAnnotation } from '../project/AnnotationGraph';
import { RamenValidator } from './ModelValidator';

interface ResolvedAnnotationRelation {
  readonly modelId: Id;
  readonly relation: RamenAnnotationRelation;
}

/** Stable diagnostic codes emitted while validating RAMEN instances. */
export const RAMEN_INSTANCE_ERROR: Readonly<{
  ANNOTATION_REQUIRED: 'RAMEN_INSTANCE_ANNOTATION_REQUIRED';
  ANNOTATION_UNKNOWN: 'RAMEN_INSTANCE_ANNOTATION_UNKNOWN';
  ANNOTATION_PROPERTY_NOT_ALLOWED: 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED';
  ANNOTATION_PROPERTY_CARDINALITY: 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_CARDINALITY';
  ANNOTATION_RELATION_NOT_ALLOWED: 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_ALLOWED';
  ANNOTATION_RELATION_CARDINALITY: 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY';
}> = {
  ANNOTATION_REQUIRED: 'RAMEN_INSTANCE_ANNOTATION_REQUIRED',
  ANNOTATION_UNKNOWN: 'RAMEN_INSTANCE_ANNOTATION_UNKNOWN',
  ANNOTATION_PROPERTY_NOT_ALLOWED: 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED',
  ANNOTATION_PROPERTY_CARDINALITY: 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_CARDINALITY',
  ANNOTATION_RELATION_NOT_ALLOWED: 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_ALLOWED',
  ANNOTATION_RELATION_CARDINALITY: 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY',
} as const;

/** Validates a complete instance graph against the RAMEN model format and closed annotation definitions. */
export class RamenInstanceValidator {
  public constructor(
    private readonly projects: RamenValidator = new RamenValidator(),
    private readonly instances: InstanceValidator = new InstanceValidator(),
  ) {}

  /** Validates the project first and then validates a complete instance graph against it. */
  public validate(rootModelId: Id, models: readonly Model[], input: unknown): ValidationResult {
    const project: ProjectValidationResult = this.projects.validateProject(rootModelId, models);

    if (!project.valid) return { hasErrors: true, diagnostics: project.diagnostics };

    const base: ValidationResult = this.instances.validate(project.graph, input);

    if (!InstanceSchemaValidator.isValid(input)) return base;

    const diagnostics: Diagnostic[] = [...base.diagnostics];
    const annotations: RamenAnnotationGraph = new RamenAnnotationGraph(project.graph);

    input.nodes.forEach((node: ModelInstanceNode, index: number): void => {
      this.validateAnnotationNode(project.graph, annotations, input, node, index, diagnostics);
    });

    return {
      diagnostics: diagnostics,
      hasErrors: diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error'),
    };
  }

  private validateAnnotationNode(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    instance: ModelInstanceGraph,
    node: ModelInstanceNode,
    index: number,
    diagnostics: Diagnostic[],
  ): void {
    const resolved: ResolvedModelElement<Node> | undefined = graph.resolveNode(instance.modelId, node.typeId);

    if (!resolved || !annotations.isAnnotationNode(resolved.modelId, resolved.element.id)) return;

    const path: DiagnosticPath = DiagnosticPath.root().property('nodes').index(index);
    const type: unknown = node.properties.type;

    if (typeof type !== 'string') {
      this.error(
        diagnostics,
        RAMEN_INSTANCE_ERROR.ANNOTATION_REQUIRED,
        'Annotation property `type` must select a declared annotation.',
        path.property('properties').property('type'),
        node.id,
      );

      return;
    }

    const selected: ResolvedRamenAnnotation | undefined = annotations.findEffective(resolved.modelId, resolved.element.id, type);

    if (!selected) {
      this.error(
        diagnostics,
        RAMEN_INSTANCE_ERROR.ANNOTATION_UNKNOWN,
        `Annotation type '${type}' is not available for '${resolved.element.name}'.`,
        path.property('properties').property('type'),
        node.id,
      );

      return;
    }
    this.validateProperties(graph, annotations, resolved, selected, node, path, diagnostics);
    this.validateRelations(graph, annotations, selected, instance, node, path, diagnostics);
  }

  private validateProperties(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    nodeType: ResolvedModelElement<Node>,
    selected: ResolvedRamenAnnotation,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const effectiveAttributes: readonly Attribute[] =
      EffectiveModel.resolveNode(graph, nodeType.modelId, nodeType.element.id)?.attributes ?? [];
    const commonIds: Set<Id> = new Set<Id>(
      EffectiveModel.resolveNode(graph, RAMEN_MODEL.id, RAMEN_ELEMENT.ANNOTATION)?.attributes.map(
        (attribute: Attribute): Id => attribute.id,
      ) ?? [],
    );
    const allowedIds: Set<Id> = new Set<Id>(commonIds);

    for (const definition of annotations.getRefinementLineage(selected)) {
      for (const property of definition.annotation.properties) allowedIds.add(this.refId(property.attributeId));
    }

    const allowedNames: Set<string> = new Set<string>(
      effectiveAttributes
        .filter((attribute: Attribute): boolean => allowedIds.has(attribute.id))
        .map((attribute: Attribute): string => attribute.name),
    );

    this.validateAllowedProperties(node, selected, allowedNames, path, diagnostics);
    this.validatePropertyCardinalities(annotations, selected, effectiveAttributes, node, path, diagnostics);
  }

  private validateAllowedProperties(
    node: ModelInstanceNode,
    selected: ResolvedRamenAnnotation,
    allowedNames: ReadonlySet<string>,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    for (const name of Object.keys(node.properties)) {
      if (allowedNames.has(name)) continue;
      this.error(
        diagnostics,
        RAMEN_INSTANCE_ERROR.ANNOTATION_PROPERTY_NOT_ALLOWED,
        `Property '${name}' is not allowed for annotation '${selected.annotation.type}'.`,
        path.property('properties').property(name),
        node.id,
      );
    }
  }

  private validatePropertyCardinalities(
    annotations: RamenAnnotationGraph,
    selected: ResolvedRamenAnnotation,
    effectiveAttributes: readonly Attribute[],
    node: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    for (const requirement of this.effectiveProperties(annotations, selected)) {
      if (!requirement.bounds) continue;

      const attributeId: Id = this.refId(requirement.attributeId);
      const attribute: Attribute | undefined = effectiveAttributes.find(
        (candidate: Attribute): boolean => candidate.id === attributeId,
      );

      if (!attribute) continue;

      const value: unknown = node.properties[attribute.name];
      const count: number = value === undefined || value === null ? 0 : Array.isArray(value) ? value.length : 1;

      if (!this.within(count, requirement.bounds))
        this.error(
          diagnostics,
          RAMEN_INSTANCE_ERROR.ANNOTATION_PROPERTY_CARDINALITY,
          `Annotation '${selected.annotation.type}' requires ${this.boundsText(requirement.bounds)} value(s) for '${attribute.name}', found ${count}.`,
          path.property('properties').property(attribute.name),
          node.id,
        );
    }
  }

  private validateRelations(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    selected: ResolvedRamenAnnotation,
    instance: ModelInstanceGraph,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const requirements: readonly ResolvedAnnotationRelation[] = this.effectiveRelations(graph, annotations, selected);
    const connected: readonly ModelInstanceRelation[] = instance.relations.filter(
      (relation: ModelInstanceRelation): boolean => relation.fromId === node.id || relation.toId === node.id,
    );

    this.validateAllowedRelations(graph, selected, instance.modelId, node, path, requirements, connected, diagnostics);
    for (const requirement of requirements) {
      const count: number = connected.filter(
        (relation: ModelInstanceRelation): boolean =>
          this.hasDirection(requirement.relation, relation, node.id) &&
          graph.isRelationRefSameOrSubtype(
            instance.modelId,
            relation.typeId,
            requirement.modelId,
            requirement.relation.relationId,
          ),
      ).length;

      if (!this.within(count, requirement.relation.bounds))
        this.error(
          diagnostics,
          RAMEN_INSTANCE_ERROR.ANNOTATION_RELATION_CARDINALITY,
          `Annotation '${selected.annotation.type}' requires ${this.boundsText(requirement.relation.bounds)} matching relation(s), found ${count}.`,
          path,
          node.id,
        );
    }
  }

  private validateAllowedRelations(
    graph: ProjectGraph,
    selected: ResolvedRamenAnnotation,
    instanceModelId: Id,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    requirements: readonly ResolvedAnnotationRelation[],
    connected: readonly ModelInstanceRelation[],
    diagnostics: Diagnostic[],
  ): void {
    for (const relation of connected) {
      const allowed: boolean = requirements.some(
        (requirement: ResolvedAnnotationRelation): boolean =>
          this.hasDirection(requirement.relation, relation, node.id) &&
          graph.isRelationRefSameOrSubtype(
            instanceModelId,
            relation.typeId,
            requirement.modelId,
            requirement.relation.relationId,
          ),
      );

      if (allowed) continue;
      this.error(
        diagnostics,
        RAMEN_INSTANCE_ERROR.ANNOTATION_RELATION_NOT_ALLOWED,
        `Relation '${relation.id}' is not allowed for annotation '${selected.annotation.type}'.`,
        path,
        node.id,
      );
    }
  }

  private effectiveProperties(
    annotations: RamenAnnotationGraph,
    selected: ResolvedRamenAnnotation,
  ): readonly RamenAnnotationProperty[] {
    const result: Map<Id, RamenAnnotationProperty> = new Map<Id, RamenAnnotationProperty>();

    for (const definition of [...annotations.getRefinementLineage(selected)].reverse()) {
      for (const property of definition.annotation.properties) {
        const attributeId: Id = this.refId(property.attributeId);
        const inherited: RamenAnnotationProperty | undefined = result.get(attributeId);

        result.set(attributeId, { ...property, bounds: property.bounds ?? inherited?.bounds });
      }
    }

    return [...result.values()];
  }

  private effectiveRelations(
    graph: ProjectGraph,
    annotations: RamenAnnotationGraph,
    selected: ResolvedRamenAnnotation,
  ): readonly ResolvedAnnotationRelation[] {
    const result: ResolvedAnnotationRelation[] = [];

    for (const definition of [...annotations.getRefinementLineage(selected)].reverse()) {
      for (const requirement of definition.annotation.relations) {
        const index: number = result.findIndex(
          (candidate: ResolvedAnnotationRelation): boolean =>
            candidate.relation.direction === requirement.direction &&
            graph.isRelationRefSameOrSubtype(
              definition.modelId,
              requirement.relationId,
              candidate.modelId,
              candidate.relation.relationId,
            ),
        );
        const resolved: ResolvedAnnotationRelation = { modelId: definition.modelId, relation: requirement };

        if (index >= 0) result.splice(index, 1, resolved);
        else result.push(resolved);
      }
    }

    return result;
  }

  private hasDirection(requirement: RamenAnnotationRelation, relation: ModelInstanceRelation, nodeId: Id): boolean {
    return requirement.direction === 'outgoing' ? relation.fromId === nodeId : relation.toId === nodeId;
  }

  private within(count: number, bounds: Bounds): boolean {
    return count >= bounds.lowerBound && (bounds.upperBound === -1 || count <= bounds.upperBound);
  }

  private boundsText(bounds: Bounds): string {
    return bounds.upperBound === -1 ? `${bounds.lowerBound}..*` : `${bounds.lowerBound}..${bounds.upperBound}`;
  }

  private refId(reference: Ref): Id {
    return ModelRef.localId(reference);
  }

  private error(diagnostics: Diagnostic[], code: string, message: string, path: DiagnosticPath, ref: Id): void {
    diagnostics.push(Diagnostics.error({ code: code, message: message, path: path, ref: ref }));
  }
}
