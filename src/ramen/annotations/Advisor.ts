import { AnnotationProperties } from './Properties';
import { ModelRelationScope } from '../../model/graph/RelationScope';
import { EffectiveModel } from '../../model/graph/EffectiveModel';
import { ModelRef } from '../../model/graph/References';
import { ProjectGraph } from '../../model/graph/ProjectGraph';
import { Cardinality } from '../../model/validation/Cardinality';
import type { EffectiveNode } from '../../model/graph/EffectiveModel';
import type { ResolvedElement } from '../../model/graph/ProjectGraph';
import type { Bounds, Attribute, Model, Node, Relation, Id, Ref } from '../../model/Types';
import { AnnotationRelation } from './Definitions';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../ReferenceModel';
import { AnnotationIndex, ResolvedAnnotation } from './AnnotationIndex';

/** Property that can be selected for an annotation definition. */
export interface PropertyOption {
  readonly modelId: Id;
  readonly attributeId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly typeId: Ref;
  readonly modelledBounds: Bounds;
  readonly suggestedBounds: Bounds;
  /** Common valid interval presets, not all possible intervals. An upper bound of -1 means unlimited. */
  readonly cardinalityOptions: readonly Bounds[];
}

/** Relation that can be selected for an annotation definition. */
export interface RelationOption {
  readonly modelId: Id;
  readonly relationId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly targetNodeId: Id;
  readonly targetName: string;
  /** Local IDs or qualified references for imported target nodes. */
  readonly compatibleTargetNodeIds: readonly Ref[];
  readonly modelledBounds: Bounds;
  readonly suggestedBounds: Bounds;
  /** Common valid interval presets, not all possible intervals. An upper bound of -1 means unlimited. */
  readonly cardinalityOptions: readonly Bounds[];
  /** Relation references counted together by suggestedBounds when this choice belongs to a group. */
  readonly relationIds?: readonly Ref[];
}

/** Complete creation options for an annotation definition. */
export interface AnnotationOptions {
  readonly properties: readonly PropertyOption[];
  readonly relations: readonly RelationOption[];
}

/** Computes valid annotation properties, relations, targets, and cardinality choices. */
export class AnnotationAdvisor {
  /** Creates annotation options over an already validated project graph. */
  public constructor(
    private readonly graph: ProjectGraph,
    private readonly relations: ModelRelationScope,
    private readonly annotations: AnnotationIndex,
  ) {}

  /** Lists property choices and relations available for a new annotation type. */
  public suggestOptions(modelId: Id, annotationNodeId: Id): AnnotationOptions | undefined {
    const actual: ResolvedElement<Node> | undefined = this.graph.resolveNode(modelId, annotationNodeId);
    if (!actual || !this.annotations.isAnnotationNode(actual.modelId, actual.element.id)) return undefined;
    return {
      properties: this.propertyOptions(modelId, actual),
      relations: this.relationOptions(modelId, actual),
    };
  }

  /** Returns the effective properties and relations selected by one annotation type. */
  public getTypeInfo(modelId: Id, annotationNodeId: Id, type: string): AnnotationOptions | undefined {
    const definition: ResolvedAnnotation | undefined = this.annotations.findEffective(modelId, annotationNodeId, type);
    if (!definition) return undefined;
    const actual: ResolvedElement<Node> | undefined = this.graph.resolveNode(modelId, annotationNodeId);
    if (!actual) return undefined;
    return {
      properties: this.selectedPropertyOptions(modelId, actual, definition),
      relations: this.selectedRelationOptions(modelId, actual, definition),
    };
  }

  private selectedPropertyOptions(
    contextModelId: Id,
    actual: ResolvedElement<Node>,
    definition: ResolvedAnnotation,
  ): readonly PropertyOption[] {
    const lineage: readonly ResolvedElement<Node>[] = [actual, ...this.graph.getNodeAncestors(actual.modelId, actual.element.id)];
    return AnnotationProperties.resolve(this.graph, definition, actual).map((attribute: Attribute): PropertyOption => {
      const modelId: Id = this.attributeOwner(lineage, attribute.id)?.modelId ?? definition.modelId;
      return {
        modelId,
        attributeId: attribute.id,
        ref: modelId === contextModelId ? attribute.id : ModelRef.qualify(modelId, attribute.id),
        name: attribute.name,
        typeId: attribute.typeId,
        modelledBounds: { ...attribute.bounds },
        suggestedBounds: { ...attribute.bounds },
        cardinalityOptions: this.cardinalityOptions(attribute.bounds),
      };
    });
  }

  private propertyOptions(contextModelId: Id, actual: ResolvedElement<Node>): readonly PropertyOption[] {
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(this.graph, actual.modelId, actual.element.id);
    if (!effective) return [];
    const commonIds: ReadonlySet<Id> = this.commonAnnotationAttributeIds();

    return effective.attributes
      .filter((attribute: Attribute): boolean => !commonIds.has(attribute.id))
      .map((attribute: Attribute): PropertyOption => {
        const owner: ResolvedElement<Node> = this.attributeOwner(effective.lineage, attribute.id) ?? actual;
        return {
          modelId: owner.modelId,
          attributeId: attribute.id,
          ref: owner.modelId === contextModelId ? attribute.id : ModelRef.qualify(owner.modelId, attribute.id),
          name: attribute.name,
          typeId: attribute.typeId,
          modelledBounds: { ...attribute.bounds },
          suggestedBounds: { ...attribute.bounds },
          cardinalityOptions: this.cardinalityOptions(attribute.bounds),
        };
      })
      .sort((left: PropertyOption, right: PropertyOption): number => left.name.localeCompare(right.name));
  }

  private relationOptions(contextModelId: Id, actual: ResolvedElement<Node>): readonly RelationOption[] {
    const result: RelationOption[] = [];

    for (const item of this.relations.available(contextModelId)) {
      const owner: Model | undefined = this.graph.getModel(item.modelId);
      if (!owner) continue;
      this.addRelationOption(result, contextModelId, actual, owner, item.element, 'outgoing');
      this.addRelationOption(result, contextModelId, actual, owner, item.element, 'incoming');
    }

    return result.sort((left: RelationOption, right: RelationOption): number => {
      const byName: number = left.name.localeCompare(right.name);
      return byName === 0 ? left.direction.localeCompare(right.direction) : byName;
    });
  }

  private addRelationOption(
    result: RelationOption[],
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
    const modelled: Bounds = direction === 'outgoing' ? relation.to.bounds : relation.from.bounds;

    result.push({
      modelId: owner.id,
      relationId: relation.id,
      ref: owner.id === contextModelId ? relation.id : ModelRef.qualify(owner.id, relation.id),
      name: relation.name,
      direction: direction,
      targetNodeId: target.element.id,
      targetName: target.element.name,
      compatibleTargetNodeIds: this.compatibleTargets(contextModelId, owner.id, targetRef),
      modelledBounds: { ...modelled },
      suggestedBounds: { ...modelled },
      cardinalityOptions: this.cardinalityOptions(modelled),
    });
  }

  private selectedRelationOptions(
    modelId: Id,
    actual: ResolvedElement<Node>,
    definition: ResolvedAnnotation,
  ): readonly RelationOption[] {
    const selected: RelationOption[] = [];
    for (const choice of this.relationOptions(modelId, actual)) {
      const requirement: AnnotationRelation | undefined = this.findRequirement(choice, definition);
      if (!requirement) continue;
      selected.push(this.applyRequirement(choice, requirement, definition.modelId));
    }
    return selected;
  }

  private findRequirement(choice: RelationOption, definition: ResolvedAnnotation): AnnotationRelation | undefined {
    for (const requirement of definition.annotation.relations) {
      if (requirement.direction !== choice.direction) continue;
      const matches: boolean = requirement.relationIds.some((ref: Ref): boolean =>
        this.graph.isRelationRefSameOrSubtype(choice.modelId, choice.relationId, definition.modelId, ref),
      );
      if (matches) return requirement;
    }
    return undefined;
  }

  private applyRequirement(choice: RelationOption, requirement: AnnotationRelation, modelId: Id): RelationOption {
    const selected: RelationOption = {
      ...choice,
      suggestedBounds: { ...requirement.bounds },
      cardinalityOptions: this.cardinalityOptions(requirement.bounds),
    };
    if (requirement.relationIds.length === 1) return selected;
    const relationIds: readonly Ref[] = requirement.relationIds.map((ref: Ref): Ref =>
      ModelRef.isQualified(ref) ? ref : ModelRef.qualify(modelId, ref),
    );
    return { ...selected, relationIds };
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
