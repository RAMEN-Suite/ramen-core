import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  ModelFactory,
  ModelNames,
  ModelValidator,
  type Classifier,
  type DataType,
  type Diagnostic,
  type Model,
  type ModelFile,
  type Node,
} from '@ramen-suite/core/model';

function named(name: string, dataType: boolean): Modeller {
  const model: Modeller = Modeller.create('Names');
  if (dataType) model.createDataType({ name, baseType: DataTypes.String });
  else model.createNode(name);
  return model;
}

void test('classifier schemas accept Unicode identifier names without enforcing capitalisation', (): void => {
  for (const dataType of [false, true]) {
    for (const name of ['Status', 'status', 'Status2', 'Status_Value', 'Édition', '𐐀Type']) {
      const model: Modeller = named(name, dataType);
      assert.equal(model.validate().valid, true, name);
      assert.equal(Modeller.import(model.export()).validate().valid, true);
    }
  }
});

void test('classifier schemas reject spaces, punctuation, invalid starts and trailing line breaks', (): void => {
  const invalid: readonly string[] = [
    '',
    'my status!',
    'Two Words',
    '123Type',
    '_Status',
    'Type-Name',
    'Type/Name',
    'Type\n',
    'Type\r',
    'Type\u2028',
    'Type😀',
  ];
  for (const dataType of [false, true]) {
    for (const name of invalid) {
      const model: Modeller = named(name, dataType);
      const findings: readonly Diagnostic[] = model.validate().diagnostics;
      assert.equal(model.validate().valid, false, JSON.stringify(name));
      assert.ok(
        findings.some((item: Diagnostic): boolean => item.code === 'SCHEMA_INVALID' && item.path === '/models/0/classifiers/0'),
      );
    }
  }
});

void test('import rejects classifier labels that are not identifiers', (): void => {
  const model: Modeller = named('Status', true);
  const file: ModelFile = model.export();
  const invalid: ModelFile = {
    ...file,
    classifiers: file.classifiers.map((item: ModelFile['classifiers'][number]): ModelFile['classifiers'][number] => ({
      ...item,
      name: 'my status!',
    })),
  };
  assert.throws((): Modeller => Modeller.import(invalid));
});

void test('conventional name helpers produce valid classifier names while literal labels remain free text', (): void => {
  const model: Modeller = Modeller.create('My project!');
  for (const input of ['my status!', 'Édition numérique', '123', '', '𐐨 name']) {
    model.createNode(ModelNames.toPascalName(input));
  }
  const status: DataType = model.createDataType({ name: 'State', baseType: DataTypes.String }).element;
  model.createLiteral(status.id, { name: 'Draft state!' });
  assert.equal(model.validate().valid, true);
});

void test('cloned node names retain a copy suffix within the helper limit, including supplementary letters', (): void => {
  const model: Modeller = named('𐐀'.repeat(40), false);
  const source: Model = model.getModel();
  const original: Node | undefined = source.classifiers.find((item: Classifier): item is Node => item.kind === 'Node');
  assert.ok(original);
  const copy: Node = ModelFactory.duplicateNode(original);
  assert.equal(Array.from(copy.name).length, 40);
  assert.equal(copy.name.endsWith('Copy'), true);
  const duplicated: Model = { ...source, classifiers: [...source.classifiers, copy] };
  assert.equal(new ModelValidator().validateProject(duplicated.id, [duplicated]).valid, true);
});

void test('connected clones avoid existing classifier names and repeated copies', (): void => {
  const model: Modeller = named('File', false);
  model.createDataType({ name: 'filecopy', baseType: DataTypes.String });
  const source: Model = model.getModel();
  const original: Node | undefined = source.classifiers.find((item: Classifier): item is Node => item.kind === 'Node');
  assert.ok(original);
  const first: Node = ModelFactory.duplicateConnectedNode(source, original.id).node;
  assert.equal(first.name, 'FileCopy2');
  const intermediate: Model = { ...source, classifiers: [...source.classifiers, first] };
  const second: Node = ModelFactory.duplicateConnectedNode(intermediate, original.id).node;
  assert.equal(second.name, 'FileCopy3');
  const duplicated: Model = { ...intermediate, classifiers: [...intermediate.classifiers, second] };
  assert.equal(new ModelValidator().validateProject(duplicated.id, [duplicated]).valid, true);
});
