import assert from 'node:assert/strict';
import test from 'node:test';
import { type Diagnostic, type Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel, type RamenAnnotation, type RamenFile } from '@ramen-suite/core/ramen';

void test('using Annotation alongside a same-named refinement is invalid in either creation order', (): void => {
  for (const baseFirst of [true, false]) {
    const model: RamenModel = RamenModel.create('Edition');
    if (baseFirst) model.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' });
    model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION });
    if (!baseFirst) model.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' });

    const annotation: RamenAnnotation | undefined = model.getAnnotations()[0];
    const finding: Diagnostic | undefined = model
      .validate()
      .diagnostics.find((item: Diagnostic): boolean => item.code === 'NODE_NAME_DUPLICATE');
    assert.ok(annotation);
    assert.equal(model.validate().valid, false);
    assert.equal(finding?.ref, annotation.id);
    assert.equal(finding?.severity, 'error');
    assert.equal(finding?.path, `/models/${model.getModel().id}/annotations/${annotation.id}/annotationId`);
  }
});

void test('Annotation and TextAnnotation can both be used on the current and following levels', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const text: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  model.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' });
  model.createAnnotation({ node: text, type: 'text' });
  assert.equal(model.validate().valid, true);

  const next: RamenModel = model.createNextLevel('Research');
  next.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'otherBase' });
  next.createAnnotation({ node: text, type: 'otherText' });
  assert.equal(next.validate().valid, true);
  assert.equal(RamenModel.import(next.export()).validate().valid, true);
});

void test('a following level may use either same-named node but cannot combine both', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const refined: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const next: RamenModel = model.createNextLevel('Research');
  const refinementUse: RamenAnnotation = next.createAnnotation({ node: refined, type: 'refined' }).element;
  assert.equal(next.validate().valid, true);
  const valid: RamenFile = next.export();
  const selected: RamenAnnotation = next.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' }).element;
  assert.equal(next.validate().valid, false);
  assert.throws(
    (): RamenModel =>
      RamenModel.import({ ...valid, annotations: [...valid.annotations, { ...selected, modelId: next.getModel().id }] }),
    /Node name 'Annotation'/,
  );
  next.removeAnnotation(refinementUse.id);
  assert.equal(next.validate().valid, true);
});
