import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  ModelValidator,
  ModelSchemaValidator,
  InstanceSchemaValidator,
  type Constraint,
  type DataType,
  type Diagnostic,
  type ProjectValidationResult,
  type ValidationResult,
} from '@ramen-suite/core/model';
import { RamenModel, RamenAnnotationSchemaValidator, RamenProjectSchemaValidator } from '@ramen-suite/core/ramen';

void test('untrusted JSON shapes fail at the model, exchange and recorded-data boundaries', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const validator: ModelValidator = new ModelValidator();
  const inputs: readonly unknown[] = [null, undefined, false, 7, 'not a document', [], {}, { nodes: {}, relations: [] }];

  for (const input of inputs) {
    const definition: ProjectValidationResult = validator.validateProject(model.getModel().id, [input]);
    const records: ValidationResult = model.validateInstances(input);

    assert.equal(definition.valid, false);
    assert.equal(definition.diagnostics[0]?.code, 'SCHEMA_INVALID');
    assert.equal(definition.diagnostics[0]?.path, '/models/0');
    assert.equal(records.hasErrors, true);
    assert.equal(records.diagnostics[0]?.code, 'INSTANCE_SCHEMA_INVALID');
    assert.equal(records.diagnostics[0]?.path, '/');
    assert.throws((): Modeller => Modeller.import(input), /Invalid model file/);
    assert.throws((): RamenModel => RamenModel.import(input), /Invalid model file/);
  }
});

void test('all public schema guards reject a missing root document', (): void => {
  const validators: readonly {
    readonly isValid: (input: unknown) => boolean;
    readonly assertValid: (input: unknown) => void;
  }[] = [ModelSchemaValidator, InstanceSchemaValidator, RamenProjectSchemaValidator, RamenAnnotationSchemaValidator];

  for (const validator of validators) {
    assert.equal(validator.isValid(undefined), false);
    assert.throws((): void => validator.assertValid(undefined));
  }
});

void test('nested JSON Schema findings retain escaped object keys in their value paths', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const rule: Constraint = {
    id: 'nestedRule000001',
    name: 'Nested length',
    language: 'json-schema',
    expression: { properties: { 'a/b': { properties: { '~key': { minLength: 3 } } } } },
  };
  const metadata: DataType = model.createDataType({ name: 'Metadata', baseType: DataTypes.Object, constraints: [rule] }).element;
  const result: ValidationResult = model.validateValue(metadata, { 'a/b': { '~key': 'Hi' } });
  const finding: Diagnostic | undefined = result.diagnostics[0];

  assert.equal(result.hasErrors, true);
  assert.equal(finding?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.equal(finding?.severity, 'error');
  assert.equal(finding?.ref, rule.id);
  assert.equal(finding?.path, '/value/a~1b/~0key');
  assert.equal(model.validateValue(metadata, { 'a/b': { '~key': 'Hello' } }).hasErrors, false);
});

void test('ambiguous schema-library paths point to their shared owner instead of the wrong property', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const rule: Constraint = {
    id: 'ambiguousRule001',
    name: 'Length',
    language: 'json-schema',
    expression: { properties: { 'a/b': { minLength: 3 } } },
  };
  const metadata: DataType = model.createDataType({ name: 'Metadata', baseType: DataTypes.Object, constraints: [rule] }).element;
  const result: ValidationResult = model.validateValue(metadata, { 'a/b': 'Hi', a: { b: 'Hello' } });

  assert.equal(result.hasErrors, true);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.path, '/value');
  assert.equal(result.diagnostics[0]?.ref, rule.id);
});
