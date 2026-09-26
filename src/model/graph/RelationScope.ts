import type { Id, Ref, Model, Relation } from '../Types';
import type { ProjectGraph, ResolvedModelElement } from './ProjectGraph';
import { ModelRef } from './References';

/** Extra explicit relation selections supplied by a language extension, grouped by model. */
export type RelationSelections = ReadonlyMap<Id, readonly Ref[]>;

/** Resolves relation choices and enforces selection at every model level. */
export class ModelRelationScope {
  private readonly availableCache: Map<Id, readonly ResolvedModelElement<Relation>[]> = new Map<
    Id,
    readonly ResolvedModelElement<Relation>[]
  >();
  private readonly baseCache: Map<Id, readonly ResolvedModelElement<Relation>[]> = new Map<
    Id,
    readonly ResolvedModelElement<Relation>[]
  >();

  /** Uses local relation declarations and any explicit extension selections. */
  public constructor(
    private readonly graph: ProjectGraph,
    private readonly selections: RelationSelections = new Map<Id, readonly Ref[]>(),
  ) {}

  /** Lists relation definitions selected by the preceding model level. */
  public bases(modelId: Id): readonly ResolvedModelElement<Relation>[] {
    const cached: readonly ResolvedModelElement<Relation>[] | undefined = this.baseCache.get(modelId);
    if (cached) return cached;
    const parents: readonly Model[] = this.graph.getImportedModels(modelId);
    const ancestors: ReadonlySet<Id> = new Set<Id>(
      parents.flatMap((parent: Model): Id[] => this.graph.getTransitiveImports(parent.id).map((model: Model): Id => model.id)),
    );
    const nearest: readonly Model[] = parents.filter((parent: Model): boolean => !ancestors.has(parent.id));
    const bases: readonly ResolvedModelElement<Relation>[] = this.unique(
      nearest.flatMap((parent: Model): readonly ResolvedModelElement<Relation>[] => this.available(parent.id)),
    );
    this.baseCache.set(modelId, bases);
    return bases;
  }

  /** Lists relations explicitly selected in the current level; nothing is inherited implicitly. */
  public available(modelId: Id): readonly ResolvedModelElement<Relation>[] {
    const cached: readonly ResolvedModelElement<Relation>[] | undefined = this.availableCache.get(modelId);
    if (cached) return cached;
    const declared: readonly ResolvedModelElement<Relation>[] =
      this.graph
        .getModel(modelId)
        ?.relations.map((element: Relation): ResolvedModelElement<Relation> => ({ modelId, element })) ?? [];
    const reused: readonly ResolvedModelElement<Relation>[] = (this.selections.get(modelId) ?? []).flatMap(
      (ref: Ref): ResolvedModelElement<Relation>[] => {
        const relation: ResolvedModelElement<Relation> | undefined = this.graph.resolveRelation(modelId, ref);
        return relation && this.allowsBase(modelId, ref) ? [relation] : [];
      },
    );
    const available: readonly ResolvedModelElement<Relation>[] = this.unique([...declared, ...reused]);
    this.availableCache.set(modelId, available);
    return available;
  }

  /** Reports whether a selection names a local declaration or a permitted predecessor relation. */
  public allowsBase(modelId: Id, reference: Ref): boolean {
    const target: ResolvedModelElement<Relation> | undefined = this.graph.resolveRelation(modelId, reference);
    if (!target) return false;
    if (target.modelId === modelId) return true;
    const key: Ref = ModelRef.qualify(target.modelId, target.element.id);
    return this.bases(modelId).some(
      (base: ResolvedModelElement<Relation>): boolean => ModelRef.qualify(base.modelId, base.element.id) === key,
    );
  }

  private unique(relations: readonly ResolvedModelElement<Relation>[]): readonly ResolvedModelElement<Relation>[] {
    const indexed: ReadonlyMap<Ref, ResolvedModelElement<Relation>> = new Map<Ref, ResolvedModelElement<Relation>>(
      relations.map((item: ResolvedModelElement<Relation>): [Ref, ResolvedModelElement<Relation>] => [
        ModelRef.qualify(item.modelId, item.element.id),
        item,
      ]),
    );
    return Object.freeze([...indexed.values()]);
  }
}
