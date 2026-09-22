import { Bounds, GAttribute, GModel, GNode, GRelation, Id, Ref } from '../gcore/model/Types';
import { EffectiveModel, EffectiveNode } from '../gcore/project/Effective';
import { ProjectGraph, ResolvedModelElement } from '../gcore/project/Graph';
import { ModelRef } from '../gcore/project/Refs';
import { RamenAnnotationProperty, RamenAnnotationRelation } from './Annotations';
import { RamenAnnotationGraph, ResolvedRamenAnnotation } from './AnnotationGraph';
import { RAMEN_ELEMENT } from './Elements';
import { RAMEN_MODEL } from './Model';

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
  public constructor(private readonly graph: ProjectGraph) {
    this.annotations = new RamenAnnotationGraph(graph);
  }

  /** Advises a new annotation, or a refinement when `refines` identifies its parent definition. */
  public advise(modelId: Id, annotationNodeId: Id, refines?: Ref): AnnotationAdvice | undefined {
    const node: GNode | undefined = this.graph.getNode(modelId, annotationNodeId);
    if (!node || !this.isAnnotationNode(modelId, annotationNodeId)) return undefined;
    const parent: ResolvedRamenAnnotation | undefined = refines ? this.annotations.resolve(modelId, refines) : undefined;
    if (refines && !parent) return undefined;
    const actual: ResolvedModelElement<GNode> = { modelId: modelId, element: node };
    return {
      properties: this.propertyAdvice(actual, parent),
      relations: this.relationAdvice(actual, parent),
    };
  }

  private propertyAdvice(
    actual: ResolvedModelElement<GNode>,
    parent: ResolvedRamenAnnotation | undefined,
  ): readonly AnnotationPropertyAdvice[] {
    const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(this.graph, actual.modelId, actual.element.id);
    if (!effective) return [];
    const commonIds: ReadonlySet<Id> = this.commonAnnotationAttributeIds();
    const inherited: ReadonlyMap<Id, ResolvedAnnotationProperty> = this.inheritedProperties(parent);
    return effective.attributes
      .filter((attribute: GAttribute): boolean => !commonIds.has(attribute.id))
      .map((attribute: GAttribute): AnnotationPropertyAdvice => {
        const owner: ResolvedModelElement<GNode> = this.attributeOwner(effective.lineage, attribute.id) ?? actual;
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
    actual: ResolvedModelElement<GNode>,
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
    actual: ResolvedModelElement<GNode>,
    owner: GModel,
    relation: GRelation,
    direction: 'outgoing' | 'incoming',
    inherited: readonly ResolvedAnnotationRelation[],
    isRefinement: boolean,
  ): void {
    const annotationRef: Ref = direction === 'outgoing' ? relation.from.nodeId : relation.to.nodeId;
    if (!this.accepts(owner.id, annotationRef, actual)) return;
    const selected: ResolvedAnnotationRelation | undefined = inherited.find(
      (candidate: ResolvedAnnotationRelation): boolean =>
        candidate.relation.direction === direction &&
        this.relationRefines(owner.id, relation.id, candidate.modelId, candidate.relation.relationId),
    );
    if (isRefinement && !selected) return;
    const targetRef: Ref = direction === 'outgoing' ? relation.to.nodeId : relation.from.nodeId;
    const target: ResolvedModelElement<GNode> | undefined = this.graph.resolveNode(owner.id, targetRef);
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
    for (const definition of this.annotationLineage(parent).reverse()) {
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
    for (const definition of this.annotationLineage(parent).reverse()) {
      for (const relation of definition.annotation.relations) {
        const index: number = result.findIndex(
          (candidate: ResolvedAnnotationRelation): boolean =>
            candidate.relation.direction === relation.direction &&
            this.relationRefines(definition.modelId, relation.relationId, candidate.modelId, candidate.relation.relationId),
        );
        const resolved: ResolvedAnnotationRelation = { modelId: definition.modelId, relation: relation };
        if (index < 0) result.push(resolved);
        else result.splice(index, 1, resolved);
      }
    }
    return result;
  }

  private annotationLineage(parent: ResolvedRamenAnnotation | undefined): ResolvedRamenAnnotation[] {
    const result: ResolvedRamenAnnotation[] = [];
    const visited: Set<string> = new Set<string>();
    let current: ResolvedRamenAnnotation | undefined = parent;
    while (current) {
      const key: string = `${current.modelId}:${current.annotation.id}`;
      if (visited.has(key)) break;
      visited.add(key);
      result.push(current);
      current = current.annotation.refines ? this.annotations.resolve(current.modelId, current.annotation.refines) : undefined;
    }
    return result;
  }

  private commonAnnotationAttributeIds(): ReadonlySet<Id> {
    const annotation: EffectiveNode | undefined = EffectiveModel.resolveNode(
      this.graph,
      RAMEN_MODEL.id,
      RAMEN_ELEMENT.ANNOTATION,
    );
    return new Set<Id>(annotation?.attributes.map((attribute: GAttribute): Id => attribute.id) ?? []);
  }

  private attributeOwner(
    lineage: readonly ResolvedModelElement<GNode>[],
    attributeId: Id,
  ): ResolvedModelElement<GNode> | undefined {
    return lineage.find((item: ResolvedModelElement<GNode>): boolean =>
      item.element.attributes.some((attribute: GAttribute): boolean => attribute.id === attributeId),
    );
  }

  private compatibleTargets(modelId: Id, relationModelId: Id, targetRef: Ref): readonly Id[] {
    const model: GModel | undefined = this.graph.getModel(modelId);
    if (!model) return [];
    return model.classifiers.flatMap((classifier): Id[] => {
      if (classifier.kind !== 'GNode') return [];
      const candidate: ResolvedModelElement<GNode> = { modelId: modelId, element: classifier };
      return this.accepts(relationModelId, targetRef, candidate) ? [classifier.id] : [];
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

  private relationRefines(actualModelId: Id, actualRef: Ref, requiredModelId: Id, requiredRef: Ref): boolean {
    const actual: ResolvedModelElement<GRelation> | undefined = this.graph.resolveRelation(actualModelId, actualRef);
    const required: ResolvedModelElement<GRelation> | undefined = this.graph.resolveRelation(requiredModelId, requiredRef);
    if (!actual || !required) return false;
    if (actual.modelId === required.modelId && actual.element.id === required.element.id) return true;
    return this.graph
      .getRelationAncestors(actual.modelId, actual.element.id)
      .some(
        (ancestor: ResolvedModelElement<GRelation>): boolean =>
          ancestor.modelId === required.modelId && ancestor.element.id === required.element.id,
      );
  }

  private accepts(ownerModelId: Id, requiredRef: Ref, actual: ResolvedModelElement<GNode>): boolean {
    const required: ResolvedModelElement<GNode> | undefined = this.graph.resolveNode(ownerModelId, requiredRef);
    if (!required) return false;
    if (required.modelId === actual.modelId && required.element.id === actual.element.id) return true;
    return this.graph
      .getNodeAncestors(actual.modelId, actual.element.id)
      .some(
        (ancestor: ResolvedModelElement<GNode>): boolean =>
          ancestor.modelId === required.modelId && ancestor.element.id === required.element.id,
      );
  }

  private isAnnotationNode(modelId: Id, nodeId: Id): boolean {
    if (modelId === RAMEN_MODEL.id && nodeId === RAMEN_ELEMENT.ANNOTATION) return true;
    return this.graph
      .getNodeAncestors(modelId, nodeId)
      .some(
        (ancestor: ResolvedModelElement<GNode>): boolean =>
          ancestor.modelId === RAMEN_MODEL.id && ancestor.element.id === RAMEN_ELEMENT.ANNOTATION,
      );
  }

  private narrows(actual: Bounds, allowed: Bounds): boolean {
    if (actual.lowerBound < allowed.lowerBound || actual.upperBound < -1) return false;
    if (allowed.upperBound === -1) return actual.upperBound === -1 || actual.upperBound >= actual.lowerBound;
    return actual.upperBound !== -1 && actual.upperBound >= actual.lowerBound && actual.upperBound <= allowed.upperBound;
  }

  private refId(reference: Ref): Id {
    return ModelRef.isQualified(reference) ? ModelRef.splitQualified(reference).refId : reference;
  }
}
