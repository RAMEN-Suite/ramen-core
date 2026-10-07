import type { Id, Ref, Model, Relation } from '../Types';
import type { ProjectGraph, ResolvedElement } from './ProjectGraph';
import { ModelRef } from './References';
import { walkGraph } from './Traversal';

/** Extra explicit relation selections supplied by a language extension, grouped by model. */
export type RelationSelections = ReadonlyMap<Id, readonly Ref[]>;
type Relations = ReadonlyMap<Ref, ResolvedElement<Relation>>;

/** Resolves relation choices and enforces selection at every model level. */
export class ModelRelationScope {
  private readonly availableCache: Map<Id, Relations> = new Map<Id, Relations>();
  private readonly baseCache: Map<Id, Relations> = new Map<Id, Relations>();

  /** Uses local relation declarations and any explicit extension selections. */
  public constructor(
    private readonly graph: ProjectGraph,
    private readonly selections: RelationSelections = new Map<Id, readonly Ref[]>(),
  ) {}

  /** Lists relation definitions selected by the preceding model level. */
  public bases(modelId: Id): readonly ResolvedElement<Relation>[] {
    this.prepare(modelId);
    return Object.freeze([...(this.baseCache.get(modelId)?.values() ?? [])]);
  }

  /** Lists relations explicitly selected in the current level; nothing is inherited implicitly. */
  public available(modelId: Id): readonly ResolvedElement<Relation>[] {
    this.prepare(modelId);
    return Object.freeze([...(this.availableCache.get(modelId)?.values() ?? [])]);
  }

  /** Reports whether a selection names a local declaration or a permitted predecessor relation. */
  public allowsBase(modelId: Id, reference: Ref): boolean {
    this.prepare(modelId);
    const key: Ref = ModelRef.isQualified(reference) ? reference : ModelRef.qualify(modelId, reference);
    if (this.baseCache.get(modelId)?.has(key)) return true;
    const target: { readonly modelId: Id; readonly refId: Id } = ModelRef.splitQualified(key);
    return target.modelId === modelId && this.graph.getRelation(modelId, target.refId) !== undefined;
  }

  private prepare(modelId: Id): void {
    if (this.availableCache.has(modelId)) return;
    const children: (id: Id) => readonly Id[] = (id: Id): readonly Id[] => {
      if (this.availableCache.has(id) || !this.graph.hasModel(id)) return [];
      return this.graph.getImportedModels(id).map((model: Model): Id => model.id);
    };

    walkGraph(
      [modelId],
      children,
      (): void => {
        throw new Error('Relation scope requires an acyclic project graph.');
      },
      (id: Id): void => this.indexLevel(id),
    );
  }

  private indexLevel(modelId: Id): void {
    if (this.availableCache.has(modelId)) return;
    const bases: Map<Ref, ResolvedElement<Relation>> = new Map<Ref, ResolvedElement<Relation>>();
    for (const parent of this.nearestParents(modelId)) {
      for (const [key, item] of this.availableCache.get(parent.id) ?? []) bases.set(key, item);
    }
    const available: Map<Ref, ResolvedElement<Relation>> = new Map<Ref, ResolvedElement<Relation>>();
    for (const element of this.graph.getModel(modelId)?.relations ?? []) {
      available.set(ModelRef.qualify(modelId, element.id), Object.freeze({ modelId, element }));
    }

    for (const reference of this.selections.get(modelId) ?? []) {
      const key: Ref = ModelRef.isQualified(reference) ? reference : ModelRef.qualify(modelId, reference);
      const item: ResolvedElement<Relation> | undefined = bases.get(key);
      if (item) available.set(key, item);
    }

    this.baseCache.set(modelId, bases);
    this.availableCache.set(modelId, available);
  }

  private nearestParents(modelId: Id): readonly Model[] {
    if (!this.graph.hasModel(modelId)) return [];
    const parents: readonly Model[] = this.graph.getImportedModels(modelId);
    if (parents.length < 2) return parents;
    const ancestors: Set<Id> = new Set<Id>();
    for (const parent of parents) {
      for (const ancestor of this.graph.getTransitiveImports(parent.id)) ancestors.add(ancestor.id);
    }
    return parents.filter((parent: Model): boolean => !ancestors.has(parent.id));
  }
}
