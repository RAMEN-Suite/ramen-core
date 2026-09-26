import type { Attribute, Node, Relation, Id, Ref } from '../Types';
import type { ResolvedModelElement } from '../graph/ProjectGraph';

/** One modeled object containing only properties declared by its RAMEN model format node type. */
export interface ModelInstanceNode {
  readonly id: Id;
  readonly typeId: Ref;
  readonly properties: Readonly<Record<string, unknown>>;
}

/** One modeled connection between two instance nodes. */
export interface ModelInstanceRelation {
  readonly id: Id;
  readonly typeId: Ref;
  readonly fromId: Id;
  readonly toId: Id;
}

/** Complete instance graph interpreted from the context of one model. */
export interface ModelInstanceGraph {
  readonly modelId: Id;
  readonly nodes: readonly ModelInstanceNode[];
  readonly relations: readonly ModelInstanceRelation[];
}

/** @internal Resolved instance node and its model type. */
export interface ResolvedInstanceNode {
  readonly instance: ModelInstanceNode;
  readonly type: ResolvedModelElement<Node>;
}

/** @internal Resolved instance relation and its model type. */
export interface ResolvedInstanceRelation {
  readonly instance: ModelInstanceRelation;
  readonly type: ResolvedModelElement<Relation>;
}

/** Optional domain-specific model view used when validating captured data. */
export interface InstanceValidationOptions {
  /** Restricts relation types to those selected by the current model. */
  readonly relations?: readonly ResolvedModelElement<Relation>[];
  /** Supplies additional type-dependent attributes without changing the model graph. */
  readonly attributes?: (type: ResolvedModelElement<Node>, node: ModelInstanceNode) => readonly Attribute[];
}
