import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  VALIDATION_ERROR,
  type Attribute,
  type DataType,
  type Diagnostic,
  type ModelFile,
  type Node,
} from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel, type AnnotationShape } from '@ramen-suite/core/ramen';

void test('data type names are unique within one model and rechecked after renaming', (): void => {
  const model: Modeller = Modeller.create('Names');
  model.createDataType({ name: 'Status', baseType: DataTypes.String });
  const duplicate: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.Integer }).element;
  const findings: readonly Diagnostic[] = model.validate().diagnostics;
  assert.equal(model.validate().valid, false);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.code, VALIDATION_ERROR.DATATYPE_NAME_DUPLICATE);
  assert.equal(findings[0]?.ref, duplicate.id);
  assert.equal(findings[0]?.path, `/models/${model.getModel().id}/classifiers/1/name`);
  model.updateDataType(duplicate.id, { name: 'Rank' });
  assert.equal(model.validate().valid, true);
  model.updateDataType(duplicate.id, { name: 'Status' });
  assert.equal(model.validate().valid, false);
});

void test('same data type names are allowed in separate models and across classifier kinds', (): void => {
  const base: Modeller = Modeller.create('Base');
  base.createNode('Status');
  base.createDataType({ name: 'Status', baseType: DataTypes.String });
  const next: Modeller = base.createNextLevel('Next');
  next.createDataType({ name: 'Status', baseType: DataTypes.Integer });
  assert.equal(next.validate().valid, true);
  assert.equal(Modeller.import(next.export()).validate().valid, true);
});

void test('repeated imported type uses are allowed until a distinct same-named type is introduced', (): void => {
  const base: Modeller = Modeller.create('Base');
  const document: Node = base.createNode('Document').element;
  const status: DataType = base.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const next: Modeller = base.createNextLevel('Next');
  const letter: Node = next.createNode({ name: 'Letter', refines: document }).element;
  next.createAttribute(letter, { name: 'first', type: status });
  const second: Attribute = next.createAttribute(letter, { name: 'second', type: status }).element;
  assert.equal(next.validate().valid, true);
  const local: DataType = next.createDataType({ name: 'Status', baseType: DataTypes.Integer }).element;
  const findings: readonly Diagnostic[] = next.validate().diagnostics;
  assert.equal(findings.length, 2);
  assert.ok(findings.every((item: Diagnostic): boolean => item.code === 'DATATYPE_NAME_DUPLICATE'));
  assert.equal(findings[1]?.ref, second.id);
  assert.equal(findings[1]?.path, `/models/${next.getModel().id}/classifiers/0/attributes/1/typeId`);
  next.updateDataType(local.id, { name: 'Rank' });
  assert.equal(next.validate().valid, true);
});

void test('import rejects duplicate data type names', (): void => {
  const model: Modeller = Modeller.create('Names');
  model.createDataType({ name: 'Status', baseType: DataTypes.String });
  const rank: DataType = model.createDataType({ name: 'Rank', baseType: DataTypes.Integer }).element;
  const file: ModelFile = model.export();
  const duplicate: ModelFile = {
    ...file,
    classifiers: file.classifiers.map((item: ModelFile['classifiers'][number]): ModelFile['classifiers'][number] =>
      item.id === rank.id ? { ...item, name: 'Status' } : item,
    ),
  };
  assert.throws((): Modeller => Modeller.import(duplicate), /Data type name 'Status' refers to different data types/);
});

void test('annotation property type uses share the model-level data type name scope', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  model.createDataType({ name: 'UUID', baseType: DataTypes.String });
  assert.equal(model.validate().valid, true);
  const shape: AnnotationShape = model.createAnnotationShape({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
    properties: [{ name: 'reference', typeId: RAMEN_ELEMENT.UUID }],
  }).element;
  const finding: Diagnostic | undefined = model
    .validate()
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'DATATYPE_NAME_DUPLICATE');
  assert.equal(model.validate().valid, false);
  assert.equal(finding?.path, `/models/${model.getModel().id}/annotations/${shape.id}/properties/0/typeId`);
});
