import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  ModelFactory,
  ModelSchemaValidator,
  ModelValidator,
  type Classifier,
  type DataType,
  type Diagnostic,
  type Model,
  type ModelFile,
  type Node,
  type ModelChange,
  type ProjectValidationResult,
} from '@ramen-suite/core/model';
import { RamenModel, RamenValidator, RAMEN_MODEL } from '@ramen-suite/core/ramen';

void test('invalid names produce field diagnostics in RMF and RAMEN instead of schema union errors', (): void => {
  for (const ramen of [false, true]) {
    const model: Modeller | RamenModel = ramen ? RamenModel.create('Edition') : Modeller.create('Names');
    const created: ModelChange<DataType> = model.createDataType({ name: 'my status!', baseType: DataTypes.String });
    const findings: readonly Diagnostic[] = created.validation.diagnostics;
    assert.equal(created.validation.valid, false);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.code, 'CLASSIFIER_NAME_INVALID');
    assert.equal(findings[0]?.ref, created.element.id);
    assert.match(findings[0]?.path ?? '', /\/classifiers\/0\/name$/u);
    assert.match(findings[0]?.message ?? '', /start with a letter/u);
  }
});

void test('editing stores classifier names in NFC and retains combining marks that do not compose', (): void => {
  const model: Modeller = Modeller.create('Names');
  const node: Node = model.createNode('e\u0301tat').element;
  const type: DataType = model.createDataType({ name: 'Cre\u0301dit', baseType: DataTypes.String }).element;
  assert.equal(node.name, 'état');
  assert.equal(type.name, 'Crédit');
  assert.equal(model.getNode(node.id)?.name, 'état');
  assert.equal(model.getDataType(type.id)?.name, 'Crédit');

  assert.equal(model.updateNode(node.id, { name: 'Re\u0301cit' }).element.name, 'Récit');
  assert.equal(model.updateDataType(type.id, { name: 'De\u0301lai' }).element.name, 'Délai');
  model.createNode('q\u0301Type');
  model.createNode('किताब');
  assert.equal(model.validate().valid, true);
});

void test('canonical equivalents in loaded models conflict without rewriting input values', (): void => {
  const model: Modeller = Modeller.create('Names');
  model.createNode('état');
  const second: Node = model.createNode('Other').element;
  const raw: Model = model.getModel();
  const input: Model = {
    ...raw,
    classifiers: raw.classifiers.map((item: Classifier): Classifier =>
      item.id === second.id ? { ...item, name: 'e\u0301tat' } : item,
    ),
  };
  const before: string = JSON.stringify(input);
  const result: ProjectValidationResult = new ModelValidator().validateProject(input.id, [input]);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.code, 'NODE_NAME_DUPLICATE');
  assert.equal(JSON.stringify(input), before);
});

void test('case and compatibility warnings detect sharp s, ligatures and full-width letters without changing spelling', (): void => {
  for (const [first, second] of [
    ['Straße', 'STRASSE'],
    ['ﬁle', 'file'],
    ['Ａrt', 'Art'],
  ]) {
    assert.ok(first && second);
    const model: Modeller = Modeller.create('Names');
    model.createNode(first);
    model.createNode(second);
    assert.equal(model.validate().valid, true);
    assert.equal(model.validate().diagnostics[0]?.code, 'CLASSIFIER_NAME_CASE_CONFLICT');
    assert.equal(model.validate().diagnostics[0]?.severity, 'warn');
    assert.deepEqual(
      model.getModel().classifiers.map((item: Classifier): string => item.name),
      [first, second],
    );
  }
});

void test('schemas enforce string bounds while Core checks Unicode identifier syntax', (): void => {
  const model: Modeller = Modeller.create('Names');
  const accepted: Node = model.createNode('𐐀'.repeat(40)).element;
  assert.equal(ModelSchemaValidator.isValid(model.getModel()), true);
  assert.equal(model.validate().valid, true);
  model.updateNode(accepted.id, { name: '𐐀'.repeat(41) });
  assert.equal(ModelSchemaValidator.isValid(model.getModel()), false);
  assert.equal(model.validate().diagnostics[0]?.code, 'CLASSIFIER_NAME_INVALID');

  model.updateNode(accepted.id, { name: 'my status!' });
  assert.equal(ModelSchemaValidator.isValid(model.getModel()), true);
  assert.equal(model.validate().diagnostics[0]?.code, 'CLASSIFIER_NAME_INVALID');
});

void test('standalone duplication leaves collision detection to project validation', (): void => {
  const model: Modeller = Modeller.create('Names');
  const original: Node = model.createNode('File').element;
  const first: Node = ModelFactory.duplicateNode(original);
  const second: Node = ModelFactory.duplicateNode(original);
  assert.equal(first.name, 'FileCopy');
  assert.equal(second.name, first.name);
  const raw: Model = model.getModel();
  const input: Model = { ...raw, classifiers: [...raw.classifiers, first, second] };
  const result: ProjectValidationResult = new ModelValidator().validateProject(input.id, [input]);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.code, 'NODE_NAME_DUPLICATE');
});

void test('targeted name findings preserve unrelated schema errors in RMF and RAMEN', (): void => {
  for (const ramen of [false, true]) {
    const model: Modeller | RamenModel = ramen ? RamenModel.create('Edition') : Modeller.create('Names');
    model.createDataType({ name: 'my status!', baseType: DataTypes.String });
    const input: Model = { ...model.getModel(), version: 'invalid' };
    const result: ProjectValidationResult = ramen
      ? new RamenValidator().validateProject(input.id, [RAMEN_MODEL, input])
      : new ModelValidator().validateProject(input.id, [input]);
    assert.equal(result.valid, false);
    assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'CLASSIFIER_NAME_INVALID'));
    assert.ok(
      result.diagnostics.some(
        (item: Diagnostic): boolean => item.code === 'SCHEMA_INVALID' && item.path?.endsWith('/version') === true,
      ),
    );
    assert.equal(
      result.diagnostics.some((item: Diagnostic): boolean => item.path?.endsWith('/classifiers/0') === true),
      false,
    );
  }
});

void test('invalid classifier names do not hide a broken base type in RMF or RAMEN', (): void => {
  for (const ramen of [false, true]) {
    const model: Modeller | RamenModel = ramen ? RamenModel.create('Edition') : Modeller.create('Names');
    model.createDataType({ name: 'Status', baseType: DataTypes.String });
    const raw: Model = model.getModel();
    for (const name of ['bad name', 'x'.repeat(41), null]) {
      const input: unknown = {
        ...raw,
        classifiers: raw.classifiers.map((item: Classifier): unknown => ({ ...item, name, baseType: 'Foo' })),
      };
      const before: string = JSON.stringify(input);
      const result: ProjectValidationResult = ramen
        ? new RamenValidator().validateProject(raw.id, [RAMEN_MODEL, input])
        : new ModelValidator().validateProject(raw.id, [input]);
      assert.equal(result.valid, false);
      assert.equal(JSON.stringify(input), before);
      assert.ok(
        result.diagnostics.some(
          (item: Diagnostic): boolean =>
            item.code === 'CLASSIFIER_NAME_INVALID' && item.path?.endsWith('/classifiers/0/name') === true,
        ),
      );
      assert.ok(
        result.diagnostics.some(
          (item: Diagnostic): boolean => item.code === 'SCHEMA_INVALID' && item.path?.endsWith('/classifiers/0') === true,
        ),
      );
    }
  }
});

void test('name-only structural failures are replaced without duplicate union diagnostics', (): void => {
  const model: Modeller = Modeller.create('Names');
  model.createDataType({ name: 'Status', baseType: DataTypes.String });
  const raw: Model = model.getModel();
  for (const name of ['', 'x'.repeat(41), null]) {
    const input: unknown = { ...raw, classifiers: raw.classifiers.map((item: Classifier): unknown => ({ ...item, name })) };
    const result: ProjectValidationResult = new ModelValidator().validateProject(raw.id, [input]);
    assert.equal(result.valid, false);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CLASSIFIER_NAME_INVALID');
    assert.equal(result.diagnostics[0]?.path, '/models/0/classifiers/0/name');
  }
});

void test('import and export preserve decomposed names without changing their stored spelling', (): void => {
  const model: Modeller = Modeller.create('Names');
  const type: DataType = model.createDataType({ name: 'état', baseType: DataTypes.String }).element;
  const file: ModelFile = model.export();
  const decomposed: ModelFile = {
    ...file,
    classifiers: file.classifiers.map((item: ModelFile['classifiers'][number]): ModelFile['classifiers'][number] => ({
      ...item,
      name: 'e\u0301tat',
    })),
  };
  const restored: Modeller = Modeller.import(decomposed);
  assert.equal(restored.getDataType(type.id)?.name, 'e\u0301tat');
  assert.equal(restored.export().classifiers[0]?.name, 'e\u0301tat');
  assert.equal(restored.validate().valid, true);
});

void test('combining mark limits apply to editing and loaded RMF and RAMEN models', (): void => {
  for (const ramen of [false, true]) {
    const model: Modeller | RamenModel = ramen ? RamenModel.create('Edition') : Modeller.create('Names');
    const type: DataType = model.createDataType({ name: 'A\u0301\u0301\u0301', baseType: DataTypes.String }).element;
    assert.equal(model.validate().valid, true);
    const raw: Model = model.getModel();
    const input: Model = {
      ...raw,
      classifiers: raw.classifiers.map((item: Classifier): Classifier => ({ ...item, name: 'A\u0301\u0301\u0301\u0301' })),
    };
    const result: ProjectValidationResult = ramen
      ? new RamenValidator().validateProject(raw.id, [RAMEN_MODEL, input])
      : new ModelValidator().validateProject(raw.id, [input]);
    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.code, 'CLASSIFIER_NAME_INVALID');
    assert.match(result.diagnostics[0]?.message ?? '', /at most two consecutive combining marks/u);

    model.updateDataType(type.id, { name: 'A\u0301\u0301\u0301\u0301' });
    assert.equal(model.validate().valid, false);
    model.updateDataType(type.id, { name: 'A\u0301\u0301\u0301' });
    assert.equal(model.validate().valid, true);
  }
});
