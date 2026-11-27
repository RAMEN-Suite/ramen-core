import type { Classifier, DataType, Node, Id, Model, Ref } from '../Types.js';
import type { ProjectGraph, ResolvedElement } from '../graph/ProjectGraph.js';
import { ModelNames } from '../Names.js';
import { ModelRef } from '../graph/References.js';
import { DiagnosticPath, Diagnostics, type Diagnostic } from './Diagnostics.js';
import { VALIDATION_ERROR, type ValidationCode } from './Codes.js';

/** @internal Checks the shared names of classifiers declared or explicitly used on one model level. */
export class ClassifierNames {
  private readonly names: Map<string, ResolvedElement<Classifier>> = new Map<string, ResolvedElement<Classifier>>();
  private readonly foldedNames: Map<string, ResolvedElement<Classifier>> = new Map<string, ResolvedElement<Classifier>>();
  private readonly diagnostics: Diagnostic[] = [];

  public constructor(
    private readonly graph: ProjectGraph,
    private readonly model: Model,
  ) {
    const path: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id);
    model.classifiers.forEach((classifier: Classifier, index: number): void => {
      const target: ResolvedElement<Classifier> = { modelId: model.id, element: classifier };
      this.diagnostics.push(...this.register(target, path.property('classifiers').index(index).property('name'), classifier.id));
    });

    model.classifiers.forEach((classifier: Classifier, index: number): void => {
      if (classifier.kind !== 'Node') return;
      classifier.attributes.forEach((attribute, attributeIndex: number): void => {
        const propertyPath: DiagnosticPath = path
          .property('classifiers')
          .index(index)
          .property('attributes')
          .index(attributeIndex);
        this.diagnostics.push(...this.registerDataType(attribute.typeId, propertyPath.property('typeId'), attribute.id));
      });
    });
    model.relations.forEach((relation, index: number): void => {
      for (const end of ['from', 'to'] as const) {
        const endPath: DiagnosticPath = path.property('relations').index(index).property(end).property('nodeId');
        this.diagnostics.push(...this.registerNode(relation[end].nodeId, endPath, relation.id));
      }
    });
  }

  public getDiagnostics(): readonly Diagnostic[] {
    return [...this.diagnostics];
  }

  public registerNode(reference: Ref, path: DiagnosticPath, ref: Id): readonly Diagnostic[] {
    const node: ResolvedElement<Node> | undefined = this.graph.resolveNode(this.model.id, reference);
    return node ? this.register(node, path, ref) : [];
  }

  public registerDataType(reference: Ref, path: DiagnosticPath, ref: Id): readonly Diagnostic[] {
    const type: ResolvedElement<DataType> | undefined = this.graph.resolveDataType(this.model.id, reference);
    return type ? this.register(type, path, ref) : [];
  }

  private checkCase(target: ResolvedElement<Classifier>, path: DiagnosticPath, ref: Id): readonly Diagnostic[] {
    const folded: string = ModelNames.foldClassifierName(target.element.name);
    const previous: ResolvedElement<Classifier> | undefined = this.foldedNames.get(folded);
    if (!previous) {
      this.foldedNames.set(folded, target);
      return [];
    }
    const identity: Ref = ModelRef.qualify(target.modelId, target.element.id);
    if (identity === ModelRef.qualify(previous.modelId, previous.element.id)) return [];

    return [
      Diagnostics.warn({
        code: VALIDATION_ERROR.CLASSIFIER_NAME_CASE_CONFLICT,
        message: `Classifier names '${previous.element.name}' and '${target.element.name}' may collide after Unicode and case normalisation in model '${this.model.id}'.`,
        path,
        ref,
      }),
    ];
  }

  private register(target: ResolvedElement<Classifier>, path: DiagnosticPath, ref: Id): readonly Diagnostic[] {
    const canonical: string = ModelNames.normaliseClassifierName(target.element.name);
    const previous: ResolvedElement<Classifier> | undefined = this.names.get(canonical);
    if (!previous) {
      this.names.set(canonical, target);
      return this.checkCase(target, path, ref);
    }
    const identity: Ref = ModelRef.qualify(target.modelId, target.element.id);
    if (identity === ModelRef.qualify(previous.modelId, previous.element.id)) return [];

    let code: ValidationCode = VALIDATION_ERROR.CLASSIFIER_NAME_DUPLICATE;
    let label: string = 'Classifier';
    let subject: string = 'classifiers';
    if (target.element.kind === previous.element.kind) {
      const node: boolean = target.element.kind === 'Node';
      code = node ? VALIDATION_ERROR.NODE_NAME_DUPLICATE : VALIDATION_ERROR.DATATYPE_NAME_DUPLICATE;
      label = node ? 'Node' : 'Data type';
      subject = node ? 'nodes' : 'data types';
    }
    return [
      Diagnostics.error({
        code,
        message: `${label} name '${target.element.name}' refers to different ${subject} in model '${this.model.id}'.`,
        path,
        ref,
      }),
    ];
  }
}
