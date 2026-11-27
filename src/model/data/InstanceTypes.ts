import type { Attribute, Node, Relation, Id, Ref } from '../Types.js';
import type { ConstraintRegistry } from '../validation/Constraints.js';
import type { InstanceValidationProfile } from './ValidationProfiles.js';
import type { ResolvedElement } from '../graph/ProjectGraph.js';

export type { AttributeValidationRule, InstanceValidationProfile } from './ValidationProfiles.js';

/** One modelled object containing only properties declared by its RAMEN model format node type. */
export interface ModelInstanceNode {
  readonly id: Id;
  readonly typeId: Ref;
  readonly properties: Readonly<Record<string, unknown>>;
}

/** One modelled connection between two instance nodes. */
export interface ModelInstanceRelation {
  readonly id: Id;
  readonly typeId: Ref;
  readonly fromId: Id;
  readonly toId: Id;
}

/** Complete instance graph interpreted from the context of one model. */
export interface ModelInstanceGraph {
  readonly nodes: readonly ModelInstanceNode[];
  readonly relations: readonly ModelInstanceRelation[];
}

/** Resolved instance node and its model type. */
export interface ResolvedInstanceNode {
  readonly instance: ModelInstanceNode;
  readonly type: ResolvedElement<Node>;
}

/** Resolved instance relation and its model type. */
export interface ResolvedInstanceRelation {
  readonly instance: ModelInstanceRelation;
  readonly type: ResolvedElement<Relation>;
}

/** Options shared by the RMF and RAMEN recorded-data validation facades. */
export interface DataValidationOptions {
  /** Optional evaluators for project-specific constraint languages. */
  readonly constraints?: ConstraintRegistry;
  /** Without a profile, all findings retain their declared severity. */
  readonly profile?: InstanceValidationProfile;
}

/** Optional domain-specific model view used when validating captured data. */
export interface InstanceValidationOptions {
  /** Restricts relation types to those selected by the current model. */
  readonly relations?: readonly ResolvedElement<Relation>[];
  /** Targeted constraint exceptions; structural validation and cross-record checks still apply. */
  readonly profile?: InstanceValidationProfile;
  /** Supplies additional type-dependent attributes without changing the model graph. */
  readonly attributes?: (type: ResolvedElement<Node>, node: ModelInstanceNode) => readonly Attribute[];
}
