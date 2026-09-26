import assert from 'node:assert/strict';
import test from 'node:test';
import { MODEL_BUNDLE_SCHEMA, createModelBundle, splitModelBundle } from '../../dist/index.js';
import type { CreateBundleResult, Diagnostic, Model } from '../../dist/index.js';

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

void test('bundles reachable models and restores their boundaries', (): void => {
  const base: Model = model(BASE_ID);
  const root: Model = model(ROOT_ID, base);
  const result: CreateBundleResult = createModelBundle(ROOT_ID, [root, base]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.$schema, MODEL_BUNDLE_SCHEMA);

  const serialized: string = JSON.stringify(result.bundle);
  const parsed: unknown = JSON.parse(serialized) as unknown;
  const models: readonly Model[] = splitModelBundle(parsed);

  assert.deepEqual(models, [root, base]);
  assert.equal(models[0]?.imports[0]?.modelId, BASE_ID);
});

void test('excludes models outside the root import closure', (): void => {
  const base: Model = model(BASE_ID);
  const root: Model = model(ROOT_ID, base);
  const unrelated: Model = model('unrelated0000001');
  const result: CreateBundleResult = createModelBundle(ROOT_ID, [root, base, unrelated]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.bundle.models.map((item: Model): string => item.id),
    [ROOT_ID, BASE_ID],
  );
});

void test('rejects malformed bundle JSON', (): void => {
  assert.throws((): readonly Model[] => splitModelBundle({ kind: 'ModelBundle' }), /Invalid model bundle/);
});

void test('rejects a bundle whose root cannot be resolved', (): void => {
  const base: Model = model(BASE_ID);
  const result: CreateBundleResult = createModelBundle(BASE_ID, [base]);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const invalid: { rootModelId: string; $schema: string; kind: 'ModelBundle'; version: string; models: Model[] } = {
    ...result.bundle,
    rootModelId: ROOT_ID,
  };
  assert.throws((): readonly Model[] => splitModelBundle(invalid), /Root model not found/);
});

void test('generic bundle export rejects a model that violates semantic rules', (): void => {
  const root: Model = model('semanticBundle001');
  root.classifiers.push({
    kind: 'Node',
    id: 'semanticNode00001',
    name: 'Record',
    superTypes: [],
    attributes: [{ id: 'semanticField001', name: 'name', typeId: 'String', bounds: { lowerBound: 2, upperBound: 1 } }],
  });
  const result: CreateBundleResult = createModelBundle(root.id, [root]);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'ATTRIBUTE_BOUNDS_INVALID'));
});
