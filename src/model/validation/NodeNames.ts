import type { Id, Model, Node, Ref } from '../Types.js';
import type { ProjectGraph, ResolvedElement } from '../graph/ProjectGraph.js';
import { ModelRef } from '../graph/References.js';
import { DiagnosticPath, Diagnostics, type Diagnostic } from './Diagnostics.js';
import { VALIDATION_ERROR } from './Codes.js';

/** @internal Checks names of nodes declared or explicitly used on one model level. */
export class NodeNames {
  private readonly names: Map<string, Ref> = new Map<string, Ref>();
  private readonly diagnostics: Diagnostic[] = [];

  public constructor(
    private readonly graph: ProjectGraph,
    private readonly model: Model,
  ) {
    const path: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id);

    model.classifiers.forEach((classifier, index: number): void => {
      if (classifier.kind !== 'Node') return;
      this.diagnostics.push(
        ...this.register(classifier.id, path.property('classifiers').index(index).property('name'), classifier.id),
      );
    });

    model.relations.forEach((relation, index: number): void => {
      for (const end of ['from', 'to'] as const) {
        this.diagnostics.push(
          ...this.register(
            relation[end].nodeId,
            path.property('relations').index(index).property(end).property('nodeId'),
            relation.id,
          ),
        );
      }
    });
  }

  public getDiagnostics(): readonly Diagnostic[] {
    return [...this.diagnostics];
  }

  /** Repeated uses of one node are allowed; distinct nodes must have distinct names. */
  public register(reference: Ref, path: DiagnosticPath, ref: Id): readonly Diagnostic[] {
    const node: ResolvedElement<Node> | undefined = this.graph.resolveNode(this.model.id, reference);
    if (!node) return [];

    const identity: Ref = ModelRef.qualify(node.modelId, node.element.id);
    const previous: Ref | undefined = this.names.get(node.element.name);

    if (previous === undefined) this.names.set(node.element.name, identity);
    if (previous === undefined || previous === identity) return [];

    return [
      Diagnostics.error({
        code: VALIDATION_ERROR.NODE_NAME_DUPLICATE,
        message: `Node name '${node.element.name}' refers to different nodes in model '${this.model.id}'.`,
        path,
        ref,
      }),
    ];
  }
}
