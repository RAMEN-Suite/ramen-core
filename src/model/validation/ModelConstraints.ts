import type { Classifier, Constraint, Id, Model, Relation } from '../Types';
import type { ProjectGraph } from '../graph/ProjectGraph';
import { ConstraintRegistry, ModelContext, ConstraintTarget } from './Constraints';
import { Diagnostic, DiagnosticPath } from './Diagnostics';

type Declaration = ModelContext['value'];

/** Executes model rules once per declaration after structural and reference validation. */
export class ModelConstraints {
  public constructor(private readonly registry: ConstraintRegistry) {}

  public validate(graph: ProjectGraph): readonly Diagnostic[] {
    return graph.getModels().flatMap((model: Model): readonly Diagnostic[] => {
      const path: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id);
      const classifiers: readonly Diagnostic[] = model.classifiers.flatMap(
        (item: Classifier, index: number): readonly Diagnostic[] =>
          this.classifier(graph, model.id, item, path.property('classifiers').index(index)),
      );
      const relations: readonly Diagnostic[] = model.relations.flatMap((item: Relation, index: number): readonly Diagnostic[] =>
        this.relation(graph, model.id, item, path.property('relations').index(index)),
      );
      return [...classifiers, ...relations];
    });
  }

  public element(
    graph: ProjectGraph,
    modelId: Id,
    value: Declaration,
    target: ConstraintTarget,
    path: DiagnosticPath,
  ): readonly Diagnostic[] {
    return (value.constraints ?? []).flatMap((constraint: Constraint): readonly Diagnostic[] =>
      this.registry.evaluate(constraint, {
        scope: 'model',
        modelId,
        ownerId: value.id,
        target,
        value,
        path,
        graph: { project: graph },
      }),
    );
  }

  private classifier(graph: ProjectGraph, modelId: Id, value: Classifier, path: DiagnosticPath): readonly Diagnostic[] {
    const target: ConstraintTarget = value.kind === 'Node' ? 'node' : 'dataType';
    const diagnostics: readonly Diagnostic[] = this.element(graph, modelId, value, target, path);
    const children: readonly Declaration[] = value.kind === 'Node' ? value.attributes : (value.literals ?? []);
    const childTarget: ConstraintTarget = value.kind === 'Node' ? 'attribute' : 'literal';
    const childPath: DiagnosticPath = path.property(value.kind === 'Node' ? 'attributes' : 'literals');
    return [
      ...diagnostics,
      ...children.flatMap((child: Declaration, index: number): readonly Diagnostic[] =>
        this.element(graph, modelId, child, childTarget, childPath.index(index)),
      ),
    ];
  }

  private relation(graph: ProjectGraph, modelId: Id, value: Relation, path: DiagnosticPath): readonly Diagnostic[] {
    return [
      ...this.element(graph, modelId, value, 'relation', path),
      ...this.element(graph, modelId, value.from, 'relationEnd', path.property('from')),
      ...this.element(graph, modelId, value.to, 'relationEnd', path.property('to')),
    ];
  }
}
