import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller, type DataType, type Diagnostic } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

void test('node and data type case differences warn without invalidating RMF models', (): void => {
  for (const dataType of [false, true]) {
    const model: Modeller = Modeller.create('Names');
    if (dataType) {
      model.createDataType({ name: 'Status', baseType: DataTypes.String });
      model.createDataType({ name: 'status', baseType: DataTypes.Integer });
    } else {
      model.createNode('Status');
      model.createNode('status');
    }
    const findings: readonly Diagnostic[] = model.validate().diagnostics;
    assert.equal(model.validate().valid, true);
    assert.equal(model.validate().hasErrors, false);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.code, 'CLASSIFIER_NAME_CASE_CONFLICT');
    assert.equal(findings[0]?.severity, 'warn');
    assert.equal(findings[0]?.path, `/models/${model.getModel().id}/classifiers/1/name`);
    assert.deepEqual(Modeller.import(model.export()).validate().diagnostics, findings);
  }
});

void test('case warnings span classifier kinds and disappear after renaming', (): void => {
  const model: Modeller = Modeller.create('Names');
  model.createNode('Ähre');
  const type: DataType = model.createDataType({ name: 'ähre', baseType: DataTypes.String }).element;
  assert.equal(model.validate().diagnostics[0]?.code, 'CLASSIFIER_NAME_CASE_CONFLICT');
  model.updateDataType(type.id, { name: 'Grain' });
  assert.deepEqual(model.validate().diagnostics, []);
});

void test('case variants in separate model namespaces do not warn', (): void => {
  const base: Modeller = Modeller.create('Base');
  base.createDataType({ name: 'Status', baseType: DataTypes.String });
  const next: Modeller = base.createNextLevel('Next');
  next.createDataType({ name: 'status', baseType: DataTypes.Integer });
  assert.deepEqual(next.validate().diagnostics, []);
});

void test('annotation-only classifier case warnings do not block RAMEN export or import', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  model.createDataType({ name: 'ANNOTATION', baseType: DataTypes.String });
  model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' });
  assert.equal(model.validate().valid, true);
  assert.equal(model.validate().hasErrors, false);
  assert.equal(model.validate().diagnostics.length, 1);
  assert.equal(model.validate().diagnostics[0]?.code, 'CLASSIFIER_NAME_CASE_CONFLICT');
  assert.equal(RamenModel.import(model.export()).validate().valid, true);
});
