import type { GNode, GRelation, Id, Ref } from '../model/Types';
import type { ResolvedModelElement } from '../project/Graph';

/** One modeled object with user properties separated from tool-managed system data. */
export interface ModelInstanceNode {
  readonly id: Id;
  readonly typeId: Ref;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly systemProperties?: Readonly<Record<string, unknown>>;
}

/** One modeled connection between two instance nodes. */
export interface ModelInstanceRelation {
  readonly id: Id;
  readonly typeId: Ref;
  readonly fromId: Id;
  readonly toId: Id;
  readonly systemProperties?: Readonly<Record<string, unknown>>;
}

/** Instance graph interpreted from the context of one model. */
export interface ModelInstance {
  readonly modelId: Id;
  readonly nodes: readonly ModelInstanceNode[];
  readonly relations: readonly ModelInstanceRelation[];
}

/** Controls validation rules that differ between creation and update. */
export interface InstanceValidationOptions {
  readonly operation?: 'create' | 'update';
}

/** @internal Resolved instance node and its model type. */
export interface ResolvedInstanceNode {
  readonly instance: ModelInstanceNode;
  readonly type: ResolvedModelElement<GNode>;
}

/** @internal Resolved instance relation and its model type. */
export interface ResolvedInstanceRelation {
  readonly instance: ModelInstanceRelation;
  readonly type: ResolvedModelElement<GRelation>;
}
