import type { Id, Ref, Model, Relation } from '../Types';
import type { ProjectGraph, ResolvedElement } from './ProjectGraph';
import { ModelRef } from './References';

/** Extra explicit relation selections supplied by a language extension, grouped by model. */
export type RelationSelections = ReadonlyMap<Id, readonly Ref[]>;

/** Resolves relation choices and enforces selection at every model level. */
export class ModelRelationScope {
  private readonly availableCache: Map<Id, readonly ResolvedElement<Relation>[]> = new Map<
    Id,
    readonly ResolvedElement<Relation>[]
  >();
  private readonly baseCache: Map<Id, readonly ResolvedElement<Relation>[]> = new Map<Id, readonly ResolvedElement<Relation>[]>();

  /** Uses local relation declarations and any explicit extension selections. */
  public constructor(
    private readonly graph: ProjectGraph,
    private readonly selections: RelationSelections = new Map<Id, readonly Ref[]>(),
  ) {}

  /** Lists relation definitions selected by the preceding model level. */
  public bases(modelId: Id): readonly ResolvedElement<Relation>[] {
    const cached: readonly ResolvedElement<Relation>[] | undefined = this.baseCache.get(modelId);
    if (cached) return cached;
    const parents: readonly Model[] = this.graph.getImportedModels(modelId);
    const ancestors: ReadonlySet<Id> = new Set<Id>(
      parents.flatMap((parent: Model): Id[] => this.graph.getTransitiveImports(parent.id).map((model: Model): Id => model.id)),
    );
    const nearest: readonly Model[] = parents.filter((parent: Model): boolean => !ancestors.has(parent.id));
    const bases: readonly ResolvedElement<Relation>[] = this.unique(
      nearest.flatMap((parent: Model): readonly ResolvedElement<Relation>[] => this.available(parent.id)),
    );
    this.baseCache.set(modelId, bases);
    return bases;
  }

  /** Lists relations explicitly selected in the current level; nothing is inherited implicitly. */
  public available(modelId: Id): readonly ResolvedElement<Relation>[] {
    const cached: readonly ResolvedElement<Relation>[] | undefined = this.availableCache.get(modelId);
    if (cached) return cached;
    const declared: readonly ResolvedElement<Relation>[] =
      this.graph.getModel(modelId)?.relations.map((element: Relation): ResolvedElement<Relation> => ({ modelId, element })) ?? [];
    const reused: readonly ResolvedElement<Relation>[] = (this.selections.get(modelId) ?? []).flatMap(
      (ref: Ref): ResolvedElement<Relation>[] => {
        const relation: ResolvedElement<Relation> | undefined = this.graph.resolveRelation(modelId, ref);
        return relation && this.allowsBase(modelId, ref) ? [relation] : [];
      },
    );
    const available: readonly ResolvedElement<Relation>[] = this.unique([...declared, ...reused]);
    this.availableCache.set(modelId, available);
    return available;
  }

  /** Reports whether a selection names a local declaration or a permitted predecessor relation. */
  public allowsBase(modelId: Id, reference: Ref): boolean {
    const target: ResolvedElement<Relation> | undefined = this.graph.resolveRelation(modelId, reference);
    if (!target) return false;
    if (target.modelId === modelId) return true;
    const key: Ref = ModelRef.qualify(target.modelId, target.element.id);
    return this.bases(modelId).some(
      (base: ResolvedElement<Relation>): boolean => ModelRef.qualify(base.modelId, base.element.id) === key,
    );
  }

  private unique(relations: readonly ResolvedElement<Relation>[]): readonly ResolvedElement<Relation>[] {
    const indexed: ReadonlyMap<Ref, ResolvedElement<Relation>> = new Map<Ref, ResolvedElement<Relation>>(
      relations.map((item: ResolvedElement<Relation>): [Ref, ResolvedElement<Relation>] => [
        ModelRef.qualify(item.modelId, item.element.id),
        item,
      ]),
    );
    return Object.freeze([...indexed.values()]);
  }
}
