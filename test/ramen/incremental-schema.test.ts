import assert from 'node:assert/strict';
import test, { type Mock, type TestContext } from 'node:test';
import type { SchemaNode } from 'json-schema-library';
import {
  DataTypes,
  RAMEN_ELEMENT,
  RamenModel,
  RamenValidator,
  RamenProjectSchemaValidator,
  type AnnotationShape,
  type DataType,
  type Node,
  type ProjectValidationResult,
} from '@ramen-suite/core';

function equivalent(model: RamenModel, result: ProjectValidationResult = model.validate()): void {
  const full: ProjectValidationResult = new RamenValidator().validateProject(model.getModel().id, model.getModels());
  assert.equal(result.valid, full.valid);
  assert.deepEqual(result.diagnostics, full.diagnostics);
}

void test('RAMEN edits recheck changed annotation shapes without revalidating the whole document', (context: TestContext): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const comment: AnnotationShape = model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' }).element;
  const gloss: AnnotationShape = model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'gloss' }).element;
  const schema: SchemaNode = RamenProjectSchemaValidator.getSchemaNode();
  const items: SchemaNode | undefined = schema.properties?.['annotations']?.items;
  assert.ok(items);
  const whole: Mock<SchemaNode['validate']> = context.mock.method(schema, 'validate');
  const item: Mock<SchemaNode['validate']> = context.mock.method(items, 'validate');

  const changed: ProjectValidationResult = model.updateAnnotationShape(comment.id, {
    properties: [{ name: 'note', typeId: DataTypes.String }],
  }).validation;
  assert.equal(changed.valid, true);
  assert.equal(whole.mock.calls.length, 0);
  assert.equal(item.mock.calls.length, 1);
  assert.deepEqual(
    model.getAnnotationShapes().map((shape: AnnotationShape): string => shape.id),
    [comment.id, gloss.id],
  );
  equivalent(model, changed);
});

void test('cached RAMEN documents still check annotation references and recover after repair', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const type: DataType = model.createDataType({ name: 'NoteText', baseType: DataTypes.String }).element;
  const comment: AnnotationShape = model.createAnnotationShape({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
    properties: [{ name: 'note', typeId: type.id }],
  }).element;
  const invalid: ProjectValidationResult = model.removeDataType(type.id).validation;
  assert.equal(invalid.valid, false);
  equivalent(model, invalid);

  assert.equal(model.updateAnnotationShape(comment.id, { properties: [] }).validation.valid, true);
  equivalent(model);
});

void test('edited RAMEN nodes retain full validation of inherited rules and annotation declarations', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const letter: Node = model.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const comment: AnnotationShape = model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' }).element;
  const invalid: ProjectValidationResult = model.updateNode(letter.id, { superTypes: ['missingNode00001'] }).validation;
  assert.equal(invalid.valid, false);
  equivalent(model, invalid);

  assert.equal(model.updateNode(letter.id, { superTypes: letter.superTypes }).validation.valid, true);
  model.removeAnnotationShape(comment.id);
  equivalent(model);
});
