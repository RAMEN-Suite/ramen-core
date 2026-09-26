import { ModelRelationScope, RelationSelections } from './graph/RelationScope';
import { ModelRef } from './graph/References';
import { ProjectGraph, ResolvedModelElement } from './graph/ProjectGraph';
import { BuiltinDataTypes } from './Builtins';
import type { Bounds, BuiltinType, Attribute, DataType, Model, Node, Relation, Id, Ref } from './Types';
import type { ValidProjectResult } from './validation/ModelValidator';

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
  /** Local IDs or qualified references for imported target nodes. */
  readonly compatibleTargetNodeIds: readonly Ref[];
  readonly actions: readonly ('reuse' | 'refine')[];
}

/** Complete deterministic advice for one local or imported node in a validated project. */
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

/** Provides generic modeling suggestions from the same graph used by validation. */
export class ModelAdvisor {
  protected readonly graph: ProjectGraph;
  protected readonly relations: ModelRelationScope;

  /** Creates an advisor for one validated snapshot and its explicit extension selections. */
  public constructor(result: ValidProjectResult, selections?: RelationSelections) {
    this.graph = result.graph;
    this.relations = new ModelRelationScope(result.graph, selections);
  }

  /** Lists imported node types that can be refined by a new node in the selected model. */
  public suggestNodeRefinements(modelId: Id): readonly NodeRefinementSuggestion[] {
    return this.importedModels(modelId)
      .flatMap((model: Model): NodeRefinementSuggestion[] =>
        model.classifiers.flatMap((classifier): NodeRefinementSuggestion[] => {
          if (classifier.kind !== 'Node') return [];
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
      (model: Model | undefined): DataTypeSuggestion[] => {
        if (!model) return [];
        return model.classifiers.flatMap((classifier): DataTypeSuggestion[] => {
          if (classifier.kind !== 'DataType') return [];
          const dataType: DataType = classifier;
          const ref: Ref = model.id === modelId ? dataType.id : ModelRef.qualify(model.id, dataType.id);
          return [{ modelId: model.id, dataTypeId: dataType.id, ref: ref, name: dataType.name, baseType: dataType.baseType }];
        });
      },
    );
    return [...builtins, ...declared].sort((left: DataTypeSuggestion, right: DataTypeSuggestion): number =>
      left.name.localeCompare(right.name),
    );
  }

  /** Returns the refinement lineage, effective attributes, and possible relations for one local or imported node. */
  public adviseNode(modelId: Id, nodeId: Id): NodeAdvice | undefined {
    const actual: ResolvedModelElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    if (!actual) return undefined;
    const ancestors: ResolvedModelElement<Node>[] = [...this.graph.getNodeAncestors(actual.modelId, actual.element.id)].reverse();
    const lineage: readonly ResolvedModelElement<Node>[] = [...ancestors, actual];

    return {
      lineage: lineage.map((item: ResolvedModelElement<Node>): NodeLineageItem => this.lineageItem(item, modelId)),
      attributes: this.attributeSuggestions(lineage, actual),
      relations: this.nodeRelationSuggestions(modelId, actual),
    };
  }

  /** Lists all inherited and local attributes visible on one node. */
  public suggestAttributes(modelId: Id, nodeId: Id): readonly AttributeSuggestion[] {
    const actual: ResolvedModelElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    if (!actual) return [];
    const ancestors: readonly ResolvedModelElement<Node>[] = [
      ...this.graph.getNodeAncestors(actual.modelId, actual.element.id),
    ].reverse();
    return this.attributeSuggestions([...ancestors, actual], actual);
  }

  /** Lists possible incoming and outgoing connections for one local or imported node. */
  public suggestConnections(modelId: Id, nodeId: Id): readonly NodeRelationSuggestion[] {
    const actual: ResolvedModelElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    return actual ? this.nodeRelationSuggestions(modelId, actual) : [];
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
    const from: ResolvedModelElement<Node> | undefined = this.resolveNode(modelId, fromNodeId);
    const to: ResolvedModelElement<Node> | undefined = this.resolveNode(modelId, toNodeId);

    if (!from || !to) return [];
    return this.relations
      .bases(modelId)
      .flatMap((item: ResolvedModelElement<Relation>): RelationRefinementSuggestion[] => {
        const relation: Relation = item.element;
        if (!this.graph.acceptsNode(item.modelId, relation.from.nodeId, from)) return [];
        if (!this.graph.acceptsNode(item.modelId, relation.to.nodeId, to)) return [];
        return [
          {
            modelId: item.modelId,
            relationId: relation.id,
            ref: ModelRef.qualify(item.modelId, relation.id),
            name: relation.name,
            actions: ['reuse', 'refine'],
            explanation: `'${relation.name}' accepts '${from.element.name}' as source and '${to.element.name}' as target.`,
          },
        ];
      })
      .sort((left: RelationRefinementSuggestion, right: RelationRefinementSuggestion): number =>
        left.name.localeCompare(right.name),
      );
  }

  protected importedModels(modelId: Id): readonly Model[] {
    return this.graph.getTransitiveImports(modelId);
  }

  private attributeSuggestions(
    lineage: readonly ResolvedModelElement<Node>[],
    actual: ResolvedModelElement<Node>,
  ): readonly AttributeSuggestion[] {
    return lineage.flatMap((owner: ResolvedModelElement<Node>): AttributeSuggestion[] =>
      owner.element.attributes.map((attribute: Attribute): AttributeSuggestion => ({
        attributeId: attribute.id,
        name: attribute.name,
        typeId:
          owner.modelId === actual.modelId ||
          BuiltinDataTypes.isBuiltin(attribute.typeId) ||
          ModelRef.isQualified(attribute.typeId)
            ? attribute.typeId
            : ModelRef.qualify(owner.modelId, attribute.typeId),
        bounds: { ...attribute.bounds },
        declaredBy: this.lineageItem(owner, actual.modelId),
        inherited: owner.modelId !== actual.modelId || owner.element.id !== actual.element.id,
      })),
    );
  }

  protected nodeRelationSuggestions(modelId: Id, actual: ResolvedModelElement<Node>): readonly NodeRelationSuggestion[] {
    const suggestions: NodeRelationSuggestion[] = [];
    for (const item of this.relations.available(modelId)) {
      const owner: Model | undefined = this.graph.getModel(item.modelId);
      if (!owner) continue;
      for (const direction of ['outgoing', 'incoming'] as const) {
        const endpoint: Ref = direction === 'outgoing' ? item.element.from.nodeId : item.element.to.nodeId;
        if (!this.graph.acceptsNode(owner.id, endpoint, actual)) continue;
        const suggestion: NodeRelationSuggestion | undefined = this.nodeRelationSuggestion(
          modelId,
          owner,
          item.element,
          direction,
        );
        if (suggestion) suggestions.push(suggestion);
      }
    }
    return suggestions;
  }

  private nodeRelationSuggestion(
    modelId: Id,
    owner: Model,
    relation: Relation,
    direction: 'outgoing' | 'incoming',
  ): NodeRelationSuggestion | undefined {
    const targetRef: Ref = direction === 'outgoing' ? relation.to.nodeId : relation.from.nodeId;
    const target: ResolvedModelElement<Node> | undefined = this.graph.resolveNode(owner.id, targetRef);

    if (!target) return undefined;
    const compatibleTargetNodeIds: Ref[] = this.graph
      .getAvailableNodes(modelId)
      .filter((candidate: ResolvedModelElement<Node>): boolean => this.graph.acceptsNode(owner.id, targetRef, candidate))
      .map((candidate: ResolvedModelElement<Node>): Ref =>
        candidate.modelId === modelId ? candidate.element.id : ModelRef.qualify(candidate.modelId, candidate.element.id),
      );

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

  private lineageItem(item: ResolvedModelElement<Node>, ownerModelId: Id): NodeLineageItem {
    return {
      modelId: item.modelId,
      nodeId: item.element.id,
      ref: item.modelId === ownerModelId ? item.element.id : ModelRef.qualify(item.modelId, item.element.id),
      name: item.element.name,
    };
  }

  protected resolveNode(modelId: Id, nodeId: Id): ResolvedModelElement<Node> | undefined {
    return this.graph.resolveNode(modelId, nodeId);
  }
}
