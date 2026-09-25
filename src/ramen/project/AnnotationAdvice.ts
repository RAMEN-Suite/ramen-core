import { EffectiveModel, ModelRef, ProjectGraph } from '../../model/index';
import { ModelSemantics } from '../../model/validation/Semantics';
import type { Bounds, EffectiveNode, Attribute, Model, Node, Relation, Id, Ref, ResolvedModelElement } from '../../model/index';
import { RamenAnnotationProperty, RamenAnnotationRelation } from '../model/Annotations';
import { RAMEN_ELEMENT, RAMEN_MODEL } from '../model/ReferenceModel';
import { RamenAnnotationGraph, ResolvedRamenAnnotation } from './AnnotationGraph';

/** Property that can be selected for a new or refined annotation definition. */
export interface AnnotationPropertyAdvice {
  readonly modelId: Id;
  readonly attributeId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly modeledBounds: Bounds;
  readonly suggestedBounds: Bounds;
  readonly cardinalityOptions: readonly Bounds[];
}

/** Relation that can be selected for a new or refined annotation definition. */
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
}

/** Complete creation advice for an annotation definition. */
export interface AnnotationAdvice {
  readonly properties: readonly AnnotationPropertyAdvice[];
  readonly relations: readonly AnnotationRelationAdvice[];
}

/** Computes valid annotation properties, relations, targets, and cardinality choices. */
export class RamenAnnotationAdvisor {
  private readonly annotations: RamenAnnotationGraph;

  /** Creates annotation advice over an already validated project graph. */
  public constructor(
    private readonly graph: ProjectGraph,
    models: readonly Model[],
  ) {
    this.annotations = new RamenAnnotationGraph(graph, models);
  }

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
    const selected: ReadonlyMap<Id, RamenAnnotationProperty> = new Map<Id, RamenAnnotationProperty>(
      definition.annotation.properties.map((property: RamenAnnotationProperty): [Id, RamenAnnotationProperty] => [
        this.refId(property.attributeId),
        property,
      ]),
    );

    return this.propertyAdvice(contextModelId, actual).flatMap(
      (property: AnnotationPropertyAdvice): AnnotationPropertyAdvice[] => {
        const requirement: RamenAnnotationProperty | undefined = selected.get(property.attributeId);
        if (!requirement) return [];
        const bounds: Bounds = requirement.bounds ?? property.modeledBounds;

        return [{ ...property, suggestedBounds: bounds, cardinalityOptions: this.cardinalityOptions(bounds) }];
      },
    );
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

    const current: Model | undefined = this.graph.getModel(contextModelId);
    const models: readonly Model[] = current ? [current, ...this.graph.getTransitiveImports(contextModelId)] : [];

    for (const owner of models) {
      for (const relation of owner.relations) {
        this.addRelationAdvice(result, contextModelId, actual, owner, relation, 'outgoing');
        this.addRelationAdvice(result, contextModelId, actual, owner, relation, 'incoming');
      }
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
          this.graph.isRelationRefSameOrSubtype(choice.modelId, choice.relationId, definition.modelId, candidate.relationId),
      );
      if (!requirement) return [];

      return [
        { ...choice, suggestedBounds: requirement.bounds, cardinalityOptions: this.cardinalityOptions(requirement.bounds) },
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
    return ModelSemantics.isModelBoundsCompatible(allowed, actual);
  }

  private refId(reference: Ref): Id {
    return ModelRef.localId(reference);
  }
}
