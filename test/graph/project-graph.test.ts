import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectGraph } from '../../dist/index.js';
import type { GModel, GNode } from '../../dist/index.js';

const SCHEMA = 'https://ramen-schema.org/gcore/1.0.0/schema.json';
const ROOT_ID = 'rootModel0000001';
const MIDDLE_ID = 'middleModel00001';
const BASE_ID = 'baseModel0000001';
const NODE_ID = 'nodeIdentifier001';
const CHILD_ID = 'childIdentifier01';

function model(id: string, imports: readonly string[] = [], classifiers: GModel['classifiers'] = []): GModel {
  return {
    $schema: SCHEMA,
    $id: `https://example.org/${id}`,
    id,
    version: '1.0.0',
    kind: 'GModel',
    name: id,
    imports: imports.map((modelId) => ({ schemaId: `https://example.org/${modelId}`, modelId, version: '1.0.0' })),
    classifiers: [...classifiers],
    relations: [],
  };
}

function node(id: string, superTypes: readonly string[] = []): GNode {
  return { kind: 'GNode', id, name: id, superTypes: [...superTypes], attributes: [] };
}

void test('builds a graph for a model chain and resolves an imported node', () => {
  const base = model(BASE_ID, [], [node(NODE_ID)]);
  const middle = model(MIDDLE_ID, [BASE_ID]);
  const root = model(ROOT_ID, [MIDDLE_ID], [node(CHILD_ID, [`${BASE_ID}:${NODE_ID}`])]);

  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, middle, base] });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.graph.getModels().map((item) => item.id),
    [ROOT_ID, MIDDLE_ID, BASE_ID],
  );
  assert.equal(result.graph.resolveNode(ROOT_ID, `${BASE_ID}:${NODE_ID}`)?.element.id, NODE_ID);
  assert.deepEqual(
    result.graph.getNodeAncestors(ROOT_ID, CHILD_ID).map((item) => item.element.id),
    [NODE_ID],
  );
});

void test('accepts a diamond import graph without reporting a cycle', () => {
  const leftId = 'leftModel0000001';
  const rightId = 'rightModel000001';
  const base = model(BASE_ID);
  const left = model(leftId, [BASE_ID]);
  const right = model(rightId, [BASE_ID]);
  const root = model(ROOT_ID, [leftId, rightId]);

  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, left, right, base] });
  assert.equal(result.ok, true);
});

void test('reports a missing root model', () => {
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'PROJECT_ROOT_NOT_FOUND');
});

void test('reports duplicate model identifiers', () => {
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [model(ROOT_ID), model(ROOT_ID)] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'DUPLICATE_MODEL_ID');
});

void test('reports a missing imported model with its source path', () => {
  const root = model(ROOT_ID, [BASE_ID]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'IMPORTED_MODEL_NOT_FOUND');
  assert.equal(result.diagnostics[0]?.path, `/models/${ROOT_ID}/imports/0`);
});

void test('reports an import cycle and includes the cycle in its message', () => {
  const root = model(ROOT_ID, [BASE_ID]);
  const base = model(BASE_ID, [ROOT_ID]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, base] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'IMPORT_CYCLE');
  assert.match(result.diagnostics[0]?.message ?? '', new RegExp(`${ROOT_ID} -> ${BASE_ID} -> ${ROOT_ID}`));
});

void test('reports duplicate element identifiers across element kinds', () => {
  const duplicateId = 'duplicateElement1';
  const root = model(ROOT_ID, [], [node(duplicateId), { kind: 'GDataType', id: duplicateId, name: 'Duplicate' }]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_ELEMENT_ID'));
});

void test('reports unresolved references', () => {
  const root = model(ROOT_ID, [], [node(CHILD_ID, [NODE_ID])]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'ELEMENT_REFERENCE_NOT_FOUND'));
});

void test('reports references to models outside the root import closure', () => {
  const unrelatedId = 'otherModel000001';
  const root = model(ROOT_ID, [], [node(CHILD_ID, [`${unrelatedId}:${NODE_ID}`])]);
  const unrelated = model(unrelatedId, [], [node(NODE_ID)]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, unrelated] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'REFERENCE_MODEL_NOT_REACHABLE'));
});

void test('reports a reference that resolves to the wrong element kind', () => {
  const typeId = 'dataType00000001';
  const root = model(ROOT_ID, [], [{ kind: 'GDataType', id: typeId, name: 'Type' }, node(CHILD_ID, [typeId])]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'ELEMENT_REFERENCE_KIND_MISMATCH'));
});

void test('resolves a chain across four model levels', () => {
  const levelTwoId = 'levelTwoModel001';
  const levelThreeId = 'levelThreeMod01';
  const base = model(BASE_ID, [], [node(NODE_ID)]);
  const levelTwo = model(levelTwoId, [BASE_ID]);
  const levelThree = model(levelThreeId, [levelTwoId]);
  const root = model(ROOT_ID, [levelThreeId], [node(CHILD_ID, [`${BASE_ID}:${NODE_ID}`])]);

  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, levelThree, levelTwo, base] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.graph.getModels().length, 4);
});

void test('resolves custom data types and relation endpoints', () => {
  const dataTypeId = 'customType000001';
  const sourceId = 'sourceNode000001';
  const targetId = 'targetNode000001';
  const relationId = 'relationType00001';
  const root = model(
    ROOT_ID,
    [],
    [
      { kind: 'GDataType', id: dataTypeId, name: 'Status' },
      {
        ...node(sourceId),
        attributes: [{ id: 'statusAttr000001', name: 'status', typeId: dataTypeId, bounds: { lowerBound: 1, upperBound: 1 } }],
      },
      node(targetId),
    ],
  );
  root.relations.push({
    kind: 'GRelation',
    id: relationId,
    name: 'links',
    superTypes: [],
    from: { id: 'sourceEnd0000001', nodeId: sourceId, role: 'source', bounds: { lowerBound: 1, upperBound: 1 } },
    to: { id: 'targetEnd0000001', nodeId: targetId, role: 'target', bounds: { lowerBound: 0, upperBound: -1 } },
  });

  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.graph.getDataType(ROOT_ID, dataTypeId)?.name, 'Status');
  assert.equal(result.graph.getRelation(ROOT_ID, relationId)?.to.nodeId, targetId);
});

void test('protects graph models from mutations of the source model', () => {
  const root = model(ROOT_ID, [], [node(NODE_ID)]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  root.name = 'Changed outside graph';
  assert.notEqual(result.graph.getRootModel().name, root.name);
  assert.equal(Object.isFrozen(result.graph.getRootModel()), true);
});

void test('reports a node inheritance cycle', () => {
  const firstId = 'firstNode0000001';
  const secondId = 'secondNode000001';
  const root = model(ROOT_ID, [], [node(firstId, [secondId]), node(secondId, [firstId])]);
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'INHERITANCE_CYCLE'));
});

void test('reports an import schema URI that does not match its target model', () => {
  const base = model(BASE_ID);
  const root = model(ROOT_ID, [BASE_ID]);
  const firstImport = root.imports[0];
  assert.ok(firstImport);
  firstImport.schemaId = 'https://example.org/wrong-schema';

  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, base] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'IMPORTED_SCHEMA_ID_MISMATCH'));
});

void test('reports an imported model version mismatch', () => {
  const base = model(BASE_ID);
  const root = model(ROOT_ID, [BASE_ID]);
  const firstImport = root.imports[0];
  assert.ok(firstImport);
  firstImport.version = '2.0.0';
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, base] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'IMPORTED_VERSION_MISMATCH'));
});

void test('reports duplicate ids on nested model elements', () => {
  const duplicateId: string = 'nestedDuplicate01';
  const owner = node(NODE_ID);
  owner.attributes.push({
    id: duplicateId,
    name: 'first',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  owner.attributes.push({
    id: duplicateId,
    name: 'second',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  const result = buildProjectGraph({ rootModelId: ROOT_ID, models: [model(ROOT_ID, [], [owner])] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'DUPLICATE_ELEMENT_ID'));
});
