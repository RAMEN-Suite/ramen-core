import { BuiltinDataTypes } from '../gcore/model/Builtins';
import { Bounds, BuiltinType, GAttribute, GDataType, GModel, GNode, GRelation, Id, Ref } from '../gcore/model/Types';
import { ProjectGraph, ResolvedModelElement } from '../gcore/project/Graph';
import { ModelRef } from '../gcore/project/Refs';
import { ValidProjectResult } from '../gcore/validation/Validate';
import { RamenAnnotationGraph, ResolvedRamenAnnotation } from './AnnotationGraph';
import { AnnotationAdvice, RamenAnnotationAdvisor } from './AnnotationAdvice';

/** One node type that a new project node can refine. */
export interface NodeRefinementSuggestion {
  readonly modelId: Id;
  readonly nodeId: Id;
  readonly ref: Ref;
  readonly name: string;
}

/** One primitive or declared data type available to a project attribute. */
export interface DataTypeSuggestion {
  readonly modelId?: Id;
  readonly dataTypeId: Ref;
  readonly ref: Ref;
  readonly name: string;
  readonly baseType: BuiltinType;
}

/** One relation compatible with two selected project node types. */
export interface RelationRefinementSuggestion {
  readonly modelId: Id;
  readonly relationId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly actions: readonly ['reuse', 'refine'];
  readonly explanation: string;
}

/** One closed annotation variant declared by a reachable RAMEN model. */
export interface AnnotationSuggestion {
  readonly modelId: Id;
  readonly annotationId: Id;
  readonly ownerNodeId: Ref;
  readonly ref: Ref;
  readonly type: string;
}

/** One node in the selected node's base-first refinement lineage. */
export interface NodeLineageItem {
  readonly modelId: Id;
  readonly nodeId: Id;
  readonly ref: Ref;
  readonly name: string;
}

/** One local or inherited attribute visible on a refined node. */
export interface AttributeSuggestion {
  readonly attributeId: Id;
  readonly name: string;
  readonly typeId: Ref;
  readonly bounds: Bounds;
  readonly declaredBy: NodeLineageItem;
  readonly inherited: boolean;
}

/** One relation role that can apply to a selected node and its compatible local targets. */
export interface NodeRelationSuggestion {
  readonly modelId: Id;
  readonly relationId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly role: string;
  readonly requiredTarget: NodeLineageItem;
  readonly compatibleTargetNodeIds: readonly Id[];
  readonly actions: readonly ('reuse' | 'refine')[];
}

/** Complete deterministic advice for one local node in a validated project. */
export interface NodeAdvice {
  readonly lineage: readonly NodeLineageItem[];
  readonly attributes: readonly AttributeSuggestion[];
  readonly relations: readonly NodeRelationSuggestion[];
}

/** Result of checking whether an attribute name can be declared locally. */
export interface AttributeCreationAdvice {
  readonly allowed: boolean;
  readonly conflicts: readonly ('attribute' | 'relationRole')[];
}

/** Computes deterministic modeling suggestions from an already validated project graph. */
export class RamenAdvisor {
  private readonly graph: ProjectGraph;

  /** Creates an advisor from a successful project validation result. */
  public constructor(result: ValidProjectResult) {
    this.graph = result.graph;
  }

  /** Lists imported node types that can be refined by a new node in the selected model. */
  public suggestNodeRefinements(modelId: Id): readonly NodeRefinementSuggestion[] {
    return this.importedModels(modelId)
      .flatMap((model: GModel): NodeRefinementSuggestion[] =>
        model.classifiers.flatMap((classifier): NodeRefinementSuggestion[] => {
          if (classifier.kind !== 'GNode') return [];
          return [
            {
              modelId: model.id,
              nodeId: classifier.id,
              ref: ModelRef.qualify(model.id, classifier.id),
              name: classifier.name,
            },
          ];
        }),
      )
      .sort((left: NodeRefinementSuggestion, right: NodeRefinementSuggestion): number => left.name.localeCompare(right.name));
  }

  /** Lists primitive and reachable declared data types available to an attribute. */
  public suggestDataTypes(modelId: Id): readonly DataTypeSuggestion[] {
    const builtins: DataTypeSuggestion[] = BuiltinDataTypes.values.map((type: BuiltinType): DataTypeSuggestion => ({
      dataTypeId: type,
      ref: type,
      name: type,
      baseType: type,
    }));
    const declared: DataTypeSuggestion[] = [this.graph.getModel(modelId), ...this.importedModels(modelId)].flatMap(
      (model: GModel | undefined): DataTypeSuggestion[] => {
        if (!model) return [];
        return model.classifiers.flatMap((classifier): DataTypeSuggestion[] => {
          if (classifier.kind !== 'GDataType') return [];
          const dataType: GDataType = classifier;
          const ref: Ref = model.id === modelId ? dataType.id : ModelRef.qualify(model.id, dataType.id);
          return [{ modelId: model.id, dataTypeId: dataType.id, ref: ref, name: dataType.name, baseType: dataType.baseType }];
        });
      },
    );
    return [...builtins, ...declared].sort((left: DataTypeSuggestion, right: DataTypeSuggestion): number =>
      left.name.localeCompare(right.name),
    );
  }

  /** Lists all reachable annotations, or only the effective variants of one Annotation node. */
  public suggestAnnotations(modelId: Id, annotationNodeId?: Id): readonly AnnotationSuggestion[] {
    const annotations: RamenAnnotationGraph = new RamenAnnotationGraph(this.graph);
    const candidates: readonly ResolvedRamenAnnotation[] = annotationNodeId
      ? annotations.getEffective(modelId, annotationNodeId)
      : annotations.getAll();
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

  /** Suggests valid properties, relations, targets, and cardinalities for an annotation definition. */
  public adviseAnnotation(modelId: Id, annotationNodeId: Id, refines?: Ref): AnnotationAdvice | undefined {
    return new RamenAnnotationAdvisor(this.graph).advise(modelId, annotationNodeId, refines);
  }

  /** Returns the refinement lineage, effective attributes, and possible relations for one local node. */
  public adviseNode(modelId: Id, nodeId: Id): NodeAdvice | undefined {
    const actual: ResolvedModelElement<GNode> | undefined = this.resolveLocalNode(modelId, nodeId);
    if (!actual) return undefined;
    const ancestors: ResolvedModelElement<GNode>[] = [...this.graph.getNodeAncestors(modelId, nodeId)].reverse();
    const lineage: readonly ResolvedModelElement<GNode>[] = [...ancestors, actual];
    return {
      lineage: lineage.map((item: ResolvedModelElement<GNode>): NodeLineageItem => this.lineageItem(item, modelId)),
      attributes: this.attributeSuggestions(lineage, actual),
      relations: this.nodeRelationSuggestions(modelId, actual),
    };
  }

  /** Lists all inherited and local attributes visible on one node. */
  public suggestAttributes(modelId: Id, nodeId: Id): readonly AttributeSuggestion[] {
    return this.adviseNode(modelId, nodeId)?.attributes ?? [];
  }

  /** Checks inherited attributes and applicable relation roles before an attribute is created. */
  public adviseAttributeCreation(modelId: Id, nodeId: Id, name: string): AttributeCreationAdvice {
    const advice: NodeAdvice | undefined = this.adviseNode(modelId, nodeId);
    if (!advice) return { allowed: false, conflicts: [] };
    const conflicts: ('attribute' | 'relationRole')[] = [];
    if (advice.attributes.some((attribute: AttributeSuggestion): boolean => attribute.name === name)) conflicts.push('attribute');
    if (advice.relations.some((relation: NodeRelationSuggestion): boolean => relation.role === name))
      conflicts.push('relationRole');
    return { allowed: conflicts.length === 0, conflicts: conflicts };
  }

  /** Lists imported relations whose endpoint types accept the selected source and target nodes. */
  public suggestRelations(modelId: Id, fromNodeId: Id, toNodeId: Id): readonly RelationRefinementSuggestion[] {
    const from: ResolvedModelElement<GNode> | undefined = this.resolveLocalNode(modelId, fromNodeId);
    const to: ResolvedModelElement<GNode> | undefined = this.resolveLocalNode(modelId, toNodeId);
    if (!from || !to) return [];

    return this.importedModels(modelId)
      .flatMap((model: GModel): RelationRefinementSuggestion[] =>
        model.relations.flatMap((relation: GRelation): RelationRefinementSuggestion[] => {
          if (!this.accepts(model.id, relation.from.nodeId, from) || !this.accepts(model.id, relation.to.nodeId, to)) return [];
          return [
            {
              modelId: model.id,
              relationId: relation.id,
              ref: ModelRef.qualify(model.id, relation.id),
              name: relation.name,
              actions: ['reuse', 'refine'],
              explanation: `'${relation.name}' accepts '${from.element.name}' as source and '${to.element.name}' as target.`,
            },
          ];
        }),
      )
      .sort((left: RelationRefinementSuggestion, right: RelationRefinementSuggestion): number =>
        left.name.localeCompare(right.name),
      );
  }

  private importedModels(modelId: Id): readonly GModel[] {
    return this.graph.getModels().filter((model: GModel): boolean => model.id !== modelId);
  }

  private attributeSuggestions(
    lineage: readonly ResolvedModelElement<GNode>[],
    actual: ResolvedModelElement<GNode>,
  ): readonly AttributeSuggestion[] {
    return lineage.flatMap((owner: ResolvedModelElement<GNode>): AttributeSuggestion[] =>
      owner.element.attributes.map((attribute: GAttribute): AttributeSuggestion => ({
        attributeId: attribute.id,
        name: attribute.name,
        typeId: attribute.typeId,
        bounds: { ...attribute.bounds },
        declaredBy: this.lineageItem(owner, actual.modelId),
        inherited: owner.modelId !== actual.modelId || owner.element.id !== actual.element.id,
      })),
    );
  }

  private nodeRelationSuggestions(modelId: Id, actual: ResolvedModelElement<GNode>): readonly NodeRelationSuggestion[] {
    const suggestions: NodeRelationSuggestion[] = [];
    for (const owner of this.graph.getModels()) {
      for (const relation of owner.relations) {
        if (this.accepts(owner.id, relation.from.nodeId, actual)) {
          const suggestion: NodeRelationSuggestion | undefined = this.nodeRelationSuggestion(
            modelId,
            owner,
            relation,
            'outgoing',
          );
          if (suggestion) suggestions.push(suggestion);
        }
        if (this.accepts(owner.id, relation.to.nodeId, actual)) {
          const suggestion: NodeRelationSuggestion | undefined = this.nodeRelationSuggestion(
            modelId,
            owner,
            relation,
            'incoming',
          );
          if (suggestion) suggestions.push(suggestion);
        }
      }
    }
    return suggestions;
  }

  private nodeRelationSuggestion(
    modelId: Id,
    owner: GModel,
    relation: GRelation,
    direction: 'outgoing' | 'incoming',
  ): NodeRelationSuggestion | undefined {
    const targetRef: Ref = direction === 'outgoing' ? relation.to.nodeId : relation.from.nodeId;
    const target: ResolvedModelElement<GNode> | undefined = this.graph.resolveNode(owner.id, targetRef);
    if (!target) return undefined;
    const compatibleTargetNodeIds: Id[] = this.localNodes(modelId)
      .filter((candidate: ResolvedModelElement<GNode>): boolean => this.accepts(owner.id, targetRef, candidate))
      .map((candidate: ResolvedModelElement<GNode>): Id => candidate.element.id);
    return {
      modelId: owner.id,
      relationId: relation.id,
      ref: owner.id === modelId ? relation.id : ModelRef.qualify(owner.id, relation.id),
      name: relation.name,
      direction: direction,
      role: direction === 'outgoing' ? relation.to.role : relation.from.role,
      requiredTarget: this.lineageItem(target, modelId),
      compatibleTargetNodeIds: compatibleTargetNodeIds,
      actions: owner.id === modelId ? ['reuse'] : ['reuse', 'refine'],
    };
  }

  private localNodes(modelId: Id): readonly ResolvedModelElement<GNode>[] {
    const model: GModel | undefined = this.graph.getModel(modelId);
    if (!model) return [];
    return model.classifiers.flatMap((classifier): ResolvedModelElement<GNode>[] =>
      classifier.kind === 'GNode' ? [{ modelId: modelId, element: classifier }] : [],
    );
  }

  private lineageItem(item: ResolvedModelElement<GNode>, ownerModelId: Id): NodeLineageItem {
    return {
      modelId: item.modelId,
      nodeId: item.element.id,
      ref: item.modelId === ownerModelId ? item.element.id : ModelRef.qualify(item.modelId, item.element.id),
      name: item.element.name,
    };
  }

  private resolveLocalNode(modelId: Id, nodeId: Id): ResolvedModelElement<GNode> | undefined {
    const node: GNode | undefined = this.graph.getNode(modelId, nodeId);
    return node ? { modelId: modelId, element: node } : undefined;
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
}
