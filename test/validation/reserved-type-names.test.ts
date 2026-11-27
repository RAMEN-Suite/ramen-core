import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller, type DataType, type Diagnostic, type ModelFile, type Node } from '@ramen-suite/core/model';

void test('data types cannot reuse built-in names regardless of base type or case', (): void => {
  for (const name of Object.values(DataTypes)) {
    for (const spelling of [name, name.toLowerCase(), name.toUpperCase()]) {
      const model: Modeller = Modeller.create('Names');
      const type: DataType = model.createDataType({ name: spelling, baseType: DataTypes.Integer }).element;
      const finding: Diagnostic | undefined = model.validate().diagnostics[0];
      assert.equal(model.validate().valid, false, spelling);
      assert.equal(finding?.code, 'DATATYPE_NAME_RESERVED');
      assert.equal(finding?.ref, type.id);
      assert.equal(finding?.path, `/models/${model.getModel().id}/classifiers/0/name`);
    }
  }
});

void test('renaming to a reserved type name invalidates a model and renaming away restores it', (): void => {
  const model: Modeller = Modeller.create('Names');
  const type: DataType = model.createDataType({ name: 'Count', baseType: DataTypes.Integer }).element;
  model.updateDataType(type.id, { name: 'String' });
  assert.equal(model.validate().valid, false);
  model.updateDataType(type.id, { name: 'Count' });
  assert.equal(model.validate().valid, true);

  const file: ModelFile = model.export();
  const invalid: ModelFile = {
    ...file,
    classifiers: file.classifiers.map((item: ModelFile['classifiers'][number]): ModelFile['classifiers'][number] => ({
      ...item,
      name: 'String',
    })),
  };
  assert.throws((): Modeller => Modeller.import(invalid), /reserved for a built-in type/);
});

void test('built-in property types and non-reserved classifier names remain available', (): void => {
  const model: Modeller = Modeller.create('Names');
  const node: Node = model.createNode('String').element;
  model.createAttribute(node, { name: 'value', typeId: DataTypes.String });
  model.createDataType({ name: 'StringValue', baseType: DataTypes.String });
  assert.equal(model.validate().valid, true);
});
