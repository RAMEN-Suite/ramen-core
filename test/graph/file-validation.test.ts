import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFiles } from '../../dist/ramen-core/index.js';
import type { ModelFile, Model } from '../../dist/ramen-core/index.js';

const BASE_ID: string = 'bundleBase000001';
const ROOT_ID: string = 'bundleRoot000001';
const SCHEMA: string = 'https://ramen-schema.org/model/1.0.0/schema.json';

function model(id: string, imported?: Model): Model {
  return {
    $schema: SCHEMA,
    $id: `https://example.org/${id}`,
    id: id,
    version: '1.0.0',
    kind: 'Model',
    name: id,
    imports: imported ? [{ modelUri: imported.$id, modelId: imported.id, version: imported.version }] : [],
    classifiers: [],
    relations: [],
  };
}

void test('exports reachable models and restores their boundaries', (): void => {
  const base: Model = model(BASE_ID);
  const root: Model = model(ROOT_ID, base);
  const result: ModelFile = ModelFiles.write(ROOT_ID, [root, base]);

  const serialized: string = JSON.stringify(result);
  const parsed: unknown = JSON.parse(serialized) as unknown;
  const models: readonly Model[] = ModelFiles.read(parsed);

  assert.deepEqual(models, [root, base]);
  assert.equal(models[0]?.imports[0]?.modelId, BASE_ID);
});

void test('excludes models outside the root import closure', (): void => {
  const base: Model = model(BASE_ID);
  const root: Model = model(ROOT_ID, base);
  const unrelated: Model = model('unrelated0000001');
  const result: ModelFile = ModelFiles.write(ROOT_ID, [root, base, unrelated]);

  assert.deepEqual(
    result.models.map((item: ModelFile['models'][number]): string => item.id),
    [ROOT_ID, BASE_ID],
  );
});

void test('rejects malformed file JSON', (): void => {
  assert.throws((): readonly Model[] => ModelFiles.read({ kind: 'ModelBundle' }), /Invalid model file/);
});

void test('rejects a file whose root cannot be resolved', (): void => {
  const base: Model = model(BASE_ID);
  const result: ModelFile = ModelFiles.write(BASE_ID, [base]);

  const invalid: ModelFile = { ...result, id: ROOT_ID };
  assert.throws((): readonly Model[] => ModelFiles.read(invalid), /Root model not found/);
});

void test('generic file export rejects a model that violates semantic rules', (): void => {
  const root: Model = model('semanticBundle001');
  root.classifiers.push({
    kind: 'Node',
    id: 'semanticNode00001',
    name: 'Record',
    superTypes: [],
    attributes: [{ id: 'semanticField001', name: 'name', typeId: 'String', bounds: { lowerBound: 2, upperBound: 1 } }],
  });
  assert.throws((): ModelFile => ModelFiles.write(root.id, [root]), /Invalid model file/);
});
