import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RAMEN_ELEMENT,
  RamenModel,
  type AnnotationShape,
  type RamenModelDocument,
  type RamenEvolutionReport,
  type Diagnostic,
} from '@ramen-suite/core';

void test('malformed annotation sections reject edits without losing any declarations', (): void => {
  const original: RamenModel = RamenModel.create('Edition');
  const comment: AnnotationShape = original.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' }).element;
  const gloss: AnnotationShape = original.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'gloss' }).element;
  const document: RamenModelDocument = original.getModel();
  Reflect.deleteProperty(document.annotations[1] ?? {}, 'relations');

  const model: RamenModel = RamenModel.load(document);
  const before: RamenModelDocument = model.getModel();
  assert.equal(model.validate().valid, false);
  assert.throws((): unknown => model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'footnote' }));
  assert.throws((): unknown => model.updateAnnotationShape(comment.id, { type: 'note' }));
  assert.throws((): unknown => model.removeAnnotationShape(gloss.id));
  assert.deepEqual(model.getModel(), before);
});

void test('annotation tool metadata is detached, preserved in exchange and explicitly replaceable', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const ext: Record<string, unknown> = { 'org.example.editor': { widget: 'textarea', rows: 4 } };
  const note: AnnotationShape = model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'note', ext }).element;
  const before: RamenModel = model.snapshot();
  ext['org.example.editor'] = 'changed';

  model.updateAnnotationShape(note.id, { description: 'Editorial note' });
  const restored: RamenModel = RamenModel.import(model.export());
  assert.deepEqual(restored.getAnnotationShapes()[0]?.ext, note.ext);
  assert.deepEqual(before.getAnnotationShapes()[0]?.ext, note.ext);
  assert.notDeepEqual(note.ext, ext);

  model.updateAnnotationShape(note.id, { ext: { 'org.example.editor': { widget: 'input' } } });
  assert.notDeepEqual(model.getAnnotationShapes()[0]?.ext, note.ext);
  model.updateAnnotationShape(note.id, { ext: undefined });
  assert.equal(model.getAnnotationShapes()[0]?.ext, undefined);
  assert.deepEqual(before.getAnnotationShapes()[0]?.ext, note.ext);
});

void test('annotation metadata rejects non-object values before changing the model', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const note: AnnotationShape = model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'note' }).element;
  const before: RamenModelDocument = model.getModel();
  const input: Record<string, unknown> = { ext: [] };
  assert.throws((): unknown => model.updateAnnotationShape(note.id, input));
  assert.deepEqual(model.getModel(), before);

  const shapes: readonly AnnotationShape[] = model.getAnnotationShapes();
  Reflect.set(shapes[0] ?? {}, 'type', 'changed');
  assert.equal(model.getAnnotationShapes()[0]?.type, 'note');
});

void test('comparison retains malformed annotation diagnostics in both directions without changing either state', (): void => {
  const valid: RamenModel = RamenModel.create('Edition');
  valid.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' });
  valid.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'gloss' });
  const document: RamenModelDocument = valid.getModel();
  Reflect.deleteProperty(document.annotations[1] ?? {}, 'relations');

  const invalid: RamenModel = RamenModel.load(document);
  const validBefore: RamenModelDocument = valid.getModel();
  const invalidBefore: RamenModelDocument = invalid.getModel();
  const forward: RamenEvolutionReport = valid.compareTo(invalid);
  const backward: RamenEvolutionReport = invalid.compareTo(valid);

  assert.deepEqual(forward.annotationChanges, []);
  assert.deepEqual(backward.annotationChanges, []);
  assert.deepEqual(forward.beforeDiagnostics, []);
  assert.deepEqual(backward.afterDiagnostics, []);
  assert.deepEqual(forward.afterDiagnostics, backward.beforeDiagnostics);
  assert.ok(forward.afterDiagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATIONS_INVALID'));
  assert.deepEqual(valid.getModel(), validBefore);
  assert.deepEqual(invalid.getModel(), invalidBefore);
});

void test('comparison keeps changes to valid shapes beside an invalid shape', (): void => {
  const before: RamenModel = RamenModel.create('Edition');
  const comment: AnnotationShape = before.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' }).element;
  before.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'gloss' });
  const next: RamenModel = before.snapshot();
  next.updateAnnotationShape(comment.id, { description: 'Updated comment' });
  const document: RamenModelDocument = next.getModel();
  Reflect.deleteProperty(document.annotations[1] ?? {}, 'relations');

  const invalid: RamenModel = RamenModel.load(document);
  const forward: RamenEvolutionReport = before.compareTo(invalid);
  const backward: RamenEvolutionReport = invalid.compareTo(before);
  assert.equal(forward.annotationChanges.length, 1);
  assert.equal(forward.annotationChanges[0]?.annotationId, comment.id);
  assert.equal(forward.annotationChanges[0]?.action, 'changed');
  assert.equal(backward.annotationChanges.length, 1);
  assert.equal(backward.annotationChanges[0]?.annotationId, comment.id);
  assert.equal(backward.annotationChanges[0]?.action, 'changed');
});

void test('comparison suspends annotation changes for an unidentifiable or ambiguous shape', (): void => {
  const before: RamenModel = RamenModel.create('Edition');
  const comment: AnnotationShape = before.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' }).element;
  before.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'gloss' });

  for (const id of [undefined, comment.id]) {
    const document: RamenModelDocument = before.getModel();
    Reflect.set(document.annotations[1] ?? {}, 'id', id);
    const invalid: RamenModel = RamenModel.load(document);
    assert.deepEqual(before.compareTo(invalid).annotationChanges, []);
    assert.deepEqual(invalid.compareTo(before).annotationChanges, []);
  }
});
