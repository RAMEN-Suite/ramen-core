import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_ELEMENT, RamenModel, type AnnotationShape, type RamenModelDocument } from '@ramen-suite/core';

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
