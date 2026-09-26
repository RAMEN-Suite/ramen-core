import { AnnotationProperties } from './Properties';
import { ModelRelationScope } from '../../model/graph/RelationScope';
import { EffectiveModel, ModelRef, ProjectGraph } from '../../model/index';
import { Cardinality } from '../../model/validation/Cardinality';
import type { Bounds, EffectiveNode, Attribute, Model, Node, Relation, Id, Ref, ResolvedElement } from '../../model/index';
import { RamenAnnotations, AnnotationRelation } from './Definitions';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../ReferenceModel';
import { AnnotationIndex, ResolvedAnnotation } from './AnnotationIndex';

/** Property that can be selected for an annotation definition. */
export interface PropertyAdvice {
  readonly modelId: Id;
  readonly attributeId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly modeledBounds: Bounds;
  readonly suggestedBounds: Bounds;
  /** Common valid interval presets, not all possible intervals. An upper bound of -1 means unlimited. */
  readonly cardinalityOptions: readonly Bounds[];
}

/** Relation that can be selected for an annotation definition. */
export interface RelationAdvice {
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
  /** Common valid interval presets, not all possible intervals. An upper bound of -1 means unlimited. */
  readonly cardinalityOptions: readonly Bounds[];
  /** Relation references counted together by suggestedBounds, when this choice belongs to an alternative group. */
  readonly alternatives?: readonly Ref[];
}

/** Complete creation advice for an annotation definition. */
export interface AnnotationAdvice {
  readonly properties: readonly PropertyAdvice[];
  readonly relations: readonly RelationAdvice[];
}

/** Computes valid annotation properties, relations, targets, and cardinality choices. */
export class AnnotationAdvisor {
  /** Creates annotation advice over an already validated project graph. */
  public constructor(
    private readonly graph: ProjectGraph,
    private readonly relations: ModelRelationScope,
    private readonly annotations: AnnotationIndex,
  ) {}

  /** Advises properties and relations available for a new annotation type. */
  public advise(modelId: Id, annotationNodeId: Id): AnnotationAdvice | undefined {
    const actual: ResolvedElement<Node> | undefined = this.graph.resolveNode(modelId, annotationNodeId);
    if (!actual || !this.annotations.isAnnotationNode(actual.modelId, actual.element.id)) return undefined;
    return {
      properties: this.propertyAdvice(modelId, actual),
      relations: this.relationAdvice(modelId, actual),
    };
  }

  /** Returns the effective properties and relations selected by one annotation type. */
  public adviseEffective(modelId: Id, annotationNodeId: Id, type: string): AnnotationAdvice | undefined {
    const definition: ResolvedAnnotation | undefined = this.annotations.findEffective(modelId, annotationNodeId, type);
    if (!definition) return undefined;
    const actual: ResolvedElement<Node> | undefined = this.graph.resolveNode(modelId, annotationNodeId);
    if (!actual) return undefined;
    return {
      properties: this.selectedPropertyAdvice(modelId, actual, definition),
      relations: this.selectedRelationAdvice(modelId, actual, definition),
    };
  }

  private selectedPropertyAdvice(
    contextModelId: Id,
    actual: ResolvedElement<Node>,
    definition: ResolvedAnnotation,
  ): readonly PropertyAdvice[] {
    const lineage: readonly ResolvedElement<Node>[] = [actual, ...this.graph.getNodeAncestors(actual.modelId, actual.element.id)];
    return AnnotationProperties.resolve(this.graph, definition, actual).map((attribute: Attribute): PropertyAdvice => {
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

  private propertyAdvice(contextModelId: Id, actual: ResolvedElement<Node>): readonly PropertyAdvice[] {
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(this.graph, actual.modelId, actual.element.id);
    if (!effective) return [];
    const commonIds: ReadonlySet<Id> = this.commonAnnotationAttributeIds();

    return effective.attributes
      .filter((attribute: Attribute): boolean => !commonIds.has(attribute.id))
      .map((attribute: Attribute): PropertyAdvice => {
        const owner: ResolvedElement<Node> = this.attributeOwner(effective.lineage, attribute.id) ?? actual;
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
      .sort((left: PropertyAdvice, right: PropertyAdvice): number => left.name.localeCompare(right.name));
  }

  private relationAdvice(contextModelId: Id, actual: ResolvedElement<Node>): readonly RelationAdvice[] {
    const result: RelationAdvice[] = [];

    for (const item of this.relations.available(contextModelId)) {
      const owner: Model | undefined = this.graph.getModel(item.modelId);
      if (!owner) continue;
      this.addRelationAdvice(result, contextModelId, actual, owner, item.element, 'outgoing');
      this.addRelationAdvice(result, contextModelId, actual, owner, item.element, 'incoming');
    }

    return result.sort((left: RelationAdvice, right: RelationAdvice): number => {
      const byName: number = left.name.localeCompare(right.name);
      return byName === 0 ? left.direction.localeCompare(right.direction) : byName;
    });
  }

  private addRelationAdvice(
    result: RelationAdvice[],
    contextModelId: Id,
    actual: ResolvedElement<Node>,
    owner: Model,
    relation: Relation,
    direction: 'outgoing' | 'incoming',
  ): void {
    const annotationRef: Ref = direction === 'outgoing' ? relation.from.nodeId : relation.to.nodeId;
    if (!this.graph.acceptsNode(owner.id, annotationRef, actual)) return;
    const targetRef: Ref = direction === 'outgoing' ? relation.to.nodeId : relation.from.nodeId;
    const target: ResolvedElement<Node> | undefined = this.graph.resolveNode(owner.id, targetRef);

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
    actual: ResolvedElement<Node>,
    definition: ResolvedAnnotation,
  ): readonly RelationAdvice[] {
    const selected: RelationAdvice[] = [];
    for (const choice of this.relationAdvice(modelId, actual)) {
      const requirement: AnnotationRelation | undefined = this.findRequirement(choice, definition);
      if (!requirement) continue;
      selected.push(this.applyRequirement(choice, requirement, definition.modelId));
    }
    return selected;
  }

  private findRequirement(choice: RelationAdvice, definition: ResolvedAnnotation): AnnotationRelation | undefined {
    for (const requirement of definition.annotation.relations) {
      if (requirement.direction !== choice.direction) continue;
      const matches: boolean = RamenAnnotations.relationRefs(requirement).some((ref: Ref): boolean =>
        this.graph.isRelationRefSameOrSubtype(choice.modelId, choice.relationId, definition.modelId, ref),
      );
      if (matches) return requirement;
    }
    return undefined;
  }

  private applyRequirement(choice: RelationAdvice, requirement: AnnotationRelation, modelId: Id): RelationAdvice {
    const selected: RelationAdvice = {
      ...choice,
      suggestedBounds: requirement.bounds,
      cardinalityOptions: this.cardinalityOptions(requirement.bounds),
    };
    if (!requirement.alternatives) return selected;
    const alternatives: readonly Ref[] = RamenAnnotations.relationRefs(requirement).map((ref: Ref): Ref =>
      ModelRef.isQualified(ref) ? ref : ModelRef.qualify(modelId, ref),
    );
    return { ...selected, alternatives };
  }

  private commonAnnotationAttributeIds(): ReadonlySet<Id> {
    const annotation: EffectiveNode | undefined = EffectiveModel.resolveNode(
      this.graph,
      RAMEN_MODEL.id,
      RAMEN_ELEMENT.ANNOTATION,
    );
    return new Set<Id>(annotation?.attributes.map((attribute: Attribute): Id => attribute.id) ?? []);
  }

  private attributeOwner(lineage: readonly ResolvedElement<Node>[], attributeId: Id): ResolvedElement<Node> | undefined {
    return lineage.find((item: ResolvedElement<Node>): boolean =>
      item.element.attributes.some((attribute: Attribute): boolean => attribute.id === attributeId),
    );
  }

  private compatibleTargets(modelId: Id, relationModelId: Id, targetRef: Ref): readonly Id[] {
    return this.graph
      .getAvailableNodes(modelId)
      .filter((candidate: ResolvedElement<Node>): boolean => this.graph.acceptsNode(relationModelId, targetRef, candidate))
      .map((candidate: ResolvedElement<Node>): Ref =>
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
      if (!Cardinality.isModelBoundsCompatible(allowed, bounds)) continue;
      unique.set(`${bounds.lowerBound}:${bounds.upperBound}`, { ...bounds });
    }
    return [...unique.values()];
  }
}
