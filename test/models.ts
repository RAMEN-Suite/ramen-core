import type { Bounds, Attribute, Model, Node, Relation, Id, Ref, TypeRef } from '../dist/index.js';

export const TEST_SCHEMA: string = 'https://ramen-schema.org/model/1.0.0/schema.json';

export function model(id: Id, imports: readonly Model[] = []): Model {
  return {
    $schema: TEST_SCHEMA,
    $id: `https://example.org/${id}`,
    id: id,
    version: '1.0.0',
    kind: 'Model',
    name: id,
    imports: imports.map((imported: Model) => ({
      modelUri: imported.$id,
      modelId: imported.id,
      version: imported.version,
    })),
    classifiers: [],
    relations: [],
  };
}

export function node(id: Id, name: string, superTypes: readonly Ref[] = []): Node {
  return { kind: 'Node', id: id, name: name, superTypes: [...superTypes], attributes: [], constraints: [] };
}

export function attribute(id: Id, name: string, typeId: TypeRef, bounds: Bounds = boundsOf(0, 1)): Attribute {
  return { id: id, name: name, typeId: typeId, bounds: bounds, constraints: [] };
}

export function relation(id: Id, name: string, fromId: Ref, toId: Ref, bounds: Bounds = boundsOf(0, -1)): Relation {
  return {
    kind: 'Relation',
    id: id,
    name: name,
    superTypes: [],
    from: { id: `${id}From`, nodeId: fromId, role: 'source', bounds: boundsOf(0, -1), constraints: [] },
    to: { id: `${id}To`, nodeId: toId, role: 'target', bounds: bounds, constraints: [] },
    constraints: [],
  };
}

export function boundsOf(lowerBound: number, upperBound: number): Bounds {
  return { lowerBound: lowerBound, upperBound: upperBound };
}
