import {
  ModelAdvisor,
  type NodeRelationSuggestion,
  ModelRef,
  type Model,
  type Node,
  type Id,
  type Ref,
  type ResolvedElement,
  type ValidProjectResult,
} from '../model/index.js';

import { AnnotationShapes, AnnotationShapeRelation } from './annotations/Definitions.js';
import { AnnotationIndex, ResolvedAnnotationShape } from './annotations/AnnotationIndex.js';
import { AnnotationShapeOptions, PropertyOption, RelationOption, AnnotationAdvisor } from './annotations/Advisor.js';
export type {
  NodeSuggestion,
  DataTypeSuggestion,
  RelationSuggestion,
  RelationSelection,
  NodeLineageItem,
  AttributeInfo,
  NodeRelationSuggestion,
  AttributeNameResult,
} from '../model/Advisor.js';

/** One closed annotation variant declared by a reachable RAMEN model. */
export interface AnnotationShapeSuggestion {
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
    super(result, AnnotationShapes.relationSelections(models));
    this.annotations = new AnnotationIndex(result.graph, models);
    this.annotationAdvisor = new AnnotationAdvisor(result.graph, this.relations, this.annotations);
  }

  /** Lists properties available for one annotation shape, including its own declarations. */
  public getPropertiesForAnnotationShape(modelId: Id, nodeId: Id, type: string): readonly PropertyOption[] {
    return this.annotationAdvisor.getTypeInfo(modelId, nodeId, type)?.properties ?? [];
  }

  /** Lists the modelled relations permitted by one effective annotation shape. */
  public getRelationsForAnnotationShape(modelId: Id, annotationNodeId: Id, type: string): readonly RelationOption[] {
    return this.annotationAdvisor.getTypeInfo(modelId, annotationNodeId, type)?.relations ?? [];
  }

  /** Lists all reachable annotations, or only the effective variants of one Annotation node. */
  public suggestAnnotationShapes(modelId: Id, annotationNodeId?: Id): readonly AnnotationShapeSuggestion[] {
    const visibleModels: ReadonlySet<Id> = new Set<Id>([
      modelId,
      ...this.importedModels(modelId).map((model: Model): Id => model.id),
    ]);

    const available: readonly ResolvedAnnotationShape[] = annotationNodeId
      ? this.annotations.getEffective(modelId, annotationNodeId)
      : this.annotations.getAll();

    const selectedNode: boolean = Boolean(annotationNodeId);
    const candidates: readonly ResolvedAnnotationShape[] = available.filter(
      (candidate: ResolvedAnnotationShape): boolean => selectedNode || visibleModels.has(candidate.modelId),
    );

    return candidates
      .map((candidate: ResolvedAnnotationShape): AnnotationShapeSuggestion => this.annotationSuggestion(modelId, candidate))
      .sort((left: AnnotationShapeSuggestion, right: AnnotationShapeSuggestion): number => left.type.localeCompare(right.type));
  }

  /** Lists effective annotation variants attachable to one local or imported node through modelled relations. */
  public suggestAnnotationShapesForNode(modelId: Id, nodeId: Id, annotationNodeId?: Ref): readonly AnnotationShapeSuggestion[] {
    const actual: ResolvedElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    if (!actual) return [];

    const selected: ResolvedElement<Node> | undefined = annotationNodeId
      ? this.resolveNode(modelId, annotationNodeId)
      : undefined;
    if (annotationNodeId && !selected) return [];
    const result: Map<string, AnnotationShapeSuggestion> = new Map<string, AnnotationShapeSuggestion>();

    const relations: readonly NodeRelationSuggestion[] = this.nodeRelationSuggestions(modelId, actual);
    for (const relation of relations) {
      if (relation.direction !== 'outgoing') continue;
      const targetIds: readonly Ref[] = this.annotationTargets(modelId, relation, selected);

      for (const targetId of targetIds) {
        const suggestions: readonly AnnotationShapeSuggestion[] = this.annotationsAcceptingRelation(modelId, targetId, relation);
        for (const suggestion of suggestions) {
          result.set(`${suggestion.modelId}:${suggestion.annotationId}`, suggestion);
        }
      }
    }

    return [...result.values()].sort((left: AnnotationShapeSuggestion, right: AnnotationShapeSuggestion): number =>
      left.type.localeCompare(right.type),
    );
  }

  /** Lists valid property, relation, target and cardinality options for a new annotation definition. */
  public suggestAnnotationShapeOptions(modelId: Id, annotationNodeId: Id): AnnotationShapeOptions | undefined {
    return this.annotationAdvisor.suggestOptions(modelId, annotationNodeId);
  }

  private annotationTargets(modelId: Id, relation: NodeRelationSuggestion, selected?: ResolvedElement<Node>): readonly Ref[] {
    return relation.compatibleTargetNodeIds.filter((ref: Ref): boolean => {
      const target: ResolvedElement<Node> | undefined = this.resolveNode(modelId, ref);
      if (!target) return false;

      const isAnnotation: boolean = this.annotations.isAnnotationNode(target.modelId, target.element.id);
      if (!isAnnotation) return false;

      return !selected || (selected.modelId === target.modelId && selected.element.id === target.element.id);
    });
  }

  private annotationsAcceptingRelation(
    modelId: Id,
    targetId: Id,
    relation: NodeRelationSuggestion,
  ): readonly AnnotationShapeSuggestion[] {
    return this.annotations
      .getEffective(modelId, targetId)
      .filter((definition: ResolvedAnnotationShape): boolean =>
        definition.annotation.relations.some(
          (requirement: AnnotationShapeRelation): boolean =>
            requirement.direction === 'incoming' &&
            requirement.bounds.upperBound !== 0 &&
            requirement.relationIds.some((ref: Ref): boolean =>
              this.graph.isRelationRefSameOrSubtype(relation.modelId, relation.relationId, definition.modelId, ref),
            ),
        ),
      )
      .map((definition: ResolvedAnnotationShape): AnnotationShapeSuggestion => this.annotationSuggestion(modelId, definition));
  }

  private annotationSuggestion(modelId: Id, definition: ResolvedAnnotationShape): AnnotationShapeSuggestion {
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
