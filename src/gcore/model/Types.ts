export type GClassifier = GNode | GDataType;
export type Id = string;
export type Ref = string;
export type QualifiedRef = string;
export type BuiltinType = 'String' | 'Boolean' | 'Integer' | 'Float';
export type TypeRef = Ref;

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

export interface Import {
  schemaId: string;
  modelId: Id;
  version: string;
  name?: string;
}

export interface GNode {
  kind: 'GNode';
  id: Id;
  name: string;
  superTypes: Ref[];
  attributes: GAttribute[];
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

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

export interface Bounds {
  lowerBound: number;
  upperBound: number;
}

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

export interface GDataType {
  kind: 'GDataType';
  id: Id;
  name: string;
  literals?: [GLiteral, ...GLiteral[]];
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

export interface GLiteral {
  id: Id;
  name: string;
  value?: number;
  literal?: string;
  constraints?: GConstraint[];
  ext?: Record<string, unknown>;
}

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

export interface GModelBundle {
  $schema: string;
  kind: 'GModelBundle';
  version: string;
  rootModelId: Id;
  models: GModel[];
}
