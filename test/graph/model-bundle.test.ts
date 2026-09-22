import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelBundle, splitModelBundle } from '../../dist/index.js';
import type { GModel } from '../../dist/index.js';

const BASE_ID: string = 'bundleBase000001';
const ROOT_ID: string = 'bundleRoot000001';
const SCHEMA: string = 'https://ramen-schema.org/gcore/1.0.0/schema.json';

function model(id: string, imported?: GModel): GModel {
  return {
    $schema: SCHEMA,
    $id: `https://example.org/${id}`,
    id: id,
    version: '1.0.0',
    kind: 'GModel',
    name: id,
    imports: imported ? [{ modelUri: imported.$id, modelId: imported.id, version: imported.version }] : [],
    classifiers: [],
    relations: [],
  };
}

void test('bundles reachable models and restores their boundaries', () => {
  const base: GModel = model(BASE_ID);
  const root: GModel = model(ROOT_ID, base);
  const result = createModelBundle(ROOT_ID, [root, base]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const serialized: string = JSON.stringify(result.bundle);
  const parsed: unknown = JSON.parse(serialized) as unknown;
  const models: readonly GModel[] = splitModelBundle(parsed);
  assert.deepEqual(models, [root, base]);
  assert.equal(models[0]?.imports[0]?.modelId, BASE_ID);
});

void test('excludes models outside the root import closure', () => {
  const base: GModel = model(BASE_ID);
  const root: GModel = model(ROOT_ID, base);
  const unrelated: GModel = model('unrelated0000001');
  const result = createModelBundle(ROOT_ID, [root, base, unrelated]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.bundle.models.map((item: GModel): string => item.id),
    [ROOT_ID, BASE_ID],
  );
});

void test('rejects malformed bundle JSON', () => {
  assert.throws((): readonly GModel[] => splitModelBundle({ kind: 'GModelBundle' }), /Invalid model bundle/);
});

void test('rejects a bundle whose root cannot be resolved', () => {
  const base: GModel = model(BASE_ID);
  const result = createModelBundle(BASE_ID, [base]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const invalid = { ...result.bundle, rootModelId: ROOT_ID };
  assert.throws((): readonly GModel[] => splitModelBundle(invalid), /Root model not found/);
});
