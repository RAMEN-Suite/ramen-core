import type { DataType, Id, Model, Ref } from '../Types.js';
import type { ProjectGraph, ResolvedElement } from '../graph/ProjectGraph.js';
import { ModelRef } from '../graph/References.js';
import { DiagnosticPath, Diagnostics, type Diagnostic } from './Diagnostics.js';
import { VALIDATION_ERROR } from './Codes.js';

/** @internal Checks names of data types declared or explicitly used on one model level. */
export class DataTypeNames {
  private readonly names: Map<string, Ref> = new Map<string, Ref>();
  private readonly diagnostics: Diagnostic[] = [];

  public constructor(
    private readonly graph: ProjectGraph,
    private readonly model: Model,
  ) {
    const path: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id).property('classifiers');
    model.classifiers.forEach((classifier, index: number): void => {
      if (classifier.kind !== 'DataType') return;
      this.diagnostics.push(...this.register(classifier.id, path.index(index).property('name'), classifier.id));
    });

    model.classifiers.forEach((classifier, index: number): void => {
      if (classifier.kind !== 'Node') return;
      const classifierPath: DiagnosticPath = path.index(index);
      classifier.attributes.forEach((attribute, attributeIndex: number): void => {
        const propertyPath: DiagnosticPath = classifierPath.property('attributes').index(attributeIndex).property('typeId');
        this.diagnostics.push(...this.register(attribute.typeId, propertyPath, attribute.id));
      });
    });
  }

  public getDiagnostics(): readonly Diagnostic[] {
    return [...this.diagnostics];
  }

  /** Repeated uses of one type are allowed; distinct declared types must have distinct names. */
  public register(reference: Ref, path: DiagnosticPath, ref: Id): readonly Diagnostic[] {
    const type: ResolvedElement<DataType> | undefined = this.graph.resolveDataType(this.model.id, reference);
    if (!type) return [];

    const identity: Ref = ModelRef.qualify(type.modelId, type.element.id);
    const previous: Ref | undefined = this.names.get(type.element.name);
    if (previous === undefined) this.names.set(type.element.name, identity);
    if (previous === undefined || previous === identity) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.DATATYPE_NAME_DUPLICATE,
        message: `Data type name '${type.element.name}' refers to different data types in model '${this.model.id}'.`,
        path,
        ref,
      }),
    ];
  }
}
