/** Classifier kinds that can be declared by a RAMEN model. */
export type Classifier = Node | DataType;
/** Stable identifier of a model or model element. */
export type Id = string;
/** Local or qualified reference to a model element. */
export type Ref = string;
/** Reference in the `<modelId>:<elementId>` form. */
export type QualifiedRef = string;
/** Primitive data types available without a model declaration. */
export type BuiltinType = 'String' | 'Boolean' | 'Integer' | 'Float';
/** Reference to a built-in or declared data type. */
export type TypeRef = Ref;

/** Versioned RAMEN model containing classifiers, relations, and imports. */
export interface Model {
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

/** Exact dependency on another versioned RAMEN model. */
export interface Import {
  /** Canonical URI (`$id`) of the imported model document. */
  modelUri: string;
  modelId: Id;
  version: string;
  name?: string;
}

/** Node classifier whose attributes and supertypes describe modeled objects. */
export interface Node {
  kind: 'Node';
  id: Id;
  name: string;
  superTypes: Ref[];
  attributes: Attribute[];
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Typed structural feature owned by a node. */
export interface Attribute {
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

/** Portable constraint declaration interpreted by its named constraint language. */
export interface Constraint {
  id: Id;
  name: string;
  language: string;
  expression: string | Record<string, unknown>;
  severity?: 'error' | 'warn' | 'info';
  message?: string;
  code?: string;
  ext?: Record<string, unknown>;
}

/** Declared scalar value domain, optionally restricted to a set of literals. */
export interface DataType {
  kind: 'DataType';
  id: Id;
  name: string;
  /** JSON-compatible primitive representation used before domain constraints are evaluated. */
  baseType: BuiltinType;
  literals?: [Literal, ...Literal[]];
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Named literal of a declared data type. */
export interface Literal {
  id: Id;
  name: string;
  value?: number;
  literal?: string;
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Typed connection between two node ends. */
export interface Relation {
  kind: 'Relation';
  id: Id;
  superTypes: Ref[];
  name: string;
  from: RelationEnd;
  to: RelationEnd;
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** One endpoint of a relation, including role and cardinality. */
export interface RelationEnd {
  id: Id;
  nodeId: Ref;
  role: string;
  bounds: Bounds;
  isNavigable?: boolean;
  isComposite?: boolean;
  constraints?: Constraint[];
  ext?: Record<string, unknown>;
}

/** Portable envelope that keeps multiple RAMEN models and their boundaries in one file. */
export interface ModelBundle {
  $schema: string;
  kind: 'ModelBundle';
  version: string;
  rootModelId: Id;
  models: Model[];
}
