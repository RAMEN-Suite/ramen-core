import { ModelAdvisor, NodeRelationSuggestion } from '../model/Advisor';
import { ModelRef } from '../model/graph/References';
import type { Model, Node, Id, Ref } from '../model/Types';
import type { ResolvedElement } from '../model/graph/ProjectGraph';
import type { ValidProjectResult } from '../model/validation/ModelValidator';
import { RamenAnnotations, AnnotationRelation } from './annotations/Definitions';
import { RamenAnnotationIndex, ResolvedRamenAnnotation } from './annotations/AnnotationIndex';
import {
  AnnotationAdvice,
  AnnotationPropertyAdvice,
  AnnotationRelationAdvice,
  RamenAnnotationAdvisor,
} from './annotations/Advisor';
export type {
  NodeSuggestion,
  DataTypeSuggestion,
  RelationSuggestion,
  NodeLineageItem,
  AttributeSuggestion,
  NodeRelationSuggestion,
  NodeAdvice,
  AttributeCreationAdvice,
} from '../model/Advisor';

/** One closed annotation variant declared by a reachable RAMEN model. */
export interface AnnotationSuggestion {
  readonly modelId: Id;
  readonly annotationId: Id;
  readonly ownerNodeId: Ref;
  readonly ref: Ref;
  readonly type: string;
}

/** Adds RAMEN annotation suggestions to the generic modeling advisor. */
export class RamenAdvisor extends ModelAdvisor {
  private readonly annotations: RamenAnnotationIndex;
  private readonly annotationAdvisor: RamenAnnotationAdvisor;

  /** Creates a RAMEN advisor for a validated snapshot. */
  public constructor(result: ValidProjectResult, models: readonly Model[]) {
    super(result, RamenAnnotations.relationSelections(models));
    this.annotations = new RamenAnnotationIndex(result.graph, models);
    this.annotationAdvisor = new RamenAnnotationAdvisor(result.graph, this.relations, this.annotations);
  }

  /** Lists all reachable annotations, or only the effective variants of one Annotation node. */
  public suggestAnnotations(modelId: Id, annotationNodeId?: Id): readonly AnnotationSuggestion[] {
    const visibleModels: ReadonlySet<Id> = new Set<Id>([
      modelId,
      ...this.importedModels(modelId).map((model: Model): Id => model.id),
    ]);
    const candidates: readonly ResolvedRamenAnnotation[] = annotationNodeId
      ? this.annotations.getEffective(modelId, annotationNodeId)
      : this.annotations.getAll().filter((candidate: ResolvedRamenAnnotation): boolean => visibleModels.has(candidate.modelId));

    return candidates
      .map((candidate: ResolvedRamenAnnotation): AnnotationSuggestion => ({
        modelId: candidate.modelId,
        annotationId: candidate.annotation.id,
        ownerNodeId: candidate.annotation.annotationId,
        ref:
          candidate.modelId === modelId ? candidate.annotation.id : ModelRef.qualify(candidate.modelId, candidate.annotation.id),
        type: candidate.annotation.type,
      }))
      .sort((left: AnnotationSuggestion, right: AnnotationSuggestion): number => left.type.localeCompare(right.type));
  }

  /** Lists effective annotation variants attachable to one local or imported node through modeled relations. */
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
    return this.suggestAnnotations(modelId, targetId).filter((suggestion: AnnotationSuggestion): boolean => {
      const definition: ResolvedRamenAnnotation | undefined = this.annotations.findEffective(modelId, targetId, suggestion.type);
      if (!definition) return false;
      return definition.annotation.relations.some(
        (requirement: AnnotationRelation): boolean =>
          requirement.direction === 'incoming' &&
          requirement.bounds.upperBound !== 0 &&
          RamenAnnotations.relationRefs(requirement).some((ref: Ref): boolean =>
            this.graph.isRelationRefSameOrSubtype(relation.modelId, relation.relationId, definition.modelId, ref),
          ),
      );
    });
  }

  /** Suggests valid properties, relations, targets, and cardinalities for an annotation definition. */
  public adviseAnnotation(modelId: Id, annotationNodeId: Id): AnnotationAdvice | undefined {
    return this.annotationAdvisor.advise(modelId, annotationNodeId);
  }

  /** Lists the modeled relations permitted by one effective annotation type. */
  public suggestRelationsForAnnotation(modelId: Id, annotationNodeId: Id, type: string): readonly AnnotationRelationAdvice[] {
    return this.annotationAdvisor.adviseEffective(modelId, annotationNodeId, type)?.relations ?? [];
  }

  /** Lists properties available for one annotation type, including its own declarations. */
  public suggestAttributesForAnnotation(modelId: Id, nodeId: Id, type: string): readonly AnnotationPropertyAdvice[] {
    return this.annotationAdvisor.adviseEffective(modelId, nodeId, type)?.properties ?? [];
  }
}
