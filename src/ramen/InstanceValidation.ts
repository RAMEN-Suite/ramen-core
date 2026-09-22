import { GModel, GNode, GRelation, Id } from '../gcore/model/Types';
import { ProjectGraph, ResolvedModelElement } from '../gcore/project/Graph';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../gcore/validation/Diagnostics';
import { InstanceSchemaValidator } from '../gcore/validation/InstanceSchema';
import { ModelInstanceGraph, ModelInstanceNode, ModelInstanceRelation } from '../gcore/validation/InstanceTypes';
import { InstanceValidator } from '../gcore/validation/Instances';
import { ProjectValidationResult, ValidationResult } from '../gcore/validation/Validate';
import { AnnotationTypes, RamenAnnotationType } from './AnnotationTypes';
import { RAMEN_ELEMENT } from './Elements';
import { RAMEN_MODEL } from './Model';
import { RamenValidator } from './Validate';

/** Stable diagnostics emitted while validating RAMEN instance semantics. */
export const RAMEN_INSTANCE_ERROR: Readonly<{
  ANNOTATION_TYPE_REQUIRED: 'RAMEN_INSTANCE_ANNOTATION_TYPE_REQUIRED';
  ANNOTATION_TYPE_MISMATCH: 'RAMEN_INSTANCE_ANNOTATION_TYPE_MISMATCH';
  ANNOTATION_RELATION_NOT_DECLARED: 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_DECLARED';
}> = {
  ANNOTATION_TYPE_REQUIRED: 'RAMEN_INSTANCE_ANNOTATION_TYPE_REQUIRED',
  ANNOTATION_TYPE_MISMATCH: 'RAMEN_INSTANCE_ANNOTATION_TYPE_MISMATCH',
  ANNOTATION_RELATION_NOT_DECLARED: 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_DECLARED',
} as const;

/** Validates a complete instance graph against both GCore and RAMEN annotation semantics. */
export class RamenInstanceValidator {
  public constructor(
    private readonly projects: RamenValidator = new RamenValidator(),
    private readonly instances: InstanceValidator = new InstanceValidator(),
  ) {}

  /** Validates the project first and then validates a complete instance graph against it. */
  public validate(rootModelId: Id, models: readonly GModel[], input: unknown): ValidationResult {
    const project: ProjectValidationResult = this.projects.validateProject(rootModelId, models);
    if (!project.valid) return { hasErrors: true, diagnostics: project.diagnostics };
    const base: ValidationResult = this.instances.validate(project.graph, input);
    if (!InstanceSchemaValidator.isValid(input)) return base;
    const diagnostics: Diagnostic[] = [...base.diagnostics];
    this.validateAnnotationTypeValues(project.graph, input, diagnostics);
    this.validateAnnotationRelations(project.graph, input, diagnostics);
    return {
      diagnostics: diagnostics,
      hasErrors: diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.severity === 'error'),
    };
  }

  private validateAnnotationRelations(graph: ProjectGraph, instance: ModelInstanceGraph, diagnostics: Diagnostic[]): void {
    const nodes: Map<Id, ResolvedModelElement<GNode>> = new Map<Id, ResolvedModelElement<GNode>>();
    for (const node of instance.nodes) {
      const resolved: ResolvedModelElement<GNode> | undefined = graph.resolveNode(instance.modelId, node.typeId);
      if (resolved) nodes.set(node.id, resolved);
    }
    instance.relations.forEach((relation: ModelInstanceRelation, index: number): void => {
      const from: ResolvedModelElement<GNode> | undefined = nodes.get(relation.fromId);
      const to: ResolvedModelElement<GNode> | undefined = nodes.get(relation.toId);
      const touchesAnnotation: boolean = this.isResolvedAnnotation(graph, from) || this.isResolvedAnnotation(graph, to);
      if (!touchesAnnotation) return;
      const type: ResolvedModelElement<GRelation> | undefined = graph.resolveRelation(instance.modelId, relation.typeId);
      if (type?.modelId !== RAMEN_MODEL.id) return;
      diagnostics.push(
        Diagnostics.error({
          code: RAMEN_INSTANCE_ERROR.ANNOTATION_RELATION_NOT_DECLARED,
          message: `Relation '${relation.id}' uses a generic RAMEN relation for a concrete annotation type; declare or reuse a project relation with explicit endpoints and cardinalities.`,
          path: DiagnosticPath.root().property('relations').index(index).property('typeId'),
          ref: relation.id,
        }),
      );
    });
  }

  private isResolvedAnnotation(graph: ProjectGraph, type: ResolvedModelElement<GNode> | undefined): boolean {
    return type === undefined ? false : this.isAnnotation(graph, type);
  }

  private validateAnnotationTypeValues(graph: ProjectGraph, instance: ModelInstanceGraph, diagnostics: Diagnostic[]): void {
    instance.nodes.forEach((node: ModelInstanceNode, index: number): void => {
      const resolved: ResolvedModelElement<GNode> | undefined = graph.resolveNode(instance.modelId, node.typeId);
      if (!resolved || !this.isAnnotation(graph, resolved)) return;
      const metadata: RamenAnnotationType | undefined = this.findAnnotationType(graph, resolved);
      const path: DiagnosticPath = DiagnosticPath.root().property('nodes').index(index).property('properties').property('type');
      if (!metadata) {
        diagnostics.push(
          Diagnostics.error({
            code: RAMEN_INSTANCE_ERROR.ANNOTATION_TYPE_REQUIRED,
            message: `Annotation node '${node.id}' must use a declared project annotation type.`,
            path: path,
            ref: node.id,
          }),
        );
      } else if (node.properties.type !== metadata.typeValue) {
        diagnostics.push(
          Diagnostics.error({
            code: RAMEN_INSTANCE_ERROR.ANNOTATION_TYPE_MISMATCH,
            message: `Annotation type must be '${metadata.typeValue}'.`,
            path: path,
            ref: node.id,
          }),
        );
      }
    });
  }

  private findAnnotationType(graph: ProjectGraph, type: ResolvedModelElement<GNode>): RamenAnnotationType | undefined {
    const own: RamenAnnotationType | undefined = AnnotationTypes.read(type.element);
    if (own) return own;
    for (const ancestor of graph.getNodeAncestors(type.modelId, type.element.id)) {
      const inherited: RamenAnnotationType | undefined = AnnotationTypes.read(ancestor.element);
      if (inherited) return inherited;
    }
    return undefined;
  }

  private isAnnotation(graph: ProjectGraph, type: ResolvedModelElement<GNode>): boolean {
    if (type.modelId === RAMEN_MODEL.id && type.element.id === RAMEN_ELEMENT.ANNOTATION) return true;
    return graph
      .getNodeAncestors(type.modelId, type.element.id)
      .some(
        (ancestor: ResolvedModelElement<GNode>): boolean =>
          ancestor.modelId === RAMEN_MODEL.id && ancestor.element.id === RAMEN_ELEMENT.ANNOTATION,
      );
  }
}
