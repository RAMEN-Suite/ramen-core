import assert from 'node:assert/strict';
import test, { type Mock, type TestContext } from 'node:test';
import type { SchemaNode } from 'json-schema-library';
import {
  DataTypes,
  Modeller,
  ModelSchemaValidator,
  ModelValidator,
  type Attribute,
  type DataType,
  type ModelChange,
  type Node,
  type ProjectValidationResult,
  type Relation,
  type UpdateDataTypeInput,
} from '@ramen-suite/core/model';

function equivalent(model: Modeller, result: ProjectValidationResult = model.validate()): void {
  const full: ProjectValidationResult = new ModelValidator().validateProject(model.getModel().id, model.getModels());
  assert.equal(result.valid, full.valid);
  assert.deepEqual(result.diagnostics, full.diagnostics);
}

function classifierSchema(): SchemaNode {
  const items: SchemaNode | undefined = ModelSchemaValidator.getSchemaNode().properties?.['classifiers']?.items;
  assert.ok(items);
  return items;
}

void test('editing checks only the changed classifier and keeps full schema checks at standalone boundaries', (context: TestContext): void => {
  const model: Modeller = Modeller.create('Edition');
  const letter: Node = model.createNode('Letter').element;
  const title: Attribute = model.createAttribute(letter, { name: 'title', typeId: DataTypes.String }).element;
  model.createNode('Person');
  assert.equal(model.validate().valid, true);
  const whole: Mock<SchemaNode['validate']> = context.mock.method(ModelSchemaValidator.getSchemaNode(), 'validate');
  const item: Mock<SchemaNode['validate']> = context.mock.method(classifierSchema(), 'validate');

  const changed: ModelChange<Attribute> = model.updateAttribute(letter.id, title.id, { name: 'heading' });
  assert.equal(changed.validation.valid, true);
  assert.equal(whole.mock.calls.length, 0);
  assert.equal(item.mock.calls.length, 1);
  equivalent(model, changed.validation);
  assert.equal(whole.mock.calls.length, 1);
});

void test('removing a declaration reuses unchanged classifiers even when their array positions change', (context: TestContext): void => {
  const model: Modeller = Modeller.create('Edition');
  const removed: Node = model.createNode('Temporary').element;
  model.createNode('Letter');
  model.createNode('Person');
  const item: Mock<SchemaNode['validate']> = context.mock.method(classifierSchema(), 'validate');
  const whole: Mock<SchemaNode['validate']> = context.mock.method(ModelSchemaValidator.getSchemaNode(), 'validate');

  assert.equal(model.removeNode(removed.id).validation.valid, true);
  assert.equal(item.mock.calls.length, 0);
  assert.equal(whole.mock.calls.length, 0);
  equivalent(model);
});

void test('malformed edits retain the complete diagnostics and recover after correction', (): void => {
  const model: Modeller = Modeller.create('Edition');
  const type: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const patch: UpdateDataTypeInput = { name: 'bad name' };
  Reflect.set(patch, 'baseType', 'Foo');
  const broken: ProjectValidationResult = model.updateDataType(type.id, patch).validation;
  assert.equal(broken.valid, false);
  assert.equal(broken.diagnostics.length, 2);
  equivalent(model, broken);

  const corrected: ProjectValidationResult = model.updateDataType(type.id, {
    name: 'Status',
    baseType: DataTypes.String,
  }).validation;
  assert.equal(corrected.valid, true);
  equivalent(model, corrected);
  const overlong: ProjectValidationResult = model.updateDataType(type.id, { name: 'x'.repeat(41) }).validation;
  assert.equal(overlong.valid, false);
  assert.equal(overlong.diagnostics.length, 1);
  equivalent(model, overlong);
});

void test('undefined and unknown fields are checked rather than compared through JSON serialisation', (context: TestContext): void => {
  const model: Modeller = Modeller.create('Edition');
  const type: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const before: string = JSON.stringify(model.getModel());
  const item: Mock<SchemaNode['validate']> = context.mock.method(classifierSchema(), 'validate');
  const patch: UpdateDataTypeInput = {};
  Reflect.set(patch, 'unexpected', undefined);
  const result: ProjectValidationResult = model.updateDataType(type.id, patch).validation;

  assert.equal(JSON.stringify(model.getModel()), before);
  assert.equal(item.mock.calls.length, 1);
  equivalent(model, result);

  Reflect.set(patch, 'unexpected', 'not allowed');
  const rejected: ProjectValidationResult = model.updateDataType(type.id, patch).validation;
  assert.equal(rejected.valid, false);
  equivalent(model, rejected);
});

void test('metadata and nested relation bounds are still structurally checked', (): void => {
  const model: Modeller = Modeller.create('Edition');
  const letter: Node = model.createNode('Letter').element;
  const folder: Node = model.createNode('Folder').element;
  const relation: Relation = model.createRelation({ name: 'FILED_IN', from: { node: letter }, to: { node: folder } }).element;
  const invalid: Relation['to'] = { ...relation.to };
  Reflect.set(invalid, 'bounds', { lowerBound: 'one', upperBound: 1 });

  const bounds: ProjectValidationResult = model.updateRelation(relation.id, { to: invalid }).validation;
  assert.equal(bounds.valid, false);
  equivalent(model, bounds);
  assert.equal(model.updateRelation(relation.id, { to: relation.to }).validation.valid, true);
  const header: ProjectValidationResult = model.updateModel({ version: 'not a version' }).validation;
  assert.equal(header.valid, false);
  equivalent(model, header);
});

void test('parent edits refresh semantic rules without rechecking unchanged child declarations', (context: TestContext): void => {
  const parent: Modeller = Modeller.create('Edition');
  const letter: Node = parent.createNode('Letter').element;
  const child: Modeller = parent.createNextLevel('Printed edition');
  const printed: Node = child.createNode({ name: 'PrintedLetter', refines: letter }).element;
  child.createAttribute(printed, { name: 'title', typeId: DataTypes.String });
  const snapshot: Modeller = child.snapshot();
  const item: Mock<SchemaNode['validate']> = context.mock.method(classifierSchema(), 'validate');
  const whole: Mock<SchemaNode['validate']> = context.mock.method(ModelSchemaValidator.getSchemaNode(), 'validate');

  parent.createAttribute(letter, { name: 'title', typeId: DataTypes.Integer });
  const changed: ProjectValidationResult = child.validate();
  assert.equal(changed.valid, false);
  assert.equal(item.mock.calls.length, 1);
  assert.equal(whole.mock.calls.length, 0);
  equivalent(child, changed);
  assert.equal(snapshot.validate().valid, true);
});

void test('model metadata updates propagate to imports without rechecking unchanged declarations', (context: TestContext): void => {
  const parent: Modeller = Modeller.create('Edition');
  const letter: Node = parent.createNode('Letter').element;
  const child: Modeller = parent.createNextLevel('Printed edition');
  child.createNode({ name: 'PrintedLetter', refines: letter });
  assert.equal(child.validate().valid, true);
  const whole: Mock<SchemaNode['validate']> = context.mock.method(ModelSchemaValidator.getSchemaNode(), 'validate');
  const item: Mock<SchemaNode['validate']> = context.mock.method(classifierSchema(), 'validate');

  assert.equal(parent.updateModel({ version: '2.0.0', name: 'Letters' }).validation.valid, true);
  assert.equal(child.validate().valid, true);
  assert.equal(child.getModel().imports[0]?.version, '2.0.0');
  assert.equal(whole.mock.calls.length, 0);
  assert.equal(item.mock.calls.length, 0);
  equivalent(child);
});
