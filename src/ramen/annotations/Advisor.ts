import { AnnotationProperties } from './Properties';
import { ModelRelationScope } from '../../model/graph/RelationScope';
import { EffectiveModel, ModelRef, ProjectGraph } from '../../model/index';
import { Cardinality } from '../../model/validation/Cardinality';
import type { Bounds, EffectiveNode, Attribute, Model, Node, Relation, Id, Ref, ResolvedModelElement } from '../../model/index';
import { RamenAnnotations, RamenAnnotationRelation } from './Definitions';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../model/ReferenceModel';
import { RamenAnnotationIndex, ResolvedRamenAnnotation } from './AnnotationIndex';

/** Property that can be selected for an annotation definition. */
export interface AnnotationPropertyAdvice {
  readonly modelId: Id;
  readonly attributeId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly modeledBounds: Bounds;
  readonly suggestedBounds: Bounds;
  readonly cardinalityOptions: readonly Bounds[];
}

/** Relation that can be selected for an annotation definition. */
export interface AnnotationRelationAdvice {
  readonly modelId: Id;
  readonly relationId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly targetNodeId: Id;
  readonly targetName: string;
  /** Local IDs or qualified references for imported target nodes. */
  readonly compatibleTargetNodeIds: readonly Ref[];
  readonly modeledBounds: Bounds;
  readonly suggestedBounds: Bounds;
  readonly cardinalityOptions: readonly Bounds[];
  /** Relation references counted together by suggestedBounds, when this choice belongs to an alternative group. */
  readonly alternatives?: readonly Ref[];
}

/** Complete creation advice for an annotation definition. */
export interface AnnotationAdvice {
  readonly properties: readonly AnnotationPropertyAdvice[];
  readonly relations: readonly AnnotationRelationAdvice[];
}

/** Computes valid annotation properties, relations, targets, and cardinality choices. */
export class RamenAnnotationAdvisor {
  /** Creates annotation advice over an already validated project graph. */
  public constructor(
    private readonly graph: ProjectGraph,
    private readonly relations: ModelRelationScope,
    private readonly annotations: RamenAnnotationIndex,
  ) {}

  /** Advises properties and relations available for a new annotation type. */
  public advise(modelId: Id, annotationNodeId: Id): AnnotationAdvice | undefined {
    const actual: ResolvedModelElement<Node> | undefined = this.graph.resolveNode(modelId, annotationNodeId);
    if (!actual || !this.annotations.isAnnotationNode(actual.modelId, actual.element.id)) return undefined;
    return {
      properties: this.propertyAdvice(modelId, actual),
      relations: this.relationAdvice(modelId, actual),
    };
  }

  /** Returns the effective properties and relations selected by one annotation type. */
  public adviseEffective(modelId: Id, annotationNodeId: Id, type: string): AnnotationAdvice | undefined {
    const definition: ResolvedRamenAnnotation | undefined = this.annotations.findEffective(modelId, annotationNodeId, type);
    if (!definition) return undefined;
    const actual: ResolvedModelElement<Node> | undefined = this.graph.resolveNode(modelId, annotationNodeId);
    if (!actual) return undefined;
    return {
      properties: this.selectedPropertyAdvice(modelId, actual, definition),
      relations: this.selectedRelationAdvice(modelId, actual, definition),
    };
  }

  private selectedPropertyAdvice(
    contextModelId: Id,
    actual: ResolvedModelElement<Node>,
    definition: ResolvedRamenAnnotation,
  ): readonly AnnotationPropertyAdvice[] {
    const lineage: readonly ResolvedModelElement<Node>[] = [
      actual,
      ...this.graph.getNodeAncestors(actual.modelId, actual.element.id),
    ];
    return AnnotationProperties.resolve(this.graph, definition, actual).map((attribute: Attribute): AnnotationPropertyAdvice => {
      const modelId: Id = this.attributeOwner(lineage, attribute.id)?.modelId ?? definition.modelId;
      return {
        modelId,
        attributeId: attribute.id,
        ref: modelId === contextModelId ? attribute.id : ModelRef.qualify(modelId, attribute.id),
        name: attribute.name,
        modeledBounds: attribute.bounds,
        suggestedBounds: attribute.bounds,
        cardinalityOptions: this.cardinalityOptions(attribute.bounds),
      };
    });
  }

  private propertyAdvice(contextModelId: Id, actual: ResolvedModelElement<Node>): readonly AnnotationPropertyAdvice[] {
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(this.graph, actual.modelId, actual.element.id);
    if (!effective) return [];
    const commonIds: ReadonlySet<Id> = this.commonAnnotationAttributeIds();

    return effective.attributes
      .filter((attribute: Attribute): boolean => !commonIds.has(attribute.id))
      .map((attribute: Attribute): AnnotationPropertyAdvice => {
        const owner: ResolvedModelElement<Node> = this.attributeOwner(effective.lineage, attribute.id) ?? actual;
        return {
          modelId: owner.modelId,
          attributeId: attribute.id,
          ref: owner.modelId === contextModelId ? attribute.id : ModelRef.qualify(owner.modelId, attribute.id),
          name: attribute.name,
          modeledBounds: { ...attribute.bounds },
          suggestedBounds: { ...attribute.bounds },
          cardinalityOptions: this.cardinalityOptions(attribute.bounds),
        };
      })
      .sort((left: AnnotationPropertyAdvice, right: AnnotationPropertyAdvice): number => left.name.localeCompare(right.name));
  }

  private relationAdvice(contextModelId: Id, actual: ResolvedModelElement<Node>): readonly AnnotationRelationAdvice[] {
    const result: AnnotationRelationAdvice[] = [];

    for (const item of this.relations.available(contextModelId)) {
      const owner: Model | undefined = this.graph.getModel(item.modelId);
      if (!owner) continue;
      this.addRelationAdvice(result, contextModelId, actual, owner, item.element, 'outgoing');
      this.addRelationAdvice(result, contextModelId, actual, owner, item.element, 'incoming');
    }

    return result.sort((left: AnnotationRelationAdvice, right: AnnotationRelationAdvice): number => {
      const byName: number = left.name.localeCompare(right.name);
      return byName === 0 ? left.direction.localeCompare(right.direction) : byName;
    });
  }

  private addRelationAdvice(
    result: AnnotationRelationAdvice[],
    contextModelId: Id,
    actual: ResolvedModelElement<Node>,
    owner: Model,
    relation: Relation,
    direction: 'outgoing' | 'incoming',
  ): void {
    const annotationRef: Ref = direction === 'outgoing' ? relation.from.nodeId : relation.to.nodeId;
    if (!this.graph.acceptsNode(owner.id, annotationRef, actual)) return;
    const targetRef: Ref = direction === 'outgoing' ? relation.to.nodeId : relation.from.nodeId;
    const target: ResolvedModelElement<Node> | undefined = this.graph.resolveNode(owner.id, targetRef);

    if (!target) return;
    const modeled: Bounds = direction === 'outgoing' ? relation.to.bounds : relation.from.bounds;

    result.push({
      modelId: owner.id,
      relationId: relation.id,
      ref: owner.id === contextModelId ? relation.id : ModelRef.qualify(owner.id, relation.id),
      name: relation.name,
      direction: direction,
      targetNodeId: target.element.id,
      targetName: target.element.name,
      compatibleTargetNodeIds: this.compatibleTargets(contextModelId, owner.id, targetRef),
      modeledBounds: { ...modeled },
      suggestedBounds: { ...modeled },
      cardinalityOptions: this.cardinalityOptions(modeled),
    });
  }

  private selectedRelationAdvice(
    modelId: Id,
    actual: ResolvedModelElement<Node>,
    definition: ResolvedRamenAnnotation,
  ): readonly AnnotationRelationAdvice[] {
    return this.relationAdvice(modelId, actual).flatMap((choice: AnnotationRelationAdvice): AnnotationRelationAdvice[] => {
      const requirement: RamenAnnotationRelation | undefined = definition.annotation.relations.find(
        (candidate: RamenAnnotationRelation): boolean =>
          candidate.direction === choice.direction &&
          RamenAnnotations.relationRefs(candidate).some((ref: Ref): boolean =>
            this.graph.isRelationRefSameOrSubtype(choice.modelId, choice.relationId, definition.modelId, ref),
          ),
      );
      if (!requirement) return [];

      return [
        {
          ...choice,
          suggestedBounds: requirement.bounds,
          cardinalityOptions: this.cardinalityOptions(requirement.bounds),
          ...(requirement.alternatives
            ? {
                alternatives: RamenAnnotations.relationRefs(requirement).map((ref: Ref): Ref =>
                  ModelRef.isQualified(ref) ? ref : ModelRef.qualify(definition.modelId, ref),
                ),
              }
            : {}),
        },
      ];
    });
  }

  private commonAnnotationAttributeIds(): ReadonlySet<Id> {
    const annotation: EffectiveNode | undefined = EffectiveModel.resolveNode(
      this.graph,
      RAMEN_MODEL.id,
      RAMEN_ELEMENT.ANNOTATION,
    );
    return new Set<Id>(annotation?.attributes.map((attribute: Attribute): Id => attribute.id) ?? []);
  }

  private attributeOwner(
    lineage: readonly ResolvedModelElement<Node>[],
    attributeId: Id,
  ): ResolvedModelElement<Node> | undefined {
    return lineage.find((item: ResolvedModelElement<Node>): boolean =>
      item.element.attributes.some((attribute: Attribute): boolean => attribute.id === attributeId),
    );
  }

  private compatibleTargets(modelId: Id, relationModelId: Id, targetRef: Ref): readonly Id[] {
    return this.graph
      .getAvailableNodes(modelId)
      .filter((candidate: ResolvedModelElement<Node>): boolean => this.graph.acceptsNode(relationModelId, targetRef, candidate))
      .map((candidate: ResolvedModelElement<Node>): Ref =>
        candidate.modelId === modelId ? candidate.element.id : ModelRef.qualify(candidate.modelId, candidate.element.id),
      );
  }

  private cardinalityOptions(allowed: Bounds): readonly Bounds[] {
    const common: readonly Bounds[] = [
      allowed,
      { lowerBound: 0, upperBound: 1 },
      { lowerBound: 1, upperBound: 1 },
      { lowerBound: 0, upperBound: -1 },
      { lowerBound: 1, upperBound: -1 },
    ];
    const unique: Map<string, Bounds> = new Map<string, Bounds>();

    for (const bounds of common) {
      if (!this.narrows(bounds, allowed)) continue;
      unique.set(`${bounds.lowerBound}:${bounds.upperBound}`, { ...bounds });
    }
    return [...unique.values()];
  }

  private narrows(actual: Bounds, allowed: Bounds): boolean {
    return Cardinality.isModelBoundsCompatible(allowed, actual);
  }
}
