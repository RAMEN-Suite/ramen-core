import { ModelRelationScope, RelationSelections } from './graph/RelationScope.js';
import { ModelRef } from './graph/References.js';
import { ProjectGraph, ResolvedElement } from './graph/ProjectGraph.js';
import { BuiltinDataTypes } from './Builtins.js';
import type { Bounds, BuiltinType, Attribute, DataType, Model, Node, Relation, Id, Ref } from './Types.js';
import type { ValidProjectResult } from './validation/ModelValidator.js';

/** One local or imported node type that a new node can refine. */
export interface NodeSuggestion {
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
export interface RelationSuggestion {
  readonly modelId: Id;
  readonly relationId: Id;
  readonly ref: Ref;
  readonly name: string;
  /** Reuse references the existing definition; refine creates a specialised local relation. */
  readonly actions: readonly ['reuse', 'refine'];
  /** Human-readable endpoint compatibility explanation, not a stable diagnostic code. */
  readonly explanation: string;
}

/** An existing relationship and its exact, qualified endpoint identities. */
export interface RelationSelection {
  readonly ref: Ref;
  readonly from: Ref;
  readonly to: Ref;
}

/** One node in the selected node's base-first refinement lineage. */
export interface NodeLineageItem {
  readonly modelId: Id;
  readonly nodeId: Id;
  readonly ref: Ref;
  readonly name: string;
}

/** One local or inherited attribute visible on a refined node. */
export interface AttributeInfo {
  readonly attributeId: Id;
  readonly name: string;
  readonly typeId: Ref;
  readonly bounds: Bounds;
  readonly declaredBy: NodeLineageItem;
  readonly inherited: boolean;
}

/** One relationship that can apply to a selected node and its compatible local targets. */
export interface NodeRelationSuggestion {
  readonly modelId: Id;
  readonly relationId: Id;
  readonly ref: Ref;
  readonly name: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly requiredTarget: NodeLineageItem;
  /** Local IDs or qualified references for imported target nodes. */
  readonly compatibleTargetNodeIds: readonly Ref[];
  /** Local relations permit reuse; imported relations also permit creating a local refinement. */
  readonly actions: readonly ('reuse' | 'refine')[];
}

/** Result of checking whether an attribute name can be declared locally. */
export interface AttributeNameResult {
  readonly allowed: boolean;
  readonly conflicts: readonly 'attribute'[];
}

/** Provides generic modelling suggestions from the same graph used by validation. */
export class ModelAdvisor {
  protected readonly graph: ProjectGraph;
  protected readonly relations: ModelRelationScope;

  /** Creates an advisor for one validated snapshot and its explicit extension selections. */
  public constructor(result: ValidProjectResult, selections?: RelationSelections) {
    this.graph = result.graph;
    this.relations = new ModelRelationScope(result.graph, selections);
  }

  /** Lists all inherited and local attributes visible on one node. */
  public getAttributes(modelId: Id, nodeId: Id): readonly AttributeInfo[] {
    const actual: ResolvedElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    if (!actual) return [];

    const ancestors: readonly ResolvedElement<Node>[] = [
      ...this.graph.getNodeAncestors(actual.modelId, actual.element.id),
    ].reverse();

    return this.attributeInfo([...ancestors, actual], actual);
  }

  /** Returns the base-first refinement lineage of one local or imported node. */
  public getNodeLineage(modelId: Id, nodeId: Id): readonly NodeLineageItem[] {
    const actual: ResolvedElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    if (!actual) return [];

    const ancestors: ResolvedElement<Node>[] = [...this.graph.getNodeAncestors(actual.modelId, actual.element.id)].reverse();
    const lineage: readonly ResolvedElement<Node>[] = [...ancestors, actual];

    return lineage.map((item: ResolvedElement<Node>): NodeLineageItem => this.lineageItem(item, modelId));
  }

  /**
   * Finds one selected node that refines every other selected node.
   * @throws When a selected node reference cannot be resolved.
   */
  public getMostSpecificNode(modelId: Id, refs: readonly Ref[]): NodeLineageItem | undefined {
    let mostSpecific: ResolvedElement<Node> | undefined;

    for (const ref of refs) {
      const node: ResolvedElement<Node> | undefined = this.resolveNode(modelId, ref);
      if (!node) throw new Error(`Node not found: '${ref}'.`);

      if (!mostSpecific || this.graph.isNodeSameOrSubtype(node, mostSpecific)) {
        mostSpecific = node;
      } else if (!this.graph.isNodeSameOrSubtype(mostSpecific, node)) {
        return undefined;
      }
    }

    return mostSpecific ? this.lineageItem(mostSpecific, modelId) : undefined;
  }

  /**
   * Lists existing relationships with exactly these endpoint types, including permitted predecessor definitions.
   * Returns an empty list when no relationship matches. Unknown nodes are invalid inputs.
   * Does not create relationships or choose between parallel definitions.
   */
  public getRelations(modelId: Id, from: Ref, to: Ref): readonly RelationSelection[] {
    const source: Ref = this.qualifiedNode(modelId, from);
    const target: Ref = this.qualifiedNode(modelId, to);
    const choices: readonly ResolvedElement<Relation>[] = [
      ...this.relations.available(modelId),
      ...this.relations.bases(modelId),
    ];
    const matches: Map<Ref, RelationSelection> = new Map<Ref, RelationSelection>();

    for (const item of choices) {
      if (!this.matchesEndpoints(item, source, target)) continue;
      const ref: Ref = ModelRef.qualify(item.modelId, item.element.id);
      matches.set(ref, Object.freeze({ ref, from: source, to: target }));
    }

    return Object.freeze([...matches.values()]);
  }

  /** Lists local and imported node types that a new node can refine. */
  public suggestNodes(modelId: Id): readonly NodeSuggestion[] {
    const current: Model | undefined = this.graph.getModel(modelId);
    const models: readonly Model[] = current ? [current, ...this.importedModels(modelId)] : this.importedModels(modelId);

    return models
      .flatMap((model: Model): NodeSuggestion[] =>
        model.classifiers.flatMap((classifier): NodeSuggestion[] => {
          if (classifier.kind !== 'Node') return [];
          return [
            {
              modelId: model.id,
              nodeId: classifier.id,
              ref: model.id === modelId ? classifier.id : ModelRef.qualify(model.id, classifier.id),
              name: classifier.name,
            },
          ];
        }),
      )
      .sort((left: NodeSuggestion, right: NodeSuggestion): number => left.name.localeCompare(right.name));
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

  /** Lists possible incoming and outgoing connections for one local or imported node. */
  public suggestConnections(modelId: Id, nodeId: Id): readonly NodeRelationSuggestion[] {
    const actual: ResolvedElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    return actual ? this.nodeRelationSuggestions(modelId, actual) : [];
  }

  /** Lists local and permitted predecessor relations compatible with both selected node types. */
  public suggestRelations(modelId: Id, fromNodeId: Id, toNodeId: Id): readonly RelationSuggestion[] {
    const from: ResolvedElement<Node> | undefined = this.resolveNode(modelId, fromNodeId);
    const to: ResolvedElement<Node> | undefined = this.resolveNode(modelId, toNodeId);

    if (!from || !to) return [];
    const choices: Map<Ref, ResolvedElement<Relation>> = new Map<Ref, ResolvedElement<Relation>>();
    const candidates: readonly ResolvedElement<Relation>[] = [
      ...this.relations.bases(modelId),
      ...this.relations.available(modelId),
    ];

    for (const item of candidates) {
      choices.set(ModelRef.qualify(item.modelId, item.element.id), item);
    }

    return [...choices.values()]
      .flatMap((item: ResolvedElement<Relation>): RelationSuggestion[] => {
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
      .sort((left: RelationSuggestion, right: RelationSuggestion): number => left.name.localeCompare(right.name));
  }

  /** Checks inherited attributes before an attribute is created. */
  public validateAttributeName(modelId: Id, nodeId: Id, name: string): AttributeNameResult {
    const actual: ResolvedElement<Node> | undefined = this.resolveNode(modelId, nodeId);
    if (!actual) return { allowed: false, conflicts: [] };
    const attributes: readonly AttributeInfo[] = this.getAttributes(modelId, nodeId);
    const conflicts: 'attribute'[] = [];

    const nameExists: boolean = attributes.some((attribute: AttributeInfo): boolean => attribute.name === name);
    if (nameExists) conflicts.push('attribute');
    return { allowed: conflicts.length === 0, conflicts: conflicts };
  }

  private matchesEndpoints(item: ResolvedElement<Relation>, from: Ref, to: Ref): boolean {
    const source: ResolvedElement<Node> | undefined = this.graph.resolveNode(item.modelId, item.element.from.nodeId);
    const target: ResolvedElement<Node> | undefined = this.graph.resolveNode(item.modelId, item.element.to.nodeId);
    if (!source || !target) return false;
    return (
      ModelRef.qualify(source.modelId, source.element.id) === from && ModelRef.qualify(target.modelId, target.element.id) === to
    );
  }

  private qualifiedNode(modelId: Id, ref: Ref): Ref {
    const node: ResolvedElement<Node> | undefined = this.graph.resolveNode(modelId, ref);
    if (!node) throw new Error(`Unknown node '${ref}'.`);
    return ModelRef.qualify(node.modelId, node.element.id);
  }

  protected importedModels(modelId: Id): readonly Model[] {
    return this.graph.getTransitiveImports(modelId);
  }

  private attributeInfo(lineage: readonly ResolvedElement<Node>[], actual: ResolvedElement<Node>): readonly AttributeInfo[] {
    return lineage.flatMap((owner: ResolvedElement<Node>): AttributeInfo[] => {
      const declaredBy: NodeLineageItem = this.lineageItem(owner, actual.modelId);
      const inherited: boolean = owner.modelId !== actual.modelId || owner.element.id !== actual.element.id;

      return owner.element.attributes.map((attribute: Attribute): AttributeInfo => {
        const localType: boolean = owner.modelId === actual.modelId || BuiltinDataTypes.isBuiltin(attribute.typeId);
        const qualified: boolean = ModelRef.isQualified(attribute.typeId);
        const typeId: Ref = localType || qualified ? attribute.typeId : ModelRef.qualify(owner.modelId, attribute.typeId);

        return {
          attributeId: attribute.id,
          name: attribute.name,
          typeId,
          bounds: { ...attribute.bounds },
          declaredBy: { ...declaredBy },
          inherited,
        };
      });
    });
  }

  protected nodeRelationSuggestions(modelId: Id, actual: ResolvedElement<Node>): readonly NodeRelationSuggestion[] {
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
    const target: ResolvedElement<Node> | undefined = this.graph.resolveNode(owner.id, targetRef);

    if (!target) return undefined;
    const compatibleTargetNodeIds: Ref[] = this.graph
      .getAvailableNodes(modelId)
      .filter((candidate: ResolvedElement<Node>): boolean => this.graph.acceptsNode(owner.id, targetRef, candidate))
      .map((candidate: ResolvedElement<Node>): Ref =>
        candidate.modelId === modelId ? candidate.element.id : ModelRef.qualify(candidate.modelId, candidate.element.id),
      );

    return {
      modelId: owner.id,
      relationId: relation.id,
      ref: owner.id === modelId ? relation.id : ModelRef.qualify(owner.id, relation.id),
      name: relation.name,
      direction: direction,
      requiredTarget: this.lineageItem(target, modelId),
      compatibleTargetNodeIds: compatibleTargetNodeIds,
      actions: owner.id === modelId ? ['reuse'] : ['reuse', 'refine'],
    };
  }

  private lineageItem(item: ResolvedElement<Node>, ownerModelId: Id): NodeLineageItem {
    return {
      modelId: item.modelId,
      nodeId: item.element.id,
      ref: item.modelId === ownerModelId ? item.element.id : ModelRef.qualify(item.modelId, item.element.id),
      name: item.element.name,
    };
  }

  protected resolveNode(modelId: Id, nodeId: Id): ResolvedElement<Node> | undefined {
    return this.graph.resolveNode(modelId, nodeId);
  }
}
