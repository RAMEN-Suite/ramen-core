import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  type Diagnostic,
  type ModelInstanceGraph,
  type ModelInstanceNode,
  type Node,
  type Relation,
  type ValidationResult,
} from '@ramen-suite/core/model';

function expectCode(result: ValidationResult, code: string, path: string): void {
  const finding: Diagnostic | undefined = result.diagnostics.find((item: Diagnostic): boolean => item.code === code);
  assert.ok(finding, JSON.stringify(result.diagnostics));
  assert.equal(finding.severity, 'error');
  assert.equal(finding.path, path);
}

void test('recorded properties distinguish arrays, scalar values and uniqueness within one record', (): void => {
  const model: Modeller = Modeller.create('Files');
  const file: Node = model.createNode('File').element;

  model.createAttribute(file, { name: 'tags', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: -1 } });
  model.createAttribute(file, { name: 'title', typeId: DataTypes.String });

  const record: ModelInstanceNode = { id: 'fileRecord000001', typeId: file.id, properties: {} };
  const cases: readonly (readonly [Readonly<Record<string, unknown>>, string, string])[] = [
    [{ tags: 'draft' }, 'INSTANCE_PROPERTY_ARRAY_REQUIRED', '/nodes/0/properties/tags'],
    [{ title: ['draft'] }, 'INSTANCE_PROPERTY_SCALAR_REQUIRED', '/nodes/0/properties/title'],
    [{ tags: ['draft', 'draft'] }, 'INSTANCE_PROPERTY_NOT_UNIQUE', '/nodes/0/properties/tags'],
  ];

  for (const [properties, code, path] of cases) {
    const data: ModelInstanceGraph = { nodes: [{ ...record, properties }], relations: [] };
    expectCode(model.validateInstances(data), code, path);
  }
  const valid: ModelInstanceGraph = { nodes: [{ ...record, properties: { tags: ['draft', 'published'] } }], relations: [] };
  assert.equal(model.validateInstances(valid).hasErrors, false);
});

void test('record identity and type errors have distinct diagnostics', (): void => {
  const model: Modeller = Modeller.create('Files');
  const file: Node = model.createNode('File').element;
  const record: ModelInstanceNode = { id: 'fileRecord000001', typeId: file.id, properties: {} };
  const duplicated: ModelInstanceGraph = { nodes: [record, { ...record }], relations: [] };
  const unknown: ModelInstanceGraph = { nodes: [{ ...record, typeId: 'missingType00001' }], relations: [] };

  expectCode(model.validateInstances(duplicated), 'INSTANCE_NODE_ID_DUPLICATE', '/nodes/1');
  expectCode(model.validateInstances(unknown), 'INSTANCE_NODE_TYPE_NOT_FOUND', '/nodes/0/typeId');
});

void test('recorded relations cannot bypass the choices made by the current model level', (): void => {
  const base: Modeller = Modeller.create('Files');
  const file: Node = base.createNode('File').element;
  const folder: Node = base.createNode('Folder').element;
  const relation: Relation = base.createRelation({ name: 'IN', from: { node: file }, to: { node: folder } }).element;
  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: file }).element;
  const section: Node = next.createNode({ name: 'Section', refines: folder }).element;
  const applied: Relation = next.createRelation({ from: { node: page }, to: { node: section } }).element;
  const data: ModelInstanceGraph = {
    nodes: [
      { id: 'pageRecord000001', typeId: page.id, properties: {} },
      { id: 'sectionRecord001', typeId: section.id, properties: {} },
    ],
    relations: [
      {
        id: 'relationRecord01',
        typeId: `${base.getModel().id}:${relation.id}`,
        fromId: 'pageRecord000001',
        toId: 'sectionRecord001',
      },
    ],
  };
  expectCode(next.validateInstances(data), 'INSTANCE_RELATION_TYPE_NOT_ALLOWED', '/relations/0');
  const allowed: ModelInstanceGraph = {
    ...data,
    relations: [{ id: 'relationRecord01', typeId: applied.id, fromId: 'pageRecord000001', toId: 'sectionRecord001' }],
  };
  assert.equal(next.validateInstances(allowed).hasErrors, false);
});
