import { ModelAdvisor, NodeRelationSuggestion } from '../model/Advisor';
import { ModelRef } from '../model/graph/References';
import type { Model, Node, Id, Ref } from '../model/Types';
import type { ResolvedElement } from '../model/graph/ProjectGraph';
import type { ValidProjectResult } from '../model/validation/ModelValidator';
import { RamenAnnotations, AnnotationRelation } from './annotations/Definitions';
import { AnnotationIndex, ResolvedAnnotation } from './annotations/AnnotationIndex';
import { AnnotationOptions, PropertyOption, RelationOption, AnnotationAdvisor } from './annotations/Advisor';
export type {
  NodeSuggestion,
  DataTypeSuggestion,
  RelationSuggestion,
  RelationSelection,
  NodeLineageItem,
  AttributeInfo,
  NodeRelationSuggestion,
  AttributeNameResult,
} from '../model/Advisor';

/** One closed annotation variant declared by a reachable RAMEN model. */
export interface AnnotationSuggestion {
  readonly modelId: Id;
  readonly annotationId: Id;
  readonly ownerNodeId: Ref;
  readonly ref: Ref;
  readonly type: string;
}

/** Adds RAMEN annotation suggestions to the generic modelling advisor. */
export class RamenAdvisor extends ModelAdvisor {
  private readonly annotations: AnnotationIndex;
  private readonly annotationAdvisor: AnnotationAdvisor;

  /** Creates a RAMEN advisor for a validated snapshot. */
  public constructor(result: ValidProjectResult, models: readonly Model[]) {
    super(result, RamenAnnotations.relationSelections(models));
    this.annotations = new AnnotationIndex(result.graph, models);
    this.annotationAdvisor = new AnnotationAdvisor(result.graph, this.relations, this.annotations);
  }

  /** Lists properties available for one annotation type, including its own declarations. */
  public getAttributesForAnnotation(modelId: Id, nodeId: Id, type: string): readonly PropertyOption[] {
    return this.annotationAdvisor.getTypeInfo(modelId, nodeId, type)?.properties ?? [];
  }

  /** Lists the modelled relations permitted by one effective annotation type. */
  public getRelationsForAnnotation(modelId: Id, annotationNodeId: Id, type: string): readonly RelationOption[] {
    return this.annotationAdvisor.getTypeInfo(modelId, annotationNodeId, type)?.relations ?? [];
  }

  /** Lists all reachable annotations, or only the effective variants of one Annotation node. */
  public suggestAnnotations(modelId: Id, annotationNodeId?: Id): readonly AnnotationSuggestion[] {
    const visibleModels: ReadonlySet<Id> = new Set<Id>([
      modelId,
      ...this.importedModels(modelId).map((model: Model): Id => model.id),
    ]);
    const candidates: readonly ResolvedAnnotation[] = annotationNodeId
      ? this.annotations.getEffective(modelId, annotationNodeId)
      : this.annotations.getAll().filter((candidate: ResolvedAnnotation): boolean => visibleModels.has(candidate.modelId));

    return candidates
      .map((candidate: ResolvedAnnotation): AnnotationSuggestion => this.annotationSuggestion(modelId, candidate))
      .sort((left: AnnotationSuggestion, right: AnnotationSuggestion): number => left.type.localeCompare(right.type));
  }

  /** Lists effective annotation variants attachable to one local or imported node through modelled relations. */
  public suggestAnnotationsForNode(modelId: Id, nodeId: Id, annotationNodeId?: Ref): readonly AnnotationSuggestion[] {
    const actual: ResolvedElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    if (!actual) return [];
    const selected: ResolvedElement<Node> | undefined = annotationNodeId
      ? this.resolveNode(modelId, annotationNodeId)
      : undefined;
    if (annotationNodeId && !selected) return [];
    const result: Map<string, AnnotationSuggestion> = new Map<string, AnnotationSuggestion>();

    for (const relation of this.nodeRelationSuggestions(modelId, actual)) {
      if (relation.direction !== 'outgoing') continue;
      for (const targetId of this.annotationTargets(modelId, relation, selected)) {
        for (const suggestion of this.annotationsAcceptingRelation(modelId, targetId, relation)) {
          result.set(`${suggestion.modelId}:${suggestion.annotationId}`, suggestion);
        }
      }
    }

    return [...result.values()].sort((left: AnnotationSuggestion, right: AnnotationSuggestion): number =>
      left.type.localeCompare(right.type),
    );
  }

  /** Lists valid property, relation, target and cardinality options for a new annotation definition. */
  public suggestAnnotationOptions(modelId: Id, annotationNodeId: Id): AnnotationOptions | undefined {
    return this.annotationAdvisor.suggestOptions(modelId, annotationNodeId);
  }

  private annotationTargets(modelId: Id, relation: NodeRelationSuggestion, selected?: ResolvedElement<Node>): readonly Ref[] {
    return relation.compatibleTargetNodeIds.filter((ref: Ref): boolean => {
      const target: ResolvedElement<Node> | undefined = this.resolveNode(modelId, ref);
      if (!target || !this.annotations.isAnnotationNode(target.modelId, target.element.id)) return false;
      return !selected || (selected.modelId === target.modelId && selected.element.id === target.element.id);
    });
  }

  private annotationsAcceptingRelation(
    modelId: Id,
    targetId: Id,
    relation: NodeRelationSuggestion,
  ): readonly AnnotationSuggestion[] {
    return this.annotations
      .getEffective(modelId, targetId)
      .filter((definition: ResolvedAnnotation): boolean =>
        definition.annotation.relations.some(
          (requirement: AnnotationRelation): boolean =>
            requirement.direction === 'incoming' &&
            requirement.bounds.upperBound !== 0 &&
            requirement.relationIds.some((ref: Ref): boolean =>
              this.graph.isRelationRefSameOrSubtype(relation.modelId, relation.relationId, definition.modelId, ref),
            ),
        ),
      )
      .map((definition: ResolvedAnnotation): AnnotationSuggestion => this.annotationSuggestion(modelId, definition));
  }

  private annotationSuggestion(modelId: Id, definition: ResolvedAnnotation): AnnotationSuggestion {
    return {
      modelId: definition.modelId,
      annotationId: definition.annotation.id,
      ownerNodeId: definition.annotation.annotationId,
      ref:
        definition.modelId === modelId
          ? definition.annotation.id
          : ModelRef.qualify(definition.modelId, definition.annotation.id),
      type: definition.annotation.type,
    };
  }
}
