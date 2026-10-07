import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '@ramen-suite/core/ramen';
import type { Node } from '@ramen-suite/core/model';
import type { RamenAnnotation, RamenFile } from '@ramen-suite/core/ramen';

void test('RAMEN import rejects property ID collisions introduced in an otherwise valid file', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  model.createAnnotation({ node, type: 'note', properties: [{ name: 'value', typeId: DataTypes.String }] });
  const file: RamenFile = model.export();
  const tampered: RamenFile = {
    ...file,
    annotations: file.annotations.map((annotation: RamenFile['annotations'][number]): RamenFile['annotations'][number] => ({
      ...annotation,
      properties: [{ id: node.id, name: 'value', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
    })),
  };

  assert.throws((): RamenModel => RamenModel.import(tampered), /Duplicate element id/);
  assert.equal(RamenModel.import(file).validate().valid, true);
});

void test('RAMEN import rejects annotation owners that are absent or use the generic format', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  model.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'note' });
  const file: RamenFile = model.export();
  const invalidOwners: readonly string[] = ['missingOwner0001', RAMEN_MODEL.id];

  for (const modelId of invalidOwners) {
    const tampered: RamenFile = {
      ...file,
      annotations: file.annotations.map((annotation: RamenFile['annotations'][number]): RamenFile['annotations'][number] => ({
        ...annotation,
        modelId,
      })),
    };
    assert.throws((): RamenModel => RamenModel.import(tampered), /Invalid annotation owner/);
  }
});

void test('equal local property IDs in different model levels remain distinct during exchange', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const first: RamenAnnotation = model.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    properties: [{ id: 'sharedProperty01', name: 'value', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
  }).element;
  const next: RamenModel = model.createNextLevel('Research');
  const second: RamenAnnotation = next.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
    properties: [{ id: 'sharedProperty01', name: 'value', typeId: DataTypes.Integer, bounds: { lowerBound: 0, upperBound: 1 } }],
  }).element;
  const file: RamenFile = next.export();
  const restored: RamenModel = RamenModel.import(file);

  assert.equal(restored.validate().valid, true);
  assert.equal(
    file.annotations.find((item: RamenFile['annotations'][number]): boolean => item.id === first.id)?.modelId,
    model.getModel().id,
  );
  assert.equal(
    file.annotations.find((item: RamenFile['annotations'][number]): boolean => item.id === second.id)?.modelId,
    next.getModel().id,
  );
  assert.equal(restored.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'note', 'value', 'text').hasErrors, false);
  assert.equal(restored.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'comment', 'value', 7).hasErrors, false);
  assert.equal(restored.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'comment', 'value', 'text').hasErrors, true);
  assert.deepEqual(restored.export(), file);
});
