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
  readonly inheritedBounds?: Bounds;
  readonly suggestedBounds: Bounds;
  readonly cardinalityOptions: readonly Bounds[];
  readonly inherited: boolean;
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
  readonly compatibleTargetNodeIds: readonly Id[];
  readonly modeledBounds: Bounds;
  readonly inheritedBounds?: Bounds;
  readonly suggestedBounds: Bounds;
  readonly cardinalityOptions: readonly Bounds[];
  readonly inherited: boolean;
}

/** Complete creation advice for an annotation definition. */
export interface AnnotationAdvice {
  readonly properties: readonly AnnotationPropertyAdvice[];
  readonly relations: readonly AnnotationRelationAdvice[];
}

interface ResolvedAnnotationProperty {
  readonly modelId: Id;
  readonly property: RamenAnnotationProperty;
}

interface ResolvedAnnotationRelation {
  readonly modelId: Id;
  readonly relation: RamenAnnotationRelation;
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

  /** Advises a new annotation, or a refinement when `refines` identifies its parent definition. */
  public advise(modelId: Id, annotationNodeId: Id, refines?: Ref): AnnotationAdvice | undefined {
    const node: Node | undefined = this.graph.getNode(modelId, annotationNodeId);
    if (!node || !this.annotations.isAnnotationNode(modelId, annotationNodeId)) return undefined;
    const parent: ResolvedRamenAnnotation | undefined = refines ? this.annotations.resolve(modelId, refines) : undefined;
    if (refines && !parent) return undefined;
    const actual: ResolvedModelElement<Node> = { modelId: modelId, element: node };
    return {
      properties: this.propertyAdvice(actual, parent),
      relations: this.relationAdvice(actual, parent),
    };
  }

  /** Returns the effective properties and relations selected by one annotation type. */
  public adviseEffective(modelId: Id, annotationNodeId: Id, type: string): AnnotationAdvice | undefined {
    const definition: ResolvedRamenAnnotation | undefined = this.annotations.findEffective(modelId, annotationNodeId, type);
    if (!definition) return undefined;
    const node: Node | undefined = this.graph.getNode(modelId, annotationNodeId);
    if (!node) return undefined;
    const actual: ResolvedModelElement<Node> = { modelId: modelId, element: node };
    return {
      properties: this.selectedPropertyAdvice(actual, definition),
      relations: this.relationAdvice(actual, definition),
    };
  }

  private selectedPropertyAdvice(
    actual: ResolvedModelElement<Node>,
    definition: ResolvedRamenAnnotation,
  ): readonly AnnotationPropertyAdvice[] {
    const selected: ReadonlySet<Id> = new Set<Id>(
      this.annotations
        .getRefinementLineage(definition)
        .flatMap((item: ResolvedRamenAnnotation): Id[] =>
          item.annotation.properties.map((property: RamenAnnotationProperty): Id => this.refId(property.attributeId)),
        ),
    );

    return this.propertyAdvice(actual, definition).filter((property: AnnotationPropertyAdvice): boolean =>
      selected.has(property.attributeId),
    );
  }

  private propertyAdvice(
    actual: ResolvedModelElement<Node>,
    parent: ResolvedRamenAnnotation | undefined,
  ): readonly AnnotationPropertyAdvice[] {
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(this.graph, actual.modelId, actual.element.id);
    if (!effective) return [];
    const commonIds: ReadonlySet<Id> = this.commonAnnotationAttributeIds();
    const inherited: ReadonlyMap<Id, ResolvedAnnotationProperty> = this.inheritedProperties(parent);

    return effective.attributes
      .filter((attribute: Attribute): boolean => !commonIds.has(attribute.id))
      .map((attribute: Attribute): AnnotationPropertyAdvice => {
        const owner: ResolvedModelElement<Node> = this.attributeOwner(effective.lineage, attribute.id) ?? actual;
        const selected: ResolvedAnnotationProperty | undefined = inherited.get(attribute.id);
        const allowed: Bounds = selected?.property.bounds ?? attribute.bounds;

        return {
          modelId: owner.modelId,
          attributeId: attribute.id,
          ref: owner.modelId === actual.modelId ? attribute.id : ModelRef.qualify(owner.modelId, attribute.id),
          name: attribute.name,
          modeledBounds: { ...attribute.bounds },
          inheritedBounds: selected?.property.bounds ? { ...selected.property.bounds } : undefined,
          suggestedBounds: { ...allowed },
          cardinalityOptions: this.cardinalityOptions(allowed),
          inherited: selected !== undefined,
        };
      })
      .sort((left: AnnotationPropertyAdvice, right: AnnotationPropertyAdvice): number => left.name.localeCompare(right.name));
  }

  private relationAdvice(
    actual: ResolvedModelElement<Node>,
    parent: ResolvedRamenAnnotation | undefined,
  ): readonly AnnotationRelationAdvice[] {
    const inherited: readonly ResolvedAnnotationRelation[] = this.inheritedRelations(parent);
    const result: AnnotationRelationAdvice[] = [];

    for (const owner of this.graph.getModels()) {
      for (const relation of owner.relations) {
        this.addRelationAdvice(result, actual, owner, relation, 'outgoing', inherited, parent !== undefined);
        this.addRelationAdvice(result, actual, owner, relation, 'incoming', inherited, parent !== undefined);
      }
    }

    return result.sort((left: AnnotationRelationAdvice, right: AnnotationRelationAdvice): number => {
      const byName: number = left.name.localeCompare(right.name);
      return byName === 0 ? left.direction.localeCompare(right.direction) : byName;
    });
  }

  private addRelationAdvice(
    result: AnnotationRelationAdvice[],
    actual: ResolvedModelElement<Node>,
    owner: Model,
    relation: Relation,
    direction: 'outgoing' | 'incoming',
    inherited: readonly ResolvedAnnotationRelation[],
    isRefinement: boolean,
  ): void {
    const annotationRef: Ref = direction === 'outgoing' ? relation.from.nodeId : relation.to.nodeId;
    if (!this.graph.acceptsNode(owner.id, annotationRef, actual)) return;
    const selected: ResolvedAnnotationRelation | undefined = inherited.find(
      (candidate: ResolvedAnnotationRelation): boolean =>
        candidate.relation.direction === direction &&
        this.graph.isRelationRefSameOrSubtype(owner.id, relation.id, candidate.modelId, candidate.relation.relationId),
    );

    if (isRefinement && !selected) return;
    const targetRef: Ref = direction === 'outgoing' ? relation.to.nodeId : relation.from.nodeId;
    const target: ResolvedModelElement<Node> | undefined = this.graph.resolveNode(owner.id, targetRef);

    if (!target) return;
    const modeled: Bounds = direction === 'outgoing' ? relation.to.bounds : relation.from.bounds;
    const allowed: Bounds = selected?.relation.bounds ?? modeled;

    result.push({
      modelId: owner.id,
      relationId: relation.id,
      ref: owner.id === actual.modelId ? relation.id : ModelRef.qualify(owner.id, relation.id),
      name: relation.name,
      direction: direction,
      targetNodeId: target.element.id,
      targetName: target.element.name,
      compatibleTargetNodeIds: this.compatibleTargets(actual.modelId, owner.id, targetRef),
      modeledBounds: { ...modeled },
      inheritedBounds: selected ? { ...selected.relation.bounds } : undefined,
      suggestedBounds: { ...allowed },
      cardinalityOptions: this.cardinalityOptions(allowed),
      inherited: selected !== undefined,
    });
  }

  private inheritedProperties(parent: ResolvedRamenAnnotation | undefined): ReadonlyMap<Id, ResolvedAnnotationProperty> {
    const result: Map<Id, ResolvedAnnotationProperty> = new Map<Id, ResolvedAnnotationProperty>();
    for (const definition of [...this.annotations.getRefinementLineage(parent)].reverse()) {
      for (const property of definition.annotation.properties) {
        const attributeId: Id = this.refId(property.attributeId);
        const previous: ResolvedAnnotationProperty | undefined = result.get(attributeId);

        result.set(attributeId, {
          modelId: definition.modelId,
          property: { ...property, bounds: property.bounds ?? previous?.property.bounds },
        });
      }
    }
    return result;
  }

  private inheritedRelations(parent: ResolvedRamenAnnotation | undefined): readonly ResolvedAnnotationRelation[] {
    const result: ResolvedAnnotationRelation[] = [];
    for (const definition of [...this.annotations.getRefinementLineage(parent)].reverse()) {
      for (const relation of definition.annotation.relations) {
        const index: number = result.findIndex(
          (candidate: ResolvedAnnotationRelation): boolean =>
            candidate.relation.direction === relation.direction &&
            this.graph.isRelationRefSameOrSubtype(
              definition.modelId,
              relation.relationId,
              candidate.modelId,
              candidate.relation.relationId,
            ),
        );
        const resolved: ResolvedAnnotationRelation = { modelId: definition.modelId, relation: relation };

        if (index < 0) result.push(resolved);
        else result.splice(index, 1, resolved);
      }
    }
    return result;
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
    const model: Model | undefined = this.graph.getModel(modelId);
    if (!model) return [];
    return model.classifiers.flatMap((classifier): Id[] => {
      if (classifier.kind !== 'Node') return [];
      const candidate: ResolvedModelElement<Node> = { modelId: modelId, element: classifier };
      return this.graph.acceptsNode(relationModelId, targetRef, candidate) ? [classifier.id] : [];
    });
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
