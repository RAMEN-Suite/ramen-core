import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller, type Diagnostic } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel } from '@ramen-suite/core/ramen';

void test('nodes and data types share one name scope regardless of declaration order', (): void => {
  for (const typeFirst of [false, true]) {
    const model: Modeller = Modeller.create('Names');
    if (typeFirst) model.createDataType({ name: 'Status', baseType: DataTypes.String });
    model.createNode('Status');
    if (!typeFirst) model.createDataType({ name: 'Status', baseType: DataTypes.String });
    const finding: Diagnostic | undefined = model.validate().diagnostics[0];
    assert.equal(model.validate().valid, false);
    assert.equal(finding?.code, 'CLASSIFIER_NAME_DUPLICATE');
    assert.equal(finding?.path, `/models/${model.getModel().id}/classifiers/1/name`);
  }
});

void test('annotation node uses conflict with same-named local data types', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  model.createDataType({ name: 'Annotation', baseType: DataTypes.String });
  assert.equal(model.validate().valid, true);
  model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' });
  assert.equal(model.validate().valid, false);
  assert.ok(model.validate().diagnostics.some((finding: Diagnostic): boolean => finding.code === 'CLASSIFIER_NAME_DUPLICATE'));
});
