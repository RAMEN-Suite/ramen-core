import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, type Constraint, type DataType, type Node, type Relation } from '@ramen-suite/core/model';
import {
  RAMEN_ELEMENT,
  RamenModel,
  type AnnotationSuggestion,
  type RamenAnnotation,
  type RamenFile,
} from '@ramen-suite/core/ramen';

interface Edition {
  readonly model: RamenModel;
  readonly text: Node;
  readonly image: Node;
  readonly imageLink: Relation;
  readonly note: RamenAnnotation;
  readonly label: DataType;
}

function createEdition(): Edition {
  const model: RamenModel = RamenModel.create('Edition');
  const text: Node = model.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const image: Node = model.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
  const textLink: Relation = model.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
  const imageLink: Relation = model.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
  const length: Constraint = {
    id: 'labelLength00001',
    name: 'Label length',
    language: 'json-schema',
    expression: { minLength: 2 },
  };
  const label: DataType = model.createDataType({ name: 'Label', baseType: DataTypes.String, constraints: [length] }).element;

  model.createLiteral(label.id, { name: 'Short', literal: 'short' });
  model.createLiteral(label.id, { name: 'Long', literal: 'long' });
  const note: RamenAnnotation = model.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    properties: [{ name: 'label', type: label }],
    relations: [{ relation: textLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element;

  return { model, text, image, imageLink, note, label };
}

function annotationTypes(model: RamenModel, node: Node): readonly string[] {
  return model.suggestAnnotationsForNode(node).map((item: AnnotationSuggestion): string => item.type);
}

function jsonContent(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

void test('base annotation edits refresh warmed sibling suggestions while a snapshot remains independent', (): void => {
  const edition: Edition = createEdition();
  const research: RamenModel = edition.model.createNextLevel('Research');
  const teaching: RamenModel = edition.model.createNextLevel('Teaching');

  for (const level of [research, teaching]) {
    level.hasAnnotation(edition.text, RAMEN_ELEMENT.ANNOTATION);
    level.hasAnnotation(edition.image, RAMEN_ELEMENT.ANNOTATION);
    assert.deepEqual(annotationTypes(level, edition.text), ['note']);
    assert.deepEqual(annotationTypes(level, edition.image), []);
  }
  const before: RamenModel = research.snapshot();

  edition.model.updateAnnotation(edition.note.id, {
    type: 'caption',
    relations: [{ relation: edition.imageLink, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });

  for (const level of [research, teaching]) {
    assert.equal(level.validate().valid, true);
    assert.deepEqual(annotationTypes(level, edition.text), []);
    assert.deepEqual(annotationTypes(level, edition.image), ['caption']);
  }
  assert.deepEqual(annotationTypes(before, edition.text), ['note']);
  assert.deepEqual(annotationTypes(before, edition.image), []);
});

void test('RAMEN roundtrip preserves reused nodes, a refined Annotation, literals and type-owned property constraints', (): void => {
  const edition: Edition = createEdition();
  const research: RamenModel = edition.model.createNextLevel('Research');
  const annotation: Node = research.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  research.hasAnnotation(edition.text, annotation);
  const file: RamenFile = research.export();
  const restored: RamenModel = RamenModel.import(JSON.parse(JSON.stringify(file)) as unknown);

  assert.equal(file.models.length, 3);
  // JSON omits optional fields whose in-memory value is undefined.
  assert.deepEqual(jsonContent(restored.export()), jsonContent(file));
  assert.deepEqual(restored.getModel(), research.getModel());
  assert.deepEqual(
    jsonContent(restored.openLevel(edition.model.getModel().id).getModel()),
    jsonContent(edition.model.getModel()),
  );
  assert.deepEqual(annotationTypes(restored, edition.text), ['note']);
  assert.deepEqual(jsonContent(restored.getDataType(edition.label.id)), jsonContent(research.getDataType(edition.label.id)));
  assert.equal(restored.validateAnnotationValue(annotation, 'note', 'label', 'short').hasErrors, false);
  assert.equal(restored.validateAnnotationValue(annotation, 'note', 'label', 'other').hasErrors, true);

  restored.openLevel(edition.model.getModel().id).removeAnnotation(edition.note.id);
  assert.deepEqual(annotationTypes(restored, edition.text), []);
  assert.deepEqual(annotationTypes(research, edition.text), ['note']);
  assert.deepEqual(research.export(), file);
});
