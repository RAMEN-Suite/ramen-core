import assert from 'node:assert/strict';
import test from 'node:test';
import { Modeller, ModelValidator } from '../../dist/ramen-core/model/index.js';
import type { DataType, Diagnostic, Literal, Model, Node, ProjectValidationResult } from '../../dist/ramen-core/model/index.js';
import { model } from '../models.ts';

function accepts(project: Modeller, owner: Node, value: unknown): boolean {
  const data: unknown = {
    modelId: project.getModel().id,
    nodes: [{ id: 'enumRecord000001', typeId: owner.id, properties: { status: value } }],
    relations: [],
  };
  return !project.validateInstances(data).hasErrors;
}

void test('string enums use exact stored values and only fall back to names when no literal is provided', (): void => {
  const project: Modeller = Modeller.create('Documents');
  const owner: Node = project.createNode('Document').element;
  const status: DataType = project.createDataType({ name: 'Status', baseType: 'String' }).element;
  project.createLiteral(status.id, { name: 'Open', literal: 'open' });
  project.createLiteral(status.id, { name: 'closed' });
  project.createLiteral(status.id, { name: 'Empty', literal: '' });
  project.createLiteral(status.id, { name: 'Spaced', literal: ' open ' });
  project.createAttribute(owner, { name: 'status', typeId: status });
  assert.equal(project.validate().valid, true);

  for (const value of ['open', 'closed', '', ' open ']) assert.equal(accepts(project, owner, value), true, value);
  for (const value of ['Open', 'Empty', 'Spaced', 'other', 1, true]) {
    assert.equal(accepts(project, owner, value), false, String(value));
  }
  const restored: Modeller = Modeller.import(project.export());
  assert.equal(accepts(restored, owner, 'open'), true);
  assert.equal(accepts(restored, owner, 'Open'), false);
});

void test('numeric enums require explicit numbers and reject display names or undeclared numbers', (): void => {
  const project: Modeller = Modeller.create('Documents');
  const owner: Node = project.createNode('Document').element;
  const status: DataType = project.createDataType({ name: 'Status', baseType: 'Integer' }).element;
  project.createLiteral(status.id, { name: 'Open', value: 0 });
  project.createLiteral(status.id, { name: 'Closed', value: 1 });
  project.createAttribute(owner, { name: 'status', typeId: status });
  assert.equal(project.validate().valid, true);

  for (const value of [0, 1]) assert.equal(accepts(project, owner, value), true);
  for (const value of [2, 0.5, '0', 'Open']) assert.equal(accepts(project, owner, value), false);
  const restored: Modeller = Modeller.import(project.export());
  assert.equal(accepts(restored, owner, 0), true);
});

void test('model validation rejects empty enums and literal definitions without a usable value', (): void => {
  const owner: Model = model('enumModel0000001');
  const literal: Literal = { id: 'enumLiteral00001', name: 'Enabled' };
  const datatype: DataType = { kind: 'DataType', id: 'enumDatatype0001', name: 'Flag', baseType: 'Boolean' };
  owner.classifiers.push(datatype);
  const validator: ModelValidator = new ModelValidator();
  assert.equal(validator.validateProject(owner.id, [owner]).valid, true);

  const malformed: unknown = { ...owner, classifiers: [{ ...datatype, literals: [] }] };
  const empty: ProjectValidationResult = validator.validateProject(owner.id, [malformed]);
  assert.equal(empty.valid, false);
  assert.equal(empty.diagnostics[0]?.code, 'SCHEMA_INVALID');
  datatype.literals = [literal];
  for (const baseType of ['Boolean', 'Integer', 'Float'] as const) {
    datatype.baseType = baseType;
    const result: ProjectValidationResult = validator.validateProject(owner.id, [owner]);
    const diagnostic: Diagnostic | undefined = result.diagnostics[0];
    assert.equal(result.valid, false);
    assert.equal(diagnostic?.code, 'DATATYPE_LITERAL_TYPE_INVALID');
    assert.equal(diagnostic?.path, `/models/${owner.id}/classifiers/0/literals/0`);
  }
});

void test('enum uniqueness compares exact stored strings including empty values', (): void => {
  const project: Modeller = Modeller.create('Documents');
  const status: DataType = project.createDataType({ name: 'Status', baseType: 'String' }).element;
  project.createLiteral(status.id, { name: 'Empty', literal: '' });
  const result: ProjectValidationResult = project.createLiteral(status.id, { name: 'AlsoEmpty', literal: '' }).validation;
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'DATATYPE_LITERAL_SERIALIZED_DUPLICATE'));
});
