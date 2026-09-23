import assert from 'node:assert/strict';
import test from 'node:test';
import { MODEL_SCHEMA_URI, RAMEN_MODEL, ModelSchemaValidator, ModelValidator, RamenValidator } from '../../dist/index.js';
import type { Model, ProjectValidationResult } from '../../dist/index.js';

function derivedModel(): Model {
  return {
    $schema: RAMEN_MODEL.$schema,
    $id: 'https://example.org/project',
    id: 'abcdefghijklmnop',
    version: '1.0.0',
    kind: 'Model',
    name: 'Project',
    imports: [{ modelUri: RAMEN_MODEL.$id, modelId: RAMEN_MODEL.id, version: RAMEN_MODEL.version, name: RAMEN_MODEL.name }],
    classifiers: [],
    relations: [],
  };
}

void test('RAMEN model and minimal project pass schema and semantic validation', () => {
  const project: Model = derivedModel();
  assert.equal(ModelSchemaValidator.isValid(RAMEN_MODEL), true);
  assert.equal(ModelSchemaValidator.isValid(project), true);
  const result: ProjectValidationResult = new ModelValidator().validateProject(project.id, [project, RAMEN_MODEL]);
  assert.equal(result.hasErrors, false);
  assert.deepEqual(result.diagnostics, []);
});

void test('publishes the canonical model schema identifier', (): void => {
  assert.equal(ModelSchemaValidator.getSchemaNode().$id, MODEL_SCHEMA_URI);
});

void test('a missing base import produces a stable diagnostic', () => {
  const project: Model = derivedModel();
  project.imports = [];
  const result: ProjectValidationResult = new RamenValidator().validateProject(project.id, [project, RAMEN_MODEL]);
  assert.equal(result.hasErrors, true);
  assert.ok(result.diagnostics.some((d: { code: string }) => d.code === 'RAMEN_BASE_MODEL_REQUIRED'));
});

void test('project example resolves against the current RAMEN model', async () => {
  const { readFileSync } = await import('node:fs');
  const example: unknown = JSON.parse(readFileSync(new URL('../fixtures/example.model.json', import.meta.url), 'utf8'));
  ModelSchemaValidator.assertValid(example);
  const result: ProjectValidationResult = new ModelValidator().validateProject(example.id, [example, RAMEN_MODEL]);
  assert.equal(result.hasErrors, false, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
});

void test('project graph errors stop semantic validation', () => {
  const project: Model = derivedModel();
  project.imports.push({
    modelUri: 'https://example.org/missing',
    modelId: 'missingModel0001',
    version: '1.0.0',
    name: 'Missing',
  });

  const result: ProjectValidationResult = new ModelValidator().validateProject(project.id, [project, RAMEN_MODEL]);

  assert.equal(result.hasErrors, true);
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'IMPORTED_MODEL_NOT_FOUND'));
});

void test('schema rejects imports without an exact model version', () => {
  const project: Model = derivedModel();
  const invalid: unknown = {
    ...project,
    imports: [{ modelUri: RAMEN_MODEL.$id, modelId: RAMEN_MODEL.id }],
  };
  assert.equal(ModelSchemaValidator.isValid(invalid), false);
});

void test('schema rejects nested model elements without stable ids', () => {
  const project: Model = derivedModel();
  const invalid: unknown = {
    ...project,
    classifiers: [
      {
        kind: 'Node',
        id: 'schemaNode000001',
        name: 'Document',
        superTypes: [],
        attributes: [{ name: 'title', typeId: 'String', bounds: { lowerBound: 1, upperBound: 1 } }],
      },
    ],
  };
  assert.equal(ModelSchemaValidator.isValid(invalid), false);
});
