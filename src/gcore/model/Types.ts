/** Classifier kinds that can be declared by a GCore model. */
export type GClassifier = GNode | GDataType;
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

/** Versioned GCore model containing classifiers, relations, and imports. */
export interface GModel {
  $schema: string;
  $id: string;
  id: Id;
  version: string;
  kind: 'GModel';
  name: string;
  imports: Import[];
  classifiers: GClassifier[];
  relations: GRelation[];
  ext?: Record<string, unknown>;
}

/** Exact dependency on another versioned GCore model. */
export interface Import {
  schemaId: string;
  modelId: Id;
  version: string;
  name?: string;
}

/** Node classifier whose attributes and supertypes describe modeled objects. */
export interface GNode {
  kind: 'GNode';
  id: Id;
  name: string;
  superTypes: Ref[];
  attributes: GAttribute[];
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

/** Typed structural feature owned by a node. */
export interface GAttribute {
  id: Id;
  name: string;
  typeId: TypeRef;
  bounds: Bounds;
  isKey?: boolean;
  isReadOnly?: boolean;
  isUnique?: boolean;
  isOrdered?: boolean;
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

/** Inclusive cardinality bounds, where `-1` denotes an unbounded upper value. */
export interface Bounds {
  lowerBound: number;
  upperBound: number;
}

/** Portable constraint declaration interpreted by its named constraint language. */
export interface GConstraint {
  id: Id;
  name: string;
  language: string;
  expression: string | Record<string, unknown>;
  severity?: 'error' | 'warn' | 'info';
  message?: string;
  code?: string;
  tags?: string[];
  ext?: Record<string, unknown>;
}

/** Declared value type, optionally restricted to a set of literals. */
export interface GDataType {
  kind: 'GDataType';
  id: Id;
  name: string;
  literals?: [GLiteral, ...GLiteral[]];
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

/** Named literal of a declared data type. */
export interface GLiteral {
  id: Id;
  name: string;
  value?: number;
  literal?: string;
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

/** Typed connection between two node ends. */
export interface GRelation {
  kind: 'GRelation';
  id: Id;
  superTypes: Ref[];
  name: string;
  from: RelationEnd;
  to: RelationEnd;
  constraints?: GConstraint[];
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
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

/** Portable envelope that keeps multiple GCore models and their boundaries in one file. */
export interface GModelBundle {
  $schema: string;
  kind: 'GModelBundle';
  version: string;
  rootModelId: Id;
  models: GModel[];
}
