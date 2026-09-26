import { ModelRelationScope } from '../../model/graph/RelationScope';
import { AnnotationProperties } from '../annotations/Properties';
import {
  DiagnosticPath,
  Diagnostics,
  EffectiveModel,
  InstanceSchemaValidator,
  InstanceValidator,
  ProjectGraph,
  ConstraintRegistry,
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
  ResolvedElement,
  ValidationResult,
} from '../../model/index';
import { RamenAnnotations, AnnotationRelation } from '../annotations/Definitions';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../ReferenceModel';
import { AnnotationIndex, ResolvedAnnotation } from '../annotations/AnnotationIndex';
import { RamenValidator } from '../validation/ModelValidator';

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

  /** Creates a RAMEN validator with the standard and caller-registered constraint languages. */
  public static withConstraints(constraints: ConstraintRegistry): RamenInstanceValidator {
    return new RamenInstanceValidator(new RamenValidator(), new InstanceValidator(constraints));
  }

  /** Validates the project first and then validates a complete instance graph against it. */
  public validate(rootModelId: Id, models: readonly Model[], input: unknown): ValidationResult {
    const project: ProjectValidationResult = this.projects.validateProject(rootModelId, models);
    if (!project.valid) return { hasErrors: true, diagnostics: project.diagnostics };
    const annotations: AnnotationIndex = new AnnotationIndex(project.graph, models);
    const base: ValidationResult = this.instances.validate(project.graph, input, {
      relations: new ModelRelationScope(project.graph, RamenAnnotations.relationSelections(models)).available(rootModelId),
      attributes: (type: ResolvedElement<Node>, node: ModelInstanceNode): readonly Attribute[] =>
        this.effectiveAttributes(project.graph, annotations, rootModelId, type, node),
    });
    if (!InstanceSchemaValidator.isValid(input)) return base;
    const diagnostics: Diagnostic[] = [...base.diagnostics];
    input.nodes.forEach((node: ModelInstanceNode, index: number): void => {
      this.validateAnnotationNode(project.graph, annotations, input, node, index, diagnostics);
    });

    return {
      diagnostics: diagnostics,
      hasErrors: diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error'),
    };
  }

  private effectiveAttributes(
    graph: ProjectGraph,
    annotations: AnnotationIndex,
    modelId: Id,
    type: ResolvedElement<Node>,
    node: ModelInstanceNode,
  ): readonly Attribute[] {
    const attributes: readonly Attribute[] = EffectiveModel.resolveNode(graph, type.modelId, type.element.id)?.attributes ?? [];
    if (typeof node.properties.type !== 'string') return attributes;
    const definition: ResolvedAnnotation | undefined = annotations.findEffective(modelId, node.typeId, node.properties.type);
    if (!definition) return attributes;
    const byName: Map<string, Attribute> = new Map<string, Attribute>(
      attributes.map((item: Attribute): [string, Attribute] => [item.name, item]),
    );
    for (const item of AnnotationProperties.resolve(graph, definition, type)) byName.set(item.name, item);
    return [...byName.values()];
  }

  private validateAnnotationNode(
    graph: ProjectGraph,
    annotations: AnnotationIndex,
    instance: ModelInstanceGraph,
    node: ModelInstanceNode,
    index: number,
    diagnostics: Diagnostic[],
  ): void {
    const resolved: ResolvedElement<Node> | undefined = graph.resolveNode(instance.modelId, node.typeId);
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
    const selected: ResolvedAnnotation | undefined = annotations.findEffective(instance.modelId, node.typeId, type);
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
    this.validateProperties(graph, resolved, selected, node, path, diagnostics);
    this.validateRelations(graph, selected, instance, node, path, diagnostics);
  }

  private validateProperties(
    graph: ProjectGraph,
    nodeType: ResolvedElement<Node>,
    selected: ResolvedAnnotation,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const common: readonly Attribute[] =
      EffectiveModel.resolveNode(graph, RAMEN_MODEL.id, RAMEN_ELEMENT.ANNOTATION)?.attributes ?? [];
    const selectedAttributes: readonly Attribute[] = AnnotationProperties.resolve(graph, selected, nodeType);
    const allowedNames: Set<string> = new Set<string>(
      [...common, ...selectedAttributes].map((attribute: Attribute): string => attribute.name),
    );
    this.validateAllowedProperties(node, selected, allowedNames, path, diagnostics);
  }

  private validateAllowedProperties(
    node: ModelInstanceNode,
    selected: ResolvedAnnotation,
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

  private validateRelations(
    graph: ProjectGraph,
    selected: ResolvedAnnotation,
    instance: ModelInstanceGraph,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const requirements: readonly AnnotationRelation[] = selected.annotation.relations;
    const connected: readonly ModelInstanceRelation[] = instance.relations.filter(
      (relation: ModelInstanceRelation): boolean => relation.fromId === node.id || relation.toId === node.id,
    );

    this.validateAllowedRelations(graph, selected, instance.modelId, node, path, requirements, connected, diagnostics);
    for (const requirement of requirements) {
      const count: number = connected.filter(
        (relation: ModelInstanceRelation): boolean =>
          this.hasDirection(requirement, relation, node.id) &&
          RamenAnnotations.relationRefs(requirement).some((ref: Ref): boolean =>
            graph.isRelationRefSameOrSubtype(instance.modelId, relation.typeId, selected.modelId, ref),
          ),
      ).length;

      if (!this.within(count, requirement.bounds))
        this.error(
          diagnostics,
          RAMEN_INSTANCE_ERROR.ANNOTATION_RELATION_CARDINALITY,
          `Annotation '${selected.annotation.type}' requires ${this.boundsText(requirement.bounds)} matching relation(s), found ${count}.`,
          path,
          node.id,
        );
    }
  }

  private validateAllowedRelations(
    graph: ProjectGraph,
    selected: ResolvedAnnotation,
    instanceModelId: Id,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    requirements: readonly AnnotationRelation[],
    connected: readonly ModelInstanceRelation[],
    diagnostics: Diagnostic[],
  ): void {
    for (const relation of connected) {
      const allowed: boolean = requirements.some(
        (requirement: AnnotationRelation): boolean =>
          this.hasDirection(requirement, relation, node.id) &&
          RamenAnnotations.relationRefs(requirement).some((ref: Ref): boolean =>
            graph.isRelationRefSameOrSubtype(instanceModelId, relation.typeId, selected.modelId, ref),
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

  private hasDirection(requirement: AnnotationRelation, relation: ModelInstanceRelation, nodeId: Id): boolean {
    return requirement.direction === 'outgoing' ? relation.fromId === nodeId : relation.toId === nodeId;
  }

  private within(count: number, bounds: Bounds): boolean {
    return count >= bounds.lowerBound && (bounds.upperBound === -1 || count <= bounds.upperBound);
  }

  private boundsText(bounds: Bounds): string {
    return bounds.upperBound === -1 ? `${bounds.lowerBound}..*` : `${bounds.lowerBound}..${bounds.upperBound}`;
  }

  private error(diagnostics: Diagnostic[], code: string, message: string, path: DiagnosticPath, ref: Id): void {
    diagnostics.push(Diagnostics.error({ code: code, message: message, path: path, ref: ref }));
  }
}
