import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectGraph } from '../../dist/index.js';
import type { Diagnostic, Model, Node, Import, ProjectGraphResult, ResolvedElement } from '../../dist/index.js';

const SCHEMA: string = 'https://ramen-schema.org/model/1.0.0/schema.json';
const ROOT_ID: string = 'rootModel0000001';
const MIDDLE_ID: string = 'middleModel00001';
const BASE_ID: string = 'baseModel0000001';
const NODE_ID: string = 'nodeIdentifier001';
const CHILD_ID: string = 'childIdentifier01';

function model(id: string, imports: readonly string[] = [], classifiers: Model['classifiers'] = []): Model {
  return {
    $schema: SCHEMA,
    $id: `https://example.org/${id}`,
    id,
    version: '1.0.0',
    kind: 'Model',
    name: id,
    imports: imports.map((modelId: string): Import => ({
      modelUri: `https://example.org/${modelId}`,
      modelId,
      version: '1.0.0',
    })),
    classifiers: [...classifiers],
    relations: [],
  };
}

function node(id: string, superTypes: readonly string[] = []): Node {
  return { kind: 'Node', id, name: id, superTypes: [...superTypes], attributes: [] };
}

void test('builds a graph for a model chain and resolves an imported node', (): void => {
  const base: Model = model(BASE_ID, [], [node(NODE_ID)]);
  const middle: Model = model(MIDDLE_ID, [BASE_ID]);
  const root: Model = model(ROOT_ID, [MIDDLE_ID], [node(CHILD_ID, [`${BASE_ID}:${NODE_ID}`])]);

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, middle, base] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.graph.getModels().map((item: Model): string => item.id),
    [ROOT_ID, MIDDLE_ID, BASE_ID],
  );
  assert.deepEqual(
    result.graph.getTransitiveImports(MIDDLE_ID).map((item: Model): string => item.id),
    [BASE_ID],
  );
  assert.equal(result.graph.resolveNode(ROOT_ID, `${BASE_ID}:${NODE_ID}`)?.element.id, NODE_ID);
  assert.deepEqual(
    result.graph.getNodeAncestors(ROOT_ID, CHILD_ID).map((item: ResolvedElement<Node>): string => item.element.id),
    [NODE_ID],
  );
});

void test('accepts a diamond import graph without reporting a cycle', (): void => {
  const leftId: string = 'leftModel0000001';
  const rightId: string = 'rightModel000001';
  const base: Model = model(BASE_ID);
  const left: Model = model(leftId, [BASE_ID]);
  const right: Model = model(rightId, [BASE_ID]);
  const root: Model = model(ROOT_ID, [leftId, rightId]);

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, left, right, base] });
  assert.equal(result.ok, true);
});

void test('reports a missing root model', (): void => {
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'PROJECT_ROOT_NOT_FOUND');
});

void test('reports duplicate model identifiers', (): void => {
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [model(ROOT_ID), model(ROOT_ID)] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'DUPLICATE_MODEL_ID');
});

void test('reports a missing imported model with its source path', (): void => {
  const root: Model = model(ROOT_ID, [BASE_ID]);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'IMPORTED_MODEL_NOT_FOUND');
  assert.equal(result.diagnostics[0]?.path, `/models/${ROOT_ID}/imports/0`);
});

void test('reports an import cycle and includes the cycle in its message', (): void => {
  const root: Model = model(ROOT_ID, [BASE_ID]);
  const base: Model = model(BASE_ID, [ROOT_ID]);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, base] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.diagnostics[0]?.code, 'IMPORT_CYCLE');
  assert.match(result.diagnostics[0]?.message ?? '', new RegExp(`${ROOT_ID} -> ${BASE_ID} -> ${ROOT_ID}`));
});

void test('reports duplicate element identifiers across element kinds', (): void => {
  const duplicateId: string = 'duplicateElement1';
  const root: Model = model(
    ROOT_ID,
    [],
    [node(duplicateId), { kind: 'DataType', id: duplicateId, name: 'Duplicate', baseType: 'String' }],
  );
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'DUPLICATE_ELEMENT_ID'));
});

void test('reports unresolved references', (): void => {
  const root: Model = model(ROOT_ID, [], [node(CHILD_ID, [NODE_ID])]);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'ELEMENT_REFERENCE_NOT_FOUND'));
});

void test('reports references to models outside the root import closure', (): void => {
  const unrelatedId: string = 'otherModel000001';
  const root: Model = model(ROOT_ID, [], [node(CHILD_ID, [`${unrelatedId}:${NODE_ID}`])]);
  const unrelated: Model = model(unrelatedId, [], [node(NODE_ID)]);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, unrelated] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'REFERENCE_MODEL_NOT_REACHABLE'));
});

void test('reports a reference that resolves to the wrong element kind', (): void => {
  const typeId: string = 'dataType00000001';
  const root: Model = model(
    ROOT_ID,
    [],
    [{ kind: 'DataType', id: typeId, name: 'Type', baseType: 'String' }, node(CHILD_ID, [typeId])],
  );
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'ELEMENT_REFERENCE_KIND_MISMATCH'));
});

void test('resolves a chain across four model levels', (): void => {
  const levelTwoId: string = 'levelTwoModel001';
  const levelThreeId: string = 'levelThreeMod01';
  const base: Model = model(BASE_ID, [], [node(NODE_ID)]);
  const levelTwo: Model = model(levelTwoId, [BASE_ID]);
  const levelThree: Model = model(levelThreeId, [levelTwoId]);
  const root: Model = model(ROOT_ID, [levelThreeId], [node(CHILD_ID, [`${BASE_ID}:${NODE_ID}`])]);

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, levelThree, levelTwo, base] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.graph.getModels().length, 4);
});

void test('resolves custom data types and relation endpoints', (): void => {
  const dataTypeId: string = 'customType000001';
  const sourceId: string = 'sourceNode000001';
  const targetId: string = 'targetNode000001';
  const relationId: string = 'relationType00001';
  const root: Model = model(
    ROOT_ID,
    [],
    [
      { kind: 'DataType', id: dataTypeId, name: 'Status', baseType: 'String' },
      {
        ...node(sourceId),
        attributes: [{ id: 'statusAttr000001', name: 'status', typeId: dataTypeId, bounds: { lowerBound: 1, upperBound: 1 } }],
      },
      node(targetId),
    ],
  );

  root.relations.push({
    kind: 'Relation',
    id: relationId,
    name: 'links',
    superTypes: [],
    from: { id: 'sourceEnd0000001', nodeId: sourceId, role: 'source', bounds: { lowerBound: 1, upperBound: 1 } },
    to: { id: 'targetEnd0000001', nodeId: targetId, role: 'target', bounds: { lowerBound: 0, upperBound: -1 } },
  });

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.graph.getDataType(ROOT_ID, dataTypeId)?.name, 'Status');
  assert.equal(result.graph.getRelation(ROOT_ID, relationId)?.to.nodeId, targetId);
});

void test('protects graph models from mutations of the source model', (): void => {
  const root: Model = model(ROOT_ID, [], [node(NODE_ID)]);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  root.name = 'Changed outside graph';
  assert.notEqual(result.graph.getRootModel().name, root.name);
  assert.equal(Object.isFrozen(result.graph.getRootModel()), true);
});

void test('reports a node inheritance cycle', (): void => {
  const firstId: string = 'firstNode0000001';
  const secondId: string = 'secondNode000001';
  const root: Model = model(ROOT_ID, [], [node(firstId, [secondId]), node(secondId, [firstId])]);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root] });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'INHERITANCE_CYCLE'));
});

void test('reports an import model URI that does not match its target model', (): void => {
  const base: Model = model(BASE_ID);
  const root: Model = model(ROOT_ID, [BASE_ID]);
  const firstImport: Import | undefined = root.imports[0];

  assert.ok(firstImport);
  firstImport.modelUri = 'https://example.org/wrong-schema';

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, base] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'IMPORTED_MODEL_URI_MISMATCH'));
});

void test('reports an imported model version mismatch', (): void => {
  const base: Model = model(BASE_ID);
  const root: Model = model(ROOT_ID, [BASE_ID]);
  const firstImport: Import | undefined = root.imports[0];

  assert.ok(firstImport);
  firstImport.version = '2.0.0';

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [root, base] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'IMPORTED_VERSION_MISMATCH'));
});

void test('reports duplicate ids on nested model elements', (): void => {
  const duplicateId: string = 'nestedDuplicate01';
  const owner: Node = node(NODE_ID);

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

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: ROOT_ID, models: [model(ROOT_ID, [], [owner])] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'DUPLICATE_ELEMENT_ID'));
});
