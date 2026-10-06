import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '@ramen-suite/core';
import type {
  Attribute,
  AnnotationProperty,
  AnnotationUpdate,
  AnnotationSuggestion,
  DataType,
  Diagnostic,
  EvolutionChange,
  Node,
  NodeLineageItem,
  NodeRemovalPreview,
  ModelInstanceGraph,
  ModelChange,
  ModelRemovalPreview,
  Model,
  RamenAnnotation,
  RamenEvolutionReport,
  Relation,
  RelationRemovalPreview,
  WorkspaceElement,
} from '@ramen-suite/core';

interface Edition {
  readonly model: RamenModel;
  readonly text: Node;
  readonly image: Node;
  readonly annotation: Node;
  readonly person: Node;
  readonly textHas: Relation;
  readonly imageHas: Relation;
  readonly refers: Relation;
}

function edition(): Edition {
  const model: RamenModel = RamenModel.create('Edition');
  const text: Node = model.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const image: Node = model.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
  const annotation: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const person: Node = model.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;

  const textHas: Relation = model.hasAnnotation(text, annotation).element;
  const imageHas: Relation = model.hasAnnotation(image, annotation).element;
  const refers: Relation = model.refersTo(annotation, person).element;
  return { model, text, image, annotation, person, textHas, imageHas, refers };
}

void test('one annotation type can select text or image attachment and a Person reference', (): void => {
  const fixture: Edition = edition();
  const person: RamenAnnotation = fixture.model.createAnnotation({
    node: fixture.annotation,
    type: 'person',
    relations: [
      { relations: [fixture.textHas, fixture.imageHas], direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
      { relation: fixture.refers, direction: 'outgoing', bounds: { lowerBound: 0, upperBound: 1 } },
    ],
  }).element;

  assert.equal(fixture.model.validate().valid, true);
  assert.deepEqual(
    fixture.model.suggestAnnotationsForNode(fixture.text).map((item: AnnotationSuggestion): string => item.type),
    ['person'],
  );
  assert.deepEqual(
    fixture.model.suggestAnnotationsForNode(fixture.image).map((item: AnnotationSuggestion): string => item.type),
    ['person'],
  );
  assert.equal(person.relations[0]?.relationIds.length, 2);
});

void test('invalid annotation selections leave the project unchanged', (): void => {
  const fixture: Edition = edition();
  const note: RamenAnnotation = fixture.model.createAnnotation({ node: fixture.annotation, type: 'note' }).element;
  const before: readonly RamenAnnotation[] = fixture.model.getAnnotations();
  const missing: Relation = { ...fixture.refers, id: 'missingRelation01' };
  const invalid: AnnotationUpdate = {
    relations: [{ relation: missing, direction: 'outgoing', bounds: { lowerBound: 0, upperBound: 1 } }],
  };

  assert.throws(
    (): ModelChange<RamenAnnotation> => fixture.model.createAnnotation({ node: fixture.annotation, type: 'person', ...invalid }),
    /Expected one relation/,
  );
  assert.throws((): ModelChange<RamenAnnotation> => fixture.model.updateAnnotation(note.id, invalid), /Expected one relation/);
  assert.deepEqual(fixture.model.getAnnotations(), before);
  assert.equal(fixture.model.validate().valid, true);
});

void test('RAMEN snapshot compares annotation and sibling level changes together', (): void => {
  const fixture: Edition = edition();
  const website: RamenModel = fixture.model.createNextLevel('Website');
  const editionLevel: RamenModel = fixture.model.createNextLevel('Print Edition');
  const before: RamenModel = website.snapshot();

  fixture.model.createAnnotation({ node: fixture.annotation, type: 'person' });
  const text: Node = editionLevel.createNode({ name: 'PrintedText', refines: fixture.text }).element;
  const report: RamenEvolutionReport = before.compareTo(website);

  assert.equal(report.annotationChanges.length, 1);
  assert.equal(report.annotationChanges[0]?.annotationId, fixture.model.getAnnotations()[0]?.id);
  assert.ok(report.changes.some((change: EvolutionChange): boolean => change.elementId === text.id));
  assert.deepEqual(before.openLevel(fixture.model.getModel().id).getAnnotations(), []);
});

void test('RAMEN project levels share generic update and strict removal rules', (): void => {
  const edition: RamenModel = RamenModel.create('Edition');
  const publication: RamenModel = edition.createNextLevel('Publication');
  const archive: RamenModel = publication.createNextLevel('Archive');
  const publicationId: string = publication.getModel().id;

  edition.updateNextLevel(publicationId, { name: 'Digital Publication', version: '2.0.0' });

  assert.equal(archive.getModel().imports[0]?.name, 'Digital Publication');
  assert.equal(archive.validate().valid, true);

  const preview: ModelRemovalPreview = edition.previewNextLevelRemoval(publicationId);
  assert.deepEqual(
    preview.models.map((model: { readonly id: string; readonly name: string }): string => model.name),
    ['Digital Publication', 'Archive'],
  );
  assert.throws((): ModelRemovalPreview => edition.removeNextLevel(publicationId), /still used by Archive/);
  edition.removeNextLevel(publicationId, { cascade: true });
  assert.equal(edition.validate().valid, true);
  assert.equal(
    edition.getModels().some((model: Model): boolean => model.name === 'RAMEN'),
    true,
  );
});

void test('a deleted annotation-owned data type becomes a repairable diagnostic', (): void => {
  const fixture: Edition = edition();
  const level: DataType = fixture.model.createDataType({ name: 'Level', baseType: DataTypes.String }).element;
  const note: RamenAnnotation = fixture.model.createAnnotation({
    node: fixture.annotation,
    type: 'note',
    properties: [{ name: 'level', type: level }],
  }).element;
  const property: Attribute | undefined = note.properties.find((item: AnnotationProperty): item is Attribute => 'typeId' in item);
  assert.ok(property);

  fixture.model.removeDataType(level.id);
  const invalid: Diagnostic | undefined = fixture.model
    .validate()
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_PROPERTY_INVALID');
  assert.ok(invalid);
  assert.ok(
    fixture.model
      .validateNode(fixture.annotation)
      .diagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_PROPERTY_INVALID'),
  );

  const repaired: Attribute = { ...property, typeId: DataTypes.String };
  fixture.model.updateAnnotation(note.id, { properties: [repaired] });
  assert.equal(fixture.model.validate().valid, true);
});

void test('cascading an Annotation node removes its types and all dependent links across levels', (): void => {
  const fixture: Edition = edition();
  const note: RamenAnnotation = fixture.model.createAnnotation({ node: fixture.annotation, type: 'note' }).element;
  const next: RamenModel = fixture.model.createNextLevel('Publication');
  const review: Node = next.createNode({ name: 'ReviewAnnotation', refines: fixture.annotation }).element;
  const preview: NodeRemovalPreview = fixture.model.previewNodeRemoval(fixture.annotation.id);

  assert.deepEqual(
    preview.nodes.map((item: WorkspaceElement): string => item.elementId),
    [fixture.annotation.id, review.id],
  );
  assert.ok(preview.annotations.some((item: WorkspaceElement): boolean => item.elementId === note.id));
  assert.throws((): ModelChange<Node> => fixture.model.removeNode(fixture.annotation.id), /still used by/);

  fixture.model.removeNode(fixture.annotation.id, { cascade: true });
  assert.equal(fixture.model.getAnnotations().length, 0);
  assert.equal(fixture.model.getModel().relations.length, 0);
  assert.equal(next.getModel().classifiers.length, 0);
  assert.equal(fixture.model.validate().valid, true);
  assert.equal(next.validate().valid, true);
});

function personRecords(fixture: Edition): ModelInstanceGraph {
  fixture.model.createAnnotation({
    node: fixture.annotation,
    type: 'person',
    relations: [{ relation: fixture.textHas, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  return {
    nodes: [
      { id: 'textRecord000001', typeId: fixture.text.id, properties: { uuid: '550e8400-e29b-41d4-a716-446655440001' } },
      {
        id: 'noteRecord000001',
        typeId: fixture.annotation.id,
        properties: { uuid: '550e8400-e29b-41d4-a716-446655440002', type: 'person' },
      },
    ],
    relations: [{ id: 'hasAnnotation001', typeId: fixture.textHas.id, fromId: 'textRecord000001', toId: 'noteRecord000001' }],
  };
}

void test('recorded annotations require a declared type, permitted fields and a selected carrier link', (): void => {
  const fixture: Edition = edition();
  const data: ModelInstanceGraph = personRecords(fixture);

  assert.equal(
    fixture.model.validateInstances(data).hasErrors,
    false,
    JSON.stringify(fixture.model.validateInstances(data).diagnostics),
  );
  const textRecord: ModelInstanceGraph['nodes'][number] | undefined = data.nodes[0];
  const noteRecord: ModelInstanceGraph['nodes'][number] | undefined = data.nodes[1];
  assert.ok(textRecord && noteRecord);

  const extra: ModelInstanceGraph = {
    ...data,
    nodes: [textRecord, { ...noteRecord, properties: { ...noteRecord.properties, unmodelled: true } }],
  };
  const missingLink: ModelInstanceGraph = { ...data, relations: [] };

  assert.equal(fixture.model.validateInstances(extra).hasErrors, true);
  assert.equal(fixture.model.validateInstances(missingLink).hasErrors, true);
});

void test('a selector accepts an object with a type and rejects an incomplete object', (): void => {
  const fixture: Edition = edition();
  const data: ModelInstanceGraph = personRecords(fixture);
  const textRecord: ModelInstanceGraph['nodes'][number] | undefined = data.nodes[0];
  const noteRecord: ModelInstanceGraph['nodes'][number] | undefined = data.nodes[1];
  assert.ok(textRecord && noteRecord);

  const selected: ModelInstanceGraph = {
    ...data,
    nodes: [
      textRecord,
      { ...noteRecord, properties: { ...noteRecord.properties, selector: { type: 'TextPositionSelector', start: 2, end: 4 } } },
    ],
  };
  const invalidSelector: ModelInstanceGraph = {
    ...data,
    nodes: [textRecord, { ...noteRecord, properties: { ...noteRecord.properties, selector: { start: 2 } } }],
  };

  assert.equal(fixture.model.validateInstances(selected).hasErrors, false);
  assert.equal(fixture.model.validateInstances(invalidSelector).hasErrors, true);
});

void test('removal preview names annotation types whose relationship rules will change', (): void => {
  const fixture: Edition = edition();
  const person: RamenAnnotation = fixture.model.createAnnotation({
    node: fixture.annotation,
    type: 'person',
    relations: [
      { relation: fixture.textHas, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
      { relation: fixture.refers, direction: 'outgoing', bounds: { lowerBound: 0, upperBound: 1 } },
    ],
  }).element;

  const preview: NodeRemovalPreview = fixture.model.previewNodeRemoval(fixture.person.id);
  assert.deepEqual(preview.annotations, []);
  assert.deepEqual(
    preview.updatedAnnotations.map((item: WorkspaceElement): string => item.elementId),
    [person.id],
  );

  fixture.model.removeNode(fixture.person.id, { cascade: true });
  assert.equal(fixture.model.getAnnotations()[0]?.relations.length, 1);
  assert.equal(fixture.model.validate().valid, true);
});

void test('relation removal rejects annotation changes until explicitly cascaded', (): void => {
  const fixture: Edition = edition();
  const person: RamenAnnotation = fixture.model.createAnnotation({
    node: fixture.annotation,
    type: 'person',
    relations: [
      { relations: [fixture.textHas, fixture.imageHas], direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
      { relation: fixture.refers, direction: 'outgoing', bounds: { lowerBound: 0, upperBound: 1 } },
    ],
  }).element;
  const before: readonly RamenAnnotation[] = fixture.model.getAnnotations();

  const preview: RelationRemovalPreview = fixture.model.previewRelationRemoval(fixture.textHas.id);
  assert.deepEqual(
    preview.relations.map((item: WorkspaceElement): string => item.elementId),
    [fixture.textHas.id],
  );
  assert.deepEqual(
    preview.updatedAnnotations.map((item: WorkspaceElement): string => item.elementId),
    [person.id],
  );
  assert.throws((): ModelChange<Relation> => fixture.model.removeRelation(fixture.textHas.id), /still used by/);
  assert.deepEqual(fixture.model.getAnnotations(), before);

  fixture.model.removeRelation(fixture.textHas.id, { cascade: true });
  assert.deepEqual(fixture.model.getAnnotations()[0]?.relations[0]?.relationIds, [fixture.imageHas.id]);
  assert.deepEqual(fixture.model.suggestAnnotationsForNode(fixture.text), []);
  assert.equal(fixture.model.suggestAnnotationsForNode(fixture.image).length, 1);
  assert.equal(fixture.model.validate().valid, true);
});

void test('an imported file lets a tool edit a project predecessor but protects RAMEN itself', (): void => {
  const fixture: Edition = edition();
  const next: RamenModel = fixture.model.createNextLevel('Publication');
  const historical: Node = next.createNode({ name: 'HistoricalPerson', refines: fixture.person }).element;
  const restored: RamenModel = RamenModel.import(next.export());
  const base: RamenModel = restored.openLevel(fixture.model.getModel().id);

  base.updateNode(fixture.person.id, { name: 'NamedPerson' });
  assert.deepEqual(
    restored.getNodeLineage(historical).map((item: NodeLineageItem): string => item.name),
    ['Entity', 'NamedPerson', 'HistoricalPerson'],
  );
  assert.throws((): RamenModel => restored.openLevel(RAMEN_MODEL.id), /read-only/);
});
