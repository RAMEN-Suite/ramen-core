import assert from 'node:assert/strict';
import test, { type Mock, type TestContext } from 'node:test';
import type { SchemaNode } from 'json-schema-library';
import {
  DataTypes,
  Modeller,
  ModelSchemaValidator,
  ModelValidator,
  type Classifier,
  type Model,
  type ProjectValidationResult,
} from '@ramen-suite/core/model';

function model(): Model {
  const draft: Modeller = Modeller.create('Names');
  draft.createDataType({ name: 'Status', baseType: DataTypes.String });
  return draft.getModel();
}

void test('many syntax-only name errors need one schema pass', (context: TestContext): void => {
  const original: Model = model();
  const source: Classifier | undefined = original.classifiers[0];
  assert.ok(source);
  const input: unknown = {
    ...original,
    classifiers: Array.from({ length: 50 }, (_item: unknown, index: number): unknown => ({
      ...source,
      id: `classifierId${index.toString().padStart(8, '0')}`,
      name: `My ${index}`,
    })),
  };
  const schema: SchemaNode = ModelSchemaValidator.getSchemaNode();
  const check: Mock<SchemaNode['validate']> = context.mock.method(schema, 'validate');

  const result: ProjectValidationResult = new ModelValidator().validateProject(original.id, [input]);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.length, 50);
  assert.equal(check.mock.calls.length, 1);
});

void test('a schema error outside the invalid classifier does not trigger name repair', (context: TestContext): void => {
  const original: Model = model();
  const input: unknown = {
    ...original,
    version: 'invalid',
    classifiers: original.classifiers.map((item: Classifier): unknown => ({ ...item, name: 'My ' })),
  };
  const schema: SchemaNode = ModelSchemaValidator.getSchemaNode();
  const check: Mock<SchemaNode['validate']> = context.mock.method(schema, 'validate');

  const result: ProjectValidationResult = new ModelValidator().validateProject(original.id, [input]);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.length, 2);
  assert.equal(check.mock.calls.length, 1);
});

void test('classifier union errors still receive a second pass and preserve base type failures', (context: TestContext): void => {
  const original: Model = model();
  const input: unknown = {
    ...original,
    classifiers: original.classifiers.map((item: Classifier): unknown => ({ ...item, name: 'My ', baseType: 'Foo' })),
  };
  const schema: SchemaNode = ModelSchemaValidator.getSchemaNode();
  const check: Mock<SchemaNode['validate']> = context.mock.method(schema, 'validate');

  const result: ProjectValidationResult = new ModelValidator().validateProject(original.id, [input]);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.length, 2);
  assert.equal(check.mock.calls.length, 2);
});

void test('null and overlong names receive a second pass without duplicate union errors', (context: TestContext): void => {
  const original: Model = model();
  const schema: SchemaNode = ModelSchemaValidator.getSchemaNode();
  const check: Mock<SchemaNode['validate']> = context.mock.method(schema, 'validate');
  for (const name of [null, 'x'.repeat(41)]) {
    check.mock.resetCalls();
    const input: unknown = {
      ...original,
      classifiers: original.classifiers.map((item: Classifier): unknown => ({ ...item, name })),
    };
    const result: ProjectValidationResult = new ModelValidator().validateProject(original.id, [input]);
    assert.equal(result.valid, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CLASSIFIER_NAME_INVALID');
    assert.equal(check.mock.calls.length, 2);
  }
});
