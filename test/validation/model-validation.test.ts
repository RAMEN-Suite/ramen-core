import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_MODEL, ModelValidator, SchemaValidator } from '../../dist/index.js';
import type { GModel } from '../../dist/index.js';

function derivedModel(): GModel {
  return {
    $schema: RAMEN_MODEL.$schema,
    $id: 'https://example.org/project',
    id: 'abcdefghijklmnop',
    version: '1.0.0',
    kind: 'GModel',
    name: 'Project',
    imports: [{ schemaId: RAMEN_MODEL.$id, modelId: RAMEN_MODEL.id, version: RAMEN_MODEL.version, name: RAMEN_MODEL.name }],
    classifiers: [],
    relations: [],
  };
}

void test('RAMEN model and minimal project pass schema and semantic validation', () => {
  const project = derivedModel();
  assert.equal(SchemaValidator.isValid(RAMEN_MODEL), true);
  assert.equal(SchemaValidator.isValid(project), true);
  const result = new ModelValidator().validate(
    RAMEN_MODEL,
    project,
    new Map([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      [project.id, project],
    ]),
  );
  assert.equal(result.hasErrors, false);
  assert.deepEqual(result.diagnostics, []);
});

void test('a missing base import produces a stable diagnostic', () => {
  const project = derivedModel();
  project.imports = [];
  const result = new ModelValidator().validate(
    RAMEN_MODEL,
    project,
    new Map([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      [project.id, project],
    ]),
  );
  assert.equal(result.hasErrors, true);
  assert.ok(result.diagnostics.some((d: { code: string }) => d.code === 'MISSING_BASE_IMPORT'));
});

void test('project example resolves against the current RAMEN model', async () => {
  const { readFileSync } = await import('node:fs');
  const example: unknown = JSON.parse(readFileSync(new URL('../fixtures/example.gcore.json', import.meta.url), 'utf8'));
  SchemaValidator.assertValid(example);
  const result = new ModelValidator().validate(
    RAMEN_MODEL,
    example,
    new Map([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      [example.id, example],
    ]),
  );
  assert.equal(result.hasErrors, false, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
});

void test('project graph errors stop semantic validation', () => {
  const project = derivedModel();
  project.imports.push({
    schemaId: 'https://example.org/missing',
    modelId: 'missingModel0001',
    version: '1.0.0',
    name: 'Missing',
  });

  const result = new ModelValidator().validate(
    RAMEN_MODEL,
    project,
    new Map([
      [RAMEN_MODEL.id, RAMEN_MODEL],
      [project.id, project],
    ]),
  );

  assert.equal(result.hasErrors, true);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'IMPORTED_MODEL_NOT_FOUND'));
});

void test('schema rejects imports without an exact model version', () => {
  const project: GModel = derivedModel();
  const invalid: unknown = {
    ...project,
    imports: [{ schemaId: RAMEN_MODEL.$id, modelId: RAMEN_MODEL.id }],
  };
  assert.equal(SchemaValidator.isValid(invalid), false);
});

void test('schema rejects nested model elements without stable ids', () => {
  const project: GModel = derivedModel();
  const invalid: unknown = {
    ...project,
    classifiers: [
      {
        kind: 'GNode',
        id: 'schemaNode000001',
        name: 'Document',
        superTypes: [],
        attributes: [{ name: 'title', typeId: 'String', bounds: { lowerBound: 1, upperBound: 1 } }],
      },
    ],
  };
  assert.equal(SchemaValidator.isValid(invalid), false);
});
