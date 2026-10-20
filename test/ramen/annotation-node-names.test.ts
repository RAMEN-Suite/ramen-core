import assert from 'node:assert/strict';
import test from 'node:test';
import { type Diagnostic, type Node } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel, type AnnotationShape, type RamenFile } from '@ramen-suite/core/ramen';

void test('using Annotation alongside a same-named refinement is invalid in either creation order', (): void => {
  for (const baseFirst of [true, false]) {
    const model: RamenModel = RamenModel.create('Edition');
    if (baseFirst) model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' });
    model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION });
    if (!baseFirst) model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' });

    const annotation: AnnotationShape | undefined = model.getAnnotationShapes()[0];
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
  model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' });
  model.createAnnotationShape({ node: text, type: 'text' });
  assert.equal(model.validate().valid, true);

  const next: RamenModel = model.createNextLevel('Research');
  next.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'otherBase' });
  next.createAnnotationShape({ node: text, type: 'otherText' });
  assert.equal(next.validate().valid, true);
  assert.equal(RamenModel.import(next.export()).validate().valid, true);
});

void test('a following level may use either same-named node but cannot combine both', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const refined: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const next: RamenModel = model.createNextLevel('Research');
  const refinementUse: AnnotationShape = next.createAnnotationShape({ node: refined, type: 'refined' }).element;
  assert.equal(next.validate().valid, true);
  const valid: RamenFile = next.export();
  const selected: AnnotationShape = next.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'base' }).element;
  assert.equal(next.validate().valid, false);
  assert.throws(
    (): RamenModel =>
      RamenModel.import({ ...valid, annotations: [...valid.annotations, { ...selected, modelId: next.getModel().id }] }),
    /Node name 'Annotation'/,
  );
  next.removeAnnotationShape(refinementUse.id);
  assert.equal(next.validate().valid, true);
});
