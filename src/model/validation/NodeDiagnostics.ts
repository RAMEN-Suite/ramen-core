import type { Classifier, Id, Model, Node, Ref, Relation } from '../Types.js';
import type { ElementRef } from '../editing/Inputs.js';
import { ModelRef } from '../graph/References.js';
import type { Diagnostic } from './Diagnostics.js';
import type { ValidationResult } from './ModelValidator.js';

/** Finds model diagnostics relevant to a node, its ancestors and their incident relations. */
export class NodeDiagnostics {
  private readonly modelsById: ReadonlyMap<Id, Model>;

  /** Indexes the models visible to the selected modelling level. */
  public constructor(private readonly models: readonly Model[]) {
    this.modelsById = new Map<Id, Model>(models.map((model: Model): [Id, Model] => [model.id, model]));
  }

  /** Follows a node's supertypes without requiring a valid project graph. */
  public lineage(owner: ElementRef): readonly ElementRef[] {
    const lineage: ElementRef[] = [];
    const seen: Set<Ref> = new Set<Ref>();
    const pending: ElementRef[] = [owner];

    while (pending.length > 0) {
      const current: ElementRef | undefined = pending.pop();
      if (!current) continue;
      const key: Ref = ModelRef.qualify(current.modelId, current.elementId);
      if (seen.has(key)) continue;
      seen.add(key);
      lineage.push(current);

      const model: Model | undefined = this.modelsById.get(current.modelId);
      const classifier: Classifier | undefined = model?.classifiers.find(
        (item: Classifier): boolean => item.kind === 'Node' && item.id === current.elementId,
      );
      const node: Node | undefined = classifier?.kind === 'Node' ? classifier : undefined;

      for (const ref of node?.superTypes ?? []) {
        const parent: ElementRef = ModelRef.isQualified(ref)
          ? { modelId: ModelRef.splitQualified(ref).modelId, elementId: ModelRef.localId(ref) }
          : { modelId: current.modelId, elementId: ref };
        pending.push(parent);
      }
    }
    return lineage;
  }

  /** Keeps project-wide findings and findings on the lineage, its relations and domain-specific paths. */
  public select(
    lineage: readonly ElementRef[],
    diagnostics: readonly Diagnostic[],
    extraPaths: readonly string[] = [],
  ): ValidationResult {
    const paths: readonly string[] = [...this.paths(lineage), ...extraPaths];
    const selected: readonly Diagnostic[] = diagnostics.filter(
      (item: Diagnostic): boolean =>
        item.path === '/' ||
        paths.some((path: string): boolean => item.path === path || item.path?.startsWith(`${path}/`) === true),
    );
    return { diagnostics: selected, hasErrors: selected.some((item: Diagnostic): boolean => item.severity === 'error') };
  }

  private paths(lineage: readonly ElementRef[]): readonly string[] {
    const keys: ReadonlySet<Ref> = new Set<Ref>(
      lineage.map((item: ElementRef): Ref => ModelRef.qualify(item.modelId, item.elementId)),
    );
    const paths: string[] = [];

    for (const model of this.models) {
      model.classifiers.forEach((item: Classifier, index: number): void => {
        if (keys.has(ModelRef.qualify(model.id, item.id))) paths.push(`/models/${model.id}/classifiers/${index}`);
      });
      model.relations.forEach((relation: Relation, index: number): void => {
        const from: Ref = this.referenceKey(relation.from.nodeId, model.id);
        const to: Ref = this.referenceKey(relation.to.nodeId, model.id);
        if (keys.has(from) || keys.has(to)) paths.push(`/models/${model.id}/relations/${index}`);
      });
    }
    return paths;
  }

  private referenceKey(ref: Ref, modelId: Id): Ref {
    return ModelRef.isQualified(ref) ? ref : ModelRef.qualify(modelId, ref);
  }
}
