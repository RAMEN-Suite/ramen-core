import { GModel, GNode, Id } from '../gcore/model/Types';
import { ProjectGraph, ResolvedModelElement } from '../gcore/project/Graph';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../gcore/validation/Diagnostics';
import { ModelValidator, ProjectValidationResult } from '../gcore/validation/Validate';
import { AnnotationTypes, RamenAnnotationType } from './AnnotationTypes';
import { RAMEN_ELEMENT } from './Elements';
import { RAMEN_MODEL } from './Model';

/** Stable diagnostics emitted by RAMEN-specific validation. */
export const RAMEN_VALIDATION_ERROR: Readonly<{
  BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED';
  ANNOTATION_TYPE_VALUE_EMPTY: 'RAMEN_ANNOTATION_TYPE_VALUE_EMPTY';
  ANNOTATION_TYPE_VALUE_DUPLICATE: 'RAMEN_ANNOTATION_TYPE_VALUE_DUPLICATE';
  ANNOTATION_TYPE_BASE_INVALID: 'RAMEN_ANNOTATION_TYPE_BASE_INVALID';
}> = {
  BASE_MODEL_REQUIRED: 'RAMEN_BASE_MODEL_REQUIRED',
  ANNOTATION_TYPE_VALUE_EMPTY: 'RAMEN_ANNOTATION_TYPE_VALUE_EMPTY',
  ANNOTATION_TYPE_VALUE_DUPLICATE: 'RAMEN_ANNOTATION_TYPE_VALUE_DUPLICATE',
  ANNOTATION_TYPE_BASE_INVALID: 'RAMEN_ANNOTATION_TYPE_BASE_INVALID',
} as const;

/** Validates that a valid GCore project is rooted in the versioned RAMEN model. */
export class RamenValidator {
  public constructor(private readonly models: ModelValidator = new ModelValidator()) {}

  /** Validates a complete RAMEN project and exposes its graph only on success. */
  public validateProject(rootModelId: Id, inputs: readonly unknown[]): ProjectValidationResult {
    const result: ProjectValidationResult = this.models.validateProject(rootModelId, inputs);
    if (!result.valid) return result;
    if (!result.graph.getModels().some((model): boolean => model.id === RAMEN_MODEL.id)) {
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
    const diagnostics: readonly Diagnostic[] = this.validateAnnotationTypes(result.graph);
    if (diagnostics.length === 0) return result;
    return { valid: false, hasErrors: true, diagnostics: [...result.diagnostics, ...diagnostics] };
  }

  private validateAnnotationTypes(graph: ProjectGraph): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const values: Map<string, Id> = new Map<string, Id>();
    for (const model of graph.getModels()) {
      for (const classifier of model.classifiers) {
        if (classifier.kind !== 'GNode') continue;
        const metadata: RamenAnnotationType | undefined = AnnotationTypes.read(classifier);
        if (!metadata) continue;
        this.validateAnnotationType(graph, model, classifier, metadata, values, diagnostics);
      }
    }
    return diagnostics;
  }

  private validateAnnotationType(
    graph: ProjectGraph,
    model: GModel,
    node: GNode,
    metadata: RamenAnnotationType,
    values: Map<string, Id>,
    diagnostics: Diagnostic[],
  ): void {
    const path: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id).property('classifiers');
    const value: string = metadata.typeValue.trim();
    this.registerTypeValue(node, value, path, values, diagnostics);
    if (!this.refinesAnnotation(graph, model, node)) {
      diagnostics.push(
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.ANNOTATION_TYPE_BASE_INVALID,
          message: `Annotation type '${node.name}' must refine RAMEN Annotation.`,
          path: path,
          ref: node.id,
        }),
      );
    }
  }

  private registerTypeValue(
    node: GNode,
    value: string,
    path: DiagnosticPath,
    values: Map<string, Id>,
    diagnostics: Diagnostic[],
  ): void {
    if (value.length === 0) {
      diagnostics.push(
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.ANNOTATION_TYPE_VALUE_EMPTY,
          message: `Annotation type '${node.name}' must define a non-empty type value.`,
          path: path,
          ref: node.id,
        }),
      );
    }
    const previous: Id | undefined = values.get(value);
    if (value.length > 0 && previous) {
      diagnostics.push(
        Diagnostics.error({
          code: RAMEN_VALIDATION_ERROR.ANNOTATION_TYPE_VALUE_DUPLICATE,
          message: `Annotation type value '${value}' is already used by '${previous}'.`,
          path: path,
          ref: node.id,
        }),
      );
    } else if (value.length > 0) values.set(value, node.id);
  }

  private refinesAnnotation(graph: ProjectGraph, model: GModel, node: GNode): boolean {
    return graph
      .getNodeAncestors(model.id, node.id)
      .some(
        (ancestor: ResolvedModelElement<GNode>): boolean =>
          ancestor.modelId === RAMEN_MODEL.id && ancestor.element.id === RAMEN_ELEMENT.ANNOTATION,
      );
  }
}
