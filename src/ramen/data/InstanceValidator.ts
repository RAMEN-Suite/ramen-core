import {
  ModelRelationScope,
  DiagnosticPath,
  Diagnostics,
  type Diagnostic,
  EffectiveModel,
  InstanceSchemaValidator,
  InstanceValidator,
  ProjectGraph,
  type ResolvedElement,
  ConstraintRegistry,
  type ModelInstanceNode,
  type ModelInstanceRelation,
  type ProjectValidationResult,
  type ValidationResult,
  type Attribute,
  type Model,
  type Node,
  type Id,
  type Ref,
} from '../../model/index.js';

import { AnnotationProperties } from '../annotations/Properties.js';
import { Cardinality } from '../../model/validation/Cardinality.js';

import { AnnotationShapes, AnnotationShapeRelation } from '../annotations/Definitions.js';
import { AnnotationIndex, ResolvedAnnotationShape } from '../annotations/AnnotationIndex.js';
import { RamenValidator } from '../validation/ModelValidator.js';

/** Stable diagnostic codes emitted while validating RAMEN instances. */
export enum RAMEN_INSTANCE_ERROR {
  /** An Annotation record has no string `type`. */
  ANNOTATION_REQUIRED = 'RAMEN_INSTANCE_ANNOTATION_REQUIRED',
  /** The declared `type` is unavailable for this Annotation node. */
  ANNOTATION_UNKNOWN = 'RAMEN_INSTANCE_ANNOTATION_UNKNOWN',
  /** The annotation record contains a property its type does not permit. */
  ANNOTATION_PROPERTY_NOT_ALLOWED = 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED',
  /** A supplied selector object has no non-empty `type`. */
  SELECTOR_TYPE_REQUIRED = 'RAMEN_INSTANCE_SELECTOR_TYPE_REQUIRED',
  /** A link on this annotation is absent from its type's permitted relationships. */
  ANNOTATION_RELATION_NOT_ALLOWED = 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_ALLOWED',
  /** Too few or too many links match a relationship rule of the annotation shape. */
  ANNOTATION_RELATION_CARDINALITY = 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY',
}

/** Validates a complete instance graph against the RAMEN model format and closed annotation shapes. */
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
      relations: new ModelRelationScope(project.graph, AnnotationShapes.relationSelections(models)).available(rootModelId),
      attributes: (type: ResolvedElement<Node>, node: ModelInstanceNode): readonly Attribute[] =>
        this.effectiveAttributes(project.graph, annotations, rootModelId, type, node),
    });

    if (!InstanceSchemaValidator.isValid(input)) return base;
    const diagnostics: Diagnostic[] = [...base.diagnostics];
    const connections: ReadonlyMap<Id, readonly ModelInstanceRelation[]> = this.indexRelations(input.relations);

    input.nodes.forEach((node: ModelInstanceNode, index: number): void => {
      const connected: readonly ModelInstanceRelation[] = connections.get(node.id) ?? [];
      this.validateAnnotationNode(project.graph, annotations, rootModelId, node, index, connected, diagnostics);
    });

    return {
      diagnostics: diagnostics,
      hasErrors: diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error'),
    };
  }

  private indexRelations(relations: readonly ModelInstanceRelation[]): ReadonlyMap<Id, readonly ModelInstanceRelation[]> {
    const indexed: Map<Id, ModelInstanceRelation[]> = new Map<Id, ModelInstanceRelation[]>();
    for (const relation of relations) {
      const endpoints: readonly Id[] = relation.fromId === relation.toId ? [relation.fromId] : [relation.fromId, relation.toId];
      for (const id of endpoints) {
        const connected: ModelInstanceRelation[] = indexed.get(id) ?? [];
        connected.push(relation);
        indexed.set(id, connected);
      }
    }

    return indexed;
  }

  private effectiveAttributes(
    graph: ProjectGraph,
    annotations: AnnotationIndex,
    modelId: Id,
    type: ResolvedElement<Node>,
    node: ModelInstanceNode,
  ): readonly Attribute[] {
    const attributes: readonly Attribute[] = EffectiveModel.resolveNode(graph, type.modelId, type.element.id)?.attributes ?? [];
    if (typeof node.properties['type'] !== 'string') return attributes;

    const definition: ResolvedAnnotationShape | undefined = annotations.findEffective(
      modelId,
      node.typeId,
      node.properties['type'],
    );
    if (!definition) return attributes;

    const byName: Map<string, Attribute> = new Map<string, Attribute>(
      attributes.map((item: Attribute): [string, Attribute] => [item.name, item]),
    );

    for (const item of AnnotationProperties.resolve(definition)) byName.set(item.name, item);
    return [...byName.values()];
  }

  private validateAnnotationNode(
    graph: ProjectGraph,
    annotations: AnnotationIndex,
    modelId: Id,
    node: ModelInstanceNode,
    index: number,
    connected: readonly ModelInstanceRelation[],
    diagnostics: Diagnostic[],
  ): void {
    const resolved: ResolvedElement<Node> | undefined = graph.resolveNode(modelId, node.typeId);
    if (!resolved) return;

    const isAnnotation: boolean = annotations.isAnnotationNode(resolved.modelId, resolved.element.id);
    if (!isAnnotation) return;

    const path: DiagnosticPath = DiagnosticPath.root().property('nodes').index(index);
    const type: unknown = node.properties['type'];

    const selectorPath: DiagnosticPath = path.property('properties').property('selector');
    diagnostics.push(...RamenInstanceValidator.validateSelector(node.properties['selector'], selectorPath, node.id));

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

    const selected: ResolvedAnnotationShape | undefined = annotations.findEffective(modelId, node.typeId, type);
    if (!selected) {
      const message: string = `Annotation shape '${type}' is not available for '${resolved.element.name}'.`;
      const typePath: DiagnosticPath = path.property('properties').property('type');
      this.error(diagnostics, RAMEN_INSTANCE_ERROR.ANNOTATION_UNKNOWN, message, typePath, node.id);
      return;
    }

    this.validateProperties(graph, resolved, selected, node, path, diagnostics);
    this.validateRelations(graph, selected, modelId, node, path, connected, diagnostics);
  }

  /** Checks the common selector contract. The selector's declared data type checks its Object shape. */
  public static validateSelector(
    selector: unknown,
    path: DiagnosticPath = DiagnosticPath.root().property('value'),
    ref?: Id,
  ): readonly Diagnostic[] {
    const isObject: boolean = selector !== null && typeof selector === 'object' && !Array.isArray(selector);
    if (!isObject) return [];

    const type: unknown = (selector as Record<string, unknown>)['type'];
    if (typeof type === 'string' && type.trim().length > 0) return [];
    return [
      Diagnostics.error({
        code: RAMEN_INSTANCE_ERROR.SELECTOR_TYPE_REQUIRED,
        message: 'Annotation selector must declare a non-empty type.',
        path: path.property('type'),
        ref,
      }),
    ];
  }

  private validateProperties(
    graph: ProjectGraph,
    nodeType: ResolvedElement<Node>,
    selected: ResolvedAnnotationShape,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): void {
    const attributes: readonly Attribute[] = AnnotationProperties.allowed(graph, selected, nodeType);
    const allowedNames: Set<string> = new Set<string>(attributes.map((attribute: Attribute): string => attribute.name));
    this.validateAllowedProperties(node, selected, allowedNames, path, diagnostics);
  }

  private validateAllowedProperties(
    node: ModelInstanceNode,
    selected: ResolvedAnnotationShape,
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
    selected: ResolvedAnnotationShape,
    modelId: Id,
    node: ModelInstanceNode,
    path: DiagnosticPath,
    connected: readonly ModelInstanceRelation[],
    diagnostics: Diagnostic[],
  ): void {
    const requirements: readonly AnnotationShapeRelation[] = selected.annotation.relations;
    const counts: ReadonlyMap<AnnotationShapeRelation, number> = this.countRelations(
      graph,
      selected,
      modelId,
      node,
      connected,
      path,
      diagnostics,
    );

    for (const requirement of requirements) {
      const count: number = counts.get(requirement) ?? 0;
      if (!Cardinality.isCountWithinBounds(count, requirement.bounds))
        this.error(
          diagnostics,
          RAMEN_INSTANCE_ERROR.ANNOTATION_RELATION_CARDINALITY,
          `Annotation '${selected.annotation.type}' requires ${Cardinality.format(requirement.bounds)} matching relation(s), found ${count}.`,
          path,
          node.id,
        );
    }
  }

  private countRelations(
    graph: ProjectGraph,
    selected: ResolvedAnnotationShape,
    modelId: Id,
    node: ModelInstanceNode,
    connected: readonly ModelInstanceRelation[],
    path: DiagnosticPath,
    diagnostics: Diagnostic[],
  ): ReadonlyMap<AnnotationShapeRelation, number> {
    const counts: Map<AnnotationShapeRelation, number> = new Map<AnnotationShapeRelation, number>();
    for (const relation of connected) {
      let allowed: boolean = false;
      for (const requirement of selected.annotation.relations) {
        if (!this.hasDirection(requirement, relation, node.id)) continue;
        const matches: boolean = requirement.relationIds.some((ref: Ref): boolean =>
          graph.isRelationRefSameOrSubtype(modelId, relation.typeId, selected.modelId, ref),
        );
        if (!matches) continue;

        allowed = true;
        counts.set(requirement, (counts.get(requirement) ?? 0) + 1);
      }

      if (allowed) continue;
      const message: string = `Relation '${relation.id}' is not allowed for annotation '${selected.annotation.type}'.`;
      this.error(diagnostics, RAMEN_INSTANCE_ERROR.ANNOTATION_RELATION_NOT_ALLOWED, message, path, node.id);
    }
    return counts;
  }

  private hasDirection(requirement: AnnotationShapeRelation, relation: ModelInstanceRelation, nodeId: Id): boolean {
    return requirement.direction === 'outgoing' ? relation.fromId === nodeId : relation.toId === nodeId;
  }

  private error(diagnostics: Diagnostic[], code: RAMEN_INSTANCE_ERROR, message: string, path: DiagnosticPath, ref: Id): void {
    diagnostics.push(Diagnostics.error({ code: code, message: message, path: path, ref: ref }));
  }
}
