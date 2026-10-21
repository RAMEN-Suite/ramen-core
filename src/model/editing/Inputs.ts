import type { Bounds, Constraint, Id, Literal, Ref } from '../Types.js';
import type { ProjectValidationResult } from '../validation/ModelValidator.js';
import type { CreateAttributeInput } from './Factory.js';

/** Model identity; omitted IDs and URIs are generated, and version defaults to 1.0.0. */
export interface ModelInput {
  readonly name: string;
  readonly description?: string;
  readonly id?: Id;
  readonly uri?: string;
  readonly version?: string;
}

/** An element identified within its declaring model. */
export interface ElementRef {
  readonly modelId: Id;
  readonly elementId: Id;
}

/** Pass an ID, a qualified reference, an element, or a suggestion directly. */
export type ElementInput = Ref | ElementRef | { readonly id: Id } | { readonly ref: Ref };

/** Declare a root node or a refinement with optional rules for its recorded data. */
export interface NodeInput {
  readonly name: string;
  readonly description?: string;
  readonly refines?: ElementInput;
  readonly constraints?: readonly Constraint[];
}

/** Select a data type object with type or a string reference with typeId. Attributes default to 0..1. */
export type AttributeInput = Omit<CreateAttributeInput, 'typeId' | 'bounds'> & {
  readonly bounds?: Bounds;
} & (
    | { readonly type: Exclude<ElementInput, Ref>; readonly typeId?: Ref }
    | { readonly type?: Exclude<ElementInput, Ref>; readonly typeId: Ref }
  );

/** One end of a new relation. A node object takes precedence over a supplied ID. */
export type RelationEndInput = {
  readonly bounds?: Bounds;
  readonly constraints?: readonly Constraint[];
} & (
  | { readonly node: Exclude<ElementInput, Ref>; readonly nodeId?: Ref }
  | { readonly node?: Exclude<ElementInput, Ref>; readonly nodeId: Ref }
);

/** Declare a root relation or apply one permitted by the preceding model level. Root bounds default to 0..*. */
export interface RelationInput {
  readonly refines?: ElementInput;
  readonly name?: string;
  readonly description?: string;
  readonly from: RelationEndInput;
  readonly to: RelationEndInput;
  readonly constraints?: readonly Constraint[];
}

/** Values of one data type literal. */
export interface LiteralInput {
  readonly name: string;
  readonly description?: string;
  readonly literal?: string;
  readonly value?: number;
}

/** Editable fields of a literal. */
export type LiteralUpdate = Partial<Pick<Literal, 'name' | 'description' | 'literal' | 'value' | 'constraints' | 'ext'>>;

/** A detached edited element and immediate validation of the resulting model. */
export interface ModelChange<T> {
  readonly element: T;
  readonly validation: ProjectValidationResult;
}

/** References removed by a generic edit; extensions can clean up their own references. */
export interface Removal {
  readonly attributeId: Id;
}
