/** Optional plain-text documentation of a definition, limited to 2,000 Unicode code points. */
export interface DescribedDefinition {
  description?: string;
}

/** Classifier kinds that can be declared by a RAMEN model. */
export type Classifier = Node | DataType;
/** Stable identifier of a model or model element. */
export type Id = string;
/** Local or qualified reference to a model element. */
export type Ref = string;
/** Reference in the `<modelId>:<elementId>` form. */
export type QualifiedRef = string;
/** Built-in JSON value types available without a model declaration; Object is a value, not a Node. */
export type BuiltinType = 'String' | 'Boolean' | 'Integer' | 'Float' | 'Object';
/** Reference to a built-in or declared data type. */
export type TypeRef = Ref;

/** Versioned RMF model containing classifiers, relations, and imports. */
export interface Model extends DescribedDefinition {
  $schema: string;
  $id: string;
  id: Id;
  version: string;
  kind: 'Model';
  name: string;
  imports: Import[];
  classifiers: Classifier[];
  relations: Relation[];
  ext?: Record<string, unknown>;
}

/** Exact dependency on another versioned RMF model. */
export interface Import {
  /** Canonical URI (`$id`) of the imported model document. */
  modelUri: string;
  modelId: Id;
  version: string;
  name?: string;
}

/** Node classifier whose attributes and supertypes describe modelled objects. */
export interface Node extends DescribedDefinition {
  kind: 'Node';
  id: Id;
  name: string;
  superTypes: Ref[];
  attributes: Attribute[];
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Typed structural feature owned by a node. */
export interface Attribute extends DescribedDefinition {
  id: Id;
  name: string;
  typeId: TypeRef;
  bounds: Bounds;
  isKey?: boolean;
  isReadOnly?: boolean;
  isUnique?: boolean;
  isOrdered?: boolean;
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Inclusive cardinality bounds, where `-1` denotes an unbounded upper value. */
export interface Bounds {
  lowerBound: number;
  upperBound: number;
}

/** A rule declared in the model and evaluated against captured data by its named language. */
export interface Constraint extends DescribedDefinition {
  id: Id;
  name: string;
  language: string;
  expression: string | Record<string, unknown>;
  severity?: 'error' | 'warn' | 'info';
  message?: string;
  code?: string;
  ext?: Record<string, unknown>;
}

/** Named value domain; Object-based types are opaque values without modelled members or relationships. */
export interface DataType extends DescribedDefinition {
  kind: 'DataType';
  id: Id;
  name: string;
  /** JSON-compatible representation used before domain constraints are evaluated. */
  baseType: BuiltinType;
  literals?: [Literal, ...Literal[]];
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Named literal of a declared data type. */
export interface Literal extends DescribedDefinition {
  id: Id;
  name: string;
  value?: number;
  literal?: string;
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Typed connection between two node ends. */
export interface Relation extends DescribedDefinition {
  kind: 'Relation';
  id: Id;
  superTypes: Ref[];
  name: string;
  from: RelationEnd;
  to: RelationEnd;
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** One endpoint of a relation, including its node and cardinality. */
export interface RelationEnd {
  id: Id;
  nodeId: Ref;
  bounds: Bounds;
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}
