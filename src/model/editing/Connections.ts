import { ModelAdvisor, RelationSuggestion, RelationSelection } from '../Advisor.js';
import { ModelFactory } from './Factory.js';
import type { ResolvedElement } from '../graph/ProjectGraph.js';
import { ModelRef } from '../graph/References.js';
import type { RelationSelections } from '../graph/RelationScope.js';
import type { ValidProjectResult } from '../validation/ModelValidator.js';
import type { Model, Node, Ref, Relation } from '../Types.js';

/** A selected relation reference or an unchanged suggestion returned by the advisor. */
export type RelationChoice = Ref | Pick<RelationSuggestion, 'ref'>;

export type { RelationSelection } from '../Advisor.js';

/** Creates relation refinements from a validated model snapshot without changing that snapshot. */
export class ModelConnections {
  private readonly advisor: ModelAdvisor;
  private readonly model: Model;

  /** Uses the root model as the editing level; imported nodes use qualified references. */
  public constructor(
    private readonly project: ValidProjectResult,
    selections?: RelationSelections,
  ) {
    this.advisor = new ModelAdvisor(project, selections);
    this.model = project.graph.getRootModel();
  }

  /** Lists local and permitted predecessor relations between these node types. */
  public suggestRelations(from: Node | Ref, to: Node | Ref): readonly RelationSuggestion[] {
    return this.advisor.suggestRelations(this.model.id, this.nodeRef(from), this.nodeRef(to));
  }

  /** Lists exact endpoint matches; no matches produce an empty list and parallel relationships remain separate. */
  public getRelations(from: Node | Ref, to: Node | Ref): readonly RelationSelection[] {
    return this.advisor.getRelations(this.model.id, this.nodeRef(from), this.nodeRef(to));
  }

  /**
   * Creates a relation using the chosen reference, or the unique most specific suggestion.
   * Add the returned relation with ModelEditor.addRelation; this object never edits a model.
   * Throws if the selection is unavailable, incompatible or ambiguous.
   */
  public createRelation(input: {
    readonly fromNode: Node | Ref;
    readonly toNode: Node | Ref;
    readonly refines?: RelationChoice;
  }): Relation {
    const { fromNode: from, toNode: to, refines: choice } = input;
    const suggestions: readonly RelationSuggestion[] = this.suggestRelations(from, to);
    const selected: RelationSuggestion = this.select(suggestions, choice);

    const base: Model | undefined = this.project.graph.getModel(selected.modelId);
    if (!base) throw new Error(`Relation model not found: '${selected.modelId}'.`);

    return ModelFactory.createRelation(base, base.id, {
      baseRelationId: selected.relationId,
      fromNodeId: this.nodeRef(from),
      toNodeId: this.nodeRef(to),
    });
  }

  /**
   * Selects from suggestions, also allowing a domain wrapper to filter them before choosing.
   * @throws When the chosen relation is unavailable, or the suggestions have no unique most specific candidate.
   */
  public select(suggestions: readonly RelationSuggestion[], choice?: RelationChoice): RelationSuggestion {
    if (choice !== undefined) {
      const ref: Ref = typeof choice === 'string' ? choice : choice.ref;
      const selected: RelationSuggestion | undefined = suggestions.find((item: RelationSuggestion): boolean => item.ref === ref);

      if (!selected) throw new Error(`Selected relation '${ref}' does not connect these nodes.`);
      return selected;
    }

    const ancestors: ReadonlySet<Ref> = this.ancestors(suggestions);
    const candidates: readonly RelationSuggestion[] = suggestions.filter(
      (item: RelationSuggestion): boolean => !ancestors.has(item.ref),
    );
    const selected: RelationSuggestion | undefined = candidates[0];

    if (candidates.length !== 1 || !selected) {
      const names: string = candidates.map((item: RelationSuggestion): string => item.name).join(', ');
      throw new Error(
        `Expected one relation, found ${candidates.length}${names ? `: ${names}` : ''}. Select a relation explicitly.`,
      );
    }
    return selected;
  }

  private ancestors(suggestions: readonly RelationSuggestion[]): ReadonlySet<Ref> {
    const refs: Set<Ref> = new Set<Ref>();
    for (const item of suggestions) {
      const ancestors: readonly ResolvedElement<Relation>[] = this.project.graph.getRelationAncestors(
        item.modelId,
        item.relationId,
      );

      for (const ancestor of ancestors) {
        refs.add(ModelRef.qualify(ancestor.modelId, ancestor.element.id));
      }
    }
    return refs;
  }

  private nodeRef(node: Node | Ref): Ref {
    return typeof node === 'string' ? node : node.id;
  }
}
