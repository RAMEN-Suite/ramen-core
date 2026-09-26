import { ModelRef, Diagnostics, DiagnosticPath } from '../../model/index';
import type { Diagnostic, Id, Model, ProjectGraph, Ref, Relation, ResolvedModelElement } from '../../model/index';
import { RamenAnnotations } from '../model/Annotations';
import { RamenModelFormat } from '../model/Document';
import { RAMEN_MODEL } from '../model/ReferenceModel';

/** Resolves explicitly selected relations and the choices allowed by the preceding level. */
export class RamenRelationScope {
  private readonly documents: ReadonlyMap<Id, Model>;
  private readonly cache: Map<Id, readonly ResolvedModelElement<Relation>[]> = new Map<
    Id,
    readonly ResolvedModelElement<Relation>[]
  >();

  public constructor(
    private readonly graph: ProjectGraph,
    models: readonly Model[],
  ) {
    this.documents = new Map(models.filter(RamenModelFormat.isDocument).map((model: Model): [Id, Model] => [model.id, model]));
  }

  public bases(modelId: Id): readonly ResolvedModelElement<Relation>[] {
    const imported: readonly Model[] = this.graph
      .getTransitiveImports(modelId)
      .filter((model: Model): boolean => this.documents.has(model.id));
    const parents: readonly Id[] = imported
      .filter(
        (candidate: Model): boolean =>
          !imported.some(
            (other: Model): boolean =>
              other.id !== candidate.id &&
              this.graph.getTransitiveImports(other.id).some((ancestor: Model): boolean => ancestor.id === candidate.id),
          ),
      )
      .map((model: Model): Id => model.id);
    if (parents.length > 0)
      return this.unique(parents.flatMap((id: Id): readonly ResolvedModelElement<Relation>[] => this.available(id)));
    return this.declared(RAMEN_MODEL.id);
  }

  public available(modelId: Id): readonly ResolvedModelElement<Relation>[] {
    const cached: readonly ResolvedModelElement<Relation>[] | undefined = this.cache.get(modelId);
    if (cached) return cached;
    if (modelId === RAMEN_MODEL.id) return this.declared(modelId);
    const local: readonly ResolvedModelElement<Relation>[] = [...this.declared(modelId), ...this.reused(modelId)];
    const result: readonly ResolvedModelElement<Relation>[] = this.unique(local);
    this.cache.set(modelId, result);
    return result;
  }

  public allowsBase(modelId: Id, reference: Ref): boolean {
    const target: ResolvedModelElement<Relation> | undefined = this.graph.resolveRelation(modelId, reference);
    if (!target) return false;
    if (target.modelId === modelId) return true;
    return this.bases(modelId).some((base: ResolvedModelElement<Relation>): boolean => this.same(base, target));
  }

  public validate(): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const model of this.documents.values()) {
      if (!this.graph.getModel(model.id)) continue;
      for (const relation of model.relations) {
        const base: Ref | undefined = relation.superTypes[0];
        if (base && this.allowsBase(model.id, base)) continue;
        diagnostics.push(this.error(model.id, relation.id, 'relations'));
      }
      for (const annotation of RamenAnnotations.get(model)) {
        for (const relation of annotation.relations) {
          if (RamenAnnotations.relationRefs(relation).some((ref: Ref): boolean => !this.allowsBase(model.id, ref)))
            diagnostics.push(this.error(model.id, annotation.id, 'annotations'));
        }
      }
    }
    return diagnostics;
  }

  private error(modelId: Id, elementId: Id, collection: string): Diagnostic {
    return Diagnostics.error({
      code: 'RAMEN_RELATION_SCOPE_INVALID',
      message: 'Select a relation permitted by the preceding model level.',
      path: DiagnosticPath.root().property('models').property(modelId).property(collection).property(elementId),
      ref: elementId,
    });
  }

  private reused(modelId: Id): readonly ResolvedModelElement<Relation>[] {
    const model: Model | undefined = this.documents.get(modelId);
    const result: ResolvedModelElement<Relation>[] = [];
    for (const annotation of model ? RamenAnnotations.get(model) : []) {
      for (const requirement of annotation.relations) {
        for (const ref of RamenAnnotations.relationRefs(requirement)) {
          if (!this.allowsBase(modelId, ref)) continue;
          const relation: ResolvedModelElement<Relation> | undefined = this.graph.resolveRelation(modelId, ref);
          if (relation) result.push(relation);
        }
      }
    }
    return result;
  }

  private declared(modelId: Id): readonly ResolvedModelElement<Relation>[] {
    return (
      this.graph
        .getModel(modelId)
        ?.relations.map((element: Relation): ResolvedModelElement<Relation> => ({ modelId, element })) ?? []
    );
  }

  private same(left: ResolvedModelElement<Relation>, right: ResolvedModelElement<Relation>): boolean {
    return left.modelId === right.modelId && left.element.id === right.element.id;
  }

  private unique(relations: readonly ResolvedModelElement<Relation>[]): readonly ResolvedModelElement<Relation>[] {
    const indexed: Map<Ref, ResolvedModelElement<Relation>> = new Map<Ref, ResolvedModelElement<Relation>>(
      relations.map((item: ResolvedModelElement<Relation>): [Ref, ResolvedModelElement<Relation>] => [
        ModelRef.qualify(item.modelId, item.element.id),
        item,
      ]),
    );
    return [...indexed.values()];
  }
}
