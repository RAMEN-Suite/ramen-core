import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DataTypes, RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '@ramen-suite/core';
import type {
  AnnotationSuggestion,
  AnnotationRelationInput,
  Classifier,
  DataType,
  Node,
  NodeLineageItem,
  RamenFile,
  RamenAnnotation,
  Relation,
  RelationSelection,
  Diagnostic,
  ModelInstanceGraph,
  ModelInstanceNode,
  ModelInstanceRelation,
  ValidationResult,
} from '@ramen-suite/core';

interface Edition {
  readonly model: RamenModel;
  readonly letter: Node;
  readonly witness: Node;
  readonly text: Node;
  readonly image: Node;
  readonly person: Node;
  readonly place: Node;
  readonly carrier: Relation;
  readonly imageCarrier: Relation;
  readonly personLink: Relation;
  readonly placeLink: Relation;
}

function createEdition(): Edition {
  // One project level defines the edition vocabulary. Annotation stays the imported RAMEN node.
  const edition: RamenModel = RamenModel.create('Correspondence edition');
  const letter: Node = edition.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const witness: Node = edition.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const image: Node = edition.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
  const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  const place: Node = edition.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;

  edition.createAttribute(letter, { name: 'sentOn', typeId: RAMEN_ELEMENT.DATE });
  edition.partOf(witness, letter);
  edition.partOf(text, witness);
  edition.partOf(image, witness);
  const carrier: Relation = edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
  const imageCarrier: Relation = edition.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
  const personLink: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
  const placeLink: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, place).element;

  return { model: edition, letter, witness, text, image, person, place, carrier, imageCarrier, personLink, placeLink };
}

function declareRole(
  edition: RamenModel,
  roleName: DataType,
  carrier: AnnotationRelationInput,
  personLink: AnnotationRelationInput,
): void {
  edition.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'role',
    properties: [{ name: 'name', type: roleName, bounds: { lowerBound: 1, upperBound: 1 } }],
    relations: [carrier, personLink],
  });
}

function declareTypes(fixture: Edition): void {
  const edition: RamenModel = fixture.model;
  const roleName: DataType = edition.createDataType({ name: 'RoleName', baseType: DataTypes.String }).element;
  edition.createLiteral(roleName.id, { name: 'Sender', literal: 'sender' });
  edition.createLiteral(roleName.id, { name: 'Recipient', literal: 'recipient' });

  // These are type declarations, not six additional Annotation nodes.
  const carrier: AnnotationRelationInput = {
    relation: fixture.carrier,
    direction: 'incoming',
    bounds: { lowerBound: 1, upperBound: 1 },
  };
  const personLink: AnnotationRelationInput = {
    relation: fixture.personLink,
    direction: 'outgoing',
    bounds: { lowerBound: 1, upperBound: 1 },
  };
  const placeLink: AnnotationRelationInput = {
    relation: fixture.placeLink,
    direction: 'outgoing',
    bounds: { lowerBound: 1, upperBound: 1 },
  };

  const textOrImage: AnnotationRelationInput = {
    relations: [fixture.carrier, fixture.imageCarrier],
    direction: 'incoming',
    bounds: { lowerBound: 1, upperBound: 1 },
  };
  edition.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'persName', relations: [textOrImage, personLink] });
  edition.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'placeName', relations: [carrier, placeLink] });
  declareDate(edition, carrier);
  edition.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'hi',
    properties: [{ name: 'rendition', typeId: DataTypes.String }],
    relations: [carrier],
  });
  edition.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'note', relations: [carrier] });
  declareRole(edition, roleName, carrier, personLink);
}

function declareDate(edition: RamenModel, carrier: AnnotationRelationInput): void {
  edition.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'date',
    properties: [{ name: 'when', typeId: RAMEN_ELEMENT.DATE, bounds: { lowerBound: 1, upperBound: 1 } }],
    relations: [carrier],
  });
}

void test('RAMEN scenario: a correspondence edition models witnesses and six annotation types', (): void => {
  const fixture: Edition = createEdition();
  const edition: RamenModel = fixture.model;
  declareTypes(fixture);

  assert.equal(edition.validate().valid, true);
  assert.equal(edition.getAnnotations().length, 6);
  assert.equal(edition.getModel().classifiers.filter((item: Classifier): boolean => item.kind === 'Node').length, 6);
  assert.deepEqual(
    edition
      .suggestAnnotationsForNode(fixture.text)
      .map((item: AnnotationSuggestion): string => item.type)
      .sort(),
    ['date', 'hi', 'note', 'persName', 'placeName', 'role'],
  );
  assert.deepEqual(edition.suggestAnnotationsForNode(fixture.letter), []);
  assert.deepEqual(
    edition.suggestAnnotationsForNode(fixture.image).map((item: AnnotationSuggestion): string => item.type),
    ['persName'],
  );
  assert.equal(edition.getRelations(fixture.text, fixture.witness).length, 1);
  assert.equal(edition.getRelations(fixture.witness, fixture.letter).length, 1);

  checkExchange(edition);

  // A later level specialises Person. Letter, Witness, Text, Place and Annotation are reused.
  const research: RamenModel = edition.createNextLevel('Research edition');
  const correspondent: Node = research.createNode({ name: 'Correspondent', refines: fixture.person }).element;
  research.partOf(fixture.witness, fixture.letter);
  research.partOf(fixture.text, fixture.witness);
  research.partOf(fixture.image, fixture.witness);
  research.hasAnnotation(fixture.text, RAMEN_ELEMENT.ANNOTATION);
  research.hasAnnotation(fixture.image, RAMEN_ELEMENT.ANNOTATION);
  research.refersTo(RAMEN_ELEMENT.ANNOTATION, fixture.place);
  const specificLink: Relation = research.refersTo(RAMEN_ELEMENT.ANNOTATION, correspondent).element;

  assert.deepEqual(
    research.getNodeLineage(correspondent).map((item: NodeLineageItem): string => item.name),
    ['Entity', 'Person', 'Correspondent'],
  );
  assert.equal(specificLink.name, 'REFERS_TO');
  assert.equal(research.validate().valid, true);
  assert.equal(research.suggestAnnotationsForNode(fixture.text).length, 6);
  assert.equal(edition.getAnnotations().length, 6);
});

function checkExchange(edition: RamenModel): void {
  const exchanged: RamenFile = edition.export();
  const restored: RamenModel = RamenModel.import(exchanged);
  assert.equal(exchanged.models.length, 2);
  assert.equal(restored.getAnnotations().length, 6);
  assert.equal(restored.validate().valid, true);
}

void test('RAMEN scenario: an editor revises annotation vocabulary before using the model', (): void => {
  const fixture: Edition = createEdition();
  const edition: RamenModel = fixture.model;
  const onText: AnnotationRelationInput = {
    relation: fixture.carrier,
    direction: 'incoming',
    bounds: { lowerBound: 1, upperBound: 1 },
  };

  const draft: RamenAnnotation = edition.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
    relations: [onText],
  }).element;
  const discarded: RamenAnnotation = edition.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'temporary',
    relations: [onText],
  }).element;

  edition.updateAnnotation(draft.id, { type: 'note' });
  edition.removeAnnotation(discarded.id);

  assert.deepEqual(
    edition.suggestAnnotationsForNode(fixture.text).map((item: AnnotationSuggestion): string => item.type),
    ['note'],
  );
  assert.equal(edition.validate().valid, true);
});

function record(id: string, typeId: string, properties: Readonly<Record<string, unknown>> = {}): ModelInstanceNode {
  return { id: id.padEnd(16, '0'), typeId, properties: { uuid: randomUUID(), ...properties } };
}

function link(
  model: RamenModel,
  id: string,
  from: Node | string,
  to: Node | string,
  source: string,
  target: string,
): ModelInstanceRelation {
  const modelId: string = model.getModel().id;
  const relations: readonly RelationSelection[] = model
    .getRelations(from, to)
    .filter((choice: RelationSelection): boolean => choice.ref.startsWith(`${modelId}:`));
  assert.equal(relations.length, 1);
  const relation: RelationSelection | undefined = relations[0];
  assert.ok(relation);
  return { id: id.padEnd(16, '0'), typeId: relation.ref, fromId: source.padEnd(16, '0'), toId: target.padEnd(16, '0') };
}

function recordedEdition(fixture: Edition, model: RamenModel = fixture.model, person: Node = fixture.person): ModelInstanceGraph {
  const annotation: string = `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`;
  const base: string = fixture.model.getModel().id;
  const personRef: string = `${model.getModel().id}:${person.id}`;
  const nodes: readonly ModelInstanceNode[] = [
    record('letter', `${base}:${fixture.letter.id}`, { label: 'Letter', sentOn: '2026-10-07' }),
    record('witness', `${base}:${fixture.witness.id}`, { label: 'Witness' }),
    record('text', `${base}:${fixture.text.id}`),
    record('image', `${base}:${fixture.image.id}`),
    record('person', personRef, { label: 'Ada' }),
    record('place', `${base}:${fixture.place.id}`, { label: 'London' }),
    record('personName', annotation, { type: 'persName', selector: { type: 'TextPositionSelector', start: 0, end: 3 } }),
    record('placeName', annotation, { type: 'placeName' }),
    record('date', annotation, { type: 'date', when: '2026-10-07' }),
    record('highlight', annotation, { type: 'hi', rendition: 'italic' }),
    record('note', annotation, { type: 'note' }),
    record('role', annotation, { type: 'role', name: 'sender' }),
    record('imagePerson', annotation, { type: 'persName', selector: { type: 'FragmentSelector', value: 'xywh=10,20,30,40' } }),
  ];
  const relations: ModelInstanceRelation[] = [
    link(model, 'witnessInLetter', fixture.witness, fixture.letter, 'witness', 'letter'),
    link(model, 'textInWitness', fixture.text, fixture.witness, 'text', 'witness'),
    link(model, 'imageInWitness', fixture.image, fixture.witness, 'image', 'witness'),
    link(model, 'personReference', annotation, person, 'personName', 'person'),
    link(model, 'placeReference', annotation, fixture.place, 'placeName', 'place'),
    link(model, 'roleReference', annotation, person, 'role', 'person'),
    link(model, 'imageReference', annotation, person, 'imagePerson', 'person'),
    link(model, 'imageAnnotation', fixture.image, annotation, 'image', 'imagePerson'),
  ];
  for (const id of ['personName', 'placeName', 'date', 'highlight', 'note', 'role']) {
    relations.push(link(model, `${id}OnText`, fixture.text, annotation, 'text', id));
  }
  return { nodes, relations };
}

function changeProperties(
  data: ModelInstanceGraph,
  id: string,
  properties: Readonly<Record<string, unknown>>,
): ModelInstanceGraph {
  return {
    ...data,
    nodes: data.nodes.map((node: ModelInstanceNode): ModelInstanceNode =>
      node.id === id.padEnd(16, '0') ? { ...node, properties: { ...node.properties, ...properties } } : node,
    ),
  };
}

function expectFinding(result: ValidationResult, code: string, path: string): void {
  const finding: Diagnostic | undefined = result.diagnostics.find((item: Diagnostic): boolean => item.code === code);
  assert.ok(finding, JSON.stringify(result.diagnostics));
  assert.equal(finding.severity, 'error');
  assert.equal(finding.path, path);
}

void test('RAMEN scenario: recorded letters validate all six annotation types on text and image', (): void => {
  const fixture: Edition = createEdition();
  declareTypes(fixture);
  const data: ModelInstanceGraph = recordedEdition(fixture);
  const valid: ValidationResult = fixture.model.validateInstances(data);
  assert.equal(valid.hasErrors, false, JSON.stringify(valid.diagnostics));

  const unknownType: ModelInstanceGraph = changeProperties(data, 'note', { type: 'unknown' });
  const extraProperty: ModelInstanceGraph = changeProperties(data, 'personName', { name: 'not declared' });
  const invalidRole: ModelInstanceGraph = changeProperties(data, 'role', { name: 'editor' });
  const invalidDate: ModelInstanceGraph = changeProperties(data, 'date', { when: '2026-02-30' });
  const invalidSelector: ModelInstanceGraph = changeProperties(data, 'imagePerson', { selector: { value: 'xywh=1,2,3,4' } });

  expectFinding(fixture.model.validateInstances(unknownType), 'RAMEN_INSTANCE_ANNOTATION_UNKNOWN', '/nodes/10/properties/type');
  expectFinding(
    fixture.model.validateInstances(extraProperty),
    'RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED',
    '/nodes/6/properties/name',
  );
  expectFinding(fixture.model.validateInstances(invalidRole), 'INSTANCE_PROPERTY_LITERAL_INVALID', '/nodes/11/properties/name');
  expectFinding(fixture.model.validateInstances(invalidDate), 'CONSTRAINT_FORMAT_MISMATCH', '/nodes/8/properties/when');
  expectFinding(
    fixture.model.validateInstances(invalidSelector),
    'RAMEN_INSTANCE_SELECTOR_TYPE_REQUIRED',
    '/nodes/12/properties/selector/type',
  );
  assert.equal(RamenModel.import(fixture.model.export()).validateInstances(data).hasErrors, false);
});

void test('RAMEN scenario: recorded annotations enforce the selected entities and one text or image carrier', (): void => {
  const fixture: Edition = createEdition();
  declareTypes(fixture);
  const data: ModelInstanceGraph = recordedEdition(fixture);

  const withoutPerson: ModelInstanceGraph = {
    ...data,
    relations: data.relations.filter((relation: ModelInstanceRelation): boolean => relation.id !== 'personReference0'),
  };
  expectFinding(fixture.model.validateInstances(withoutPerson), 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY', '/nodes/6');

  const wrongEntity: ModelInstanceGraph = {
    ...data,
    relations: data.relations.map((relation: ModelInstanceRelation): ModelInstanceRelation =>
      relation.id === 'personReference0' ? { ...relation, toId: 'place00000000000' } : relation,
    ),
  };
  expectFinding(fixture.model.validateInstances(wrongEntity), 'INSTANCE_RELATION_END_TYPE_INVALID', '/relations/3/toId');

  const bothCarriers: ModelInstanceGraph = {
    ...data,
    relations: [
      ...data.relations,
      link(fixture.model, 'secondCarrier', fixture.image, RAMEN_ELEMENT.ANNOTATION, 'image', 'personName'),
    ],
  };
  expectFinding(fixture.model.validateInstances(bothCarriers), 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY', '/nodes/6');
});

void test('RAMEN scenario: inherited annotation rules constrain data after Person is refined', (): void => {
  const fixture: Edition = createEdition();
  declareTypes(fixture);
  const research: RamenModel = fixture.model.createNextLevel('Research');
  const correspondent: Node = research.createNode({ name: 'Correspondent', refines: fixture.person }).element;
  research.partOf(fixture.witness, fixture.letter);
  research.partOf(fixture.text, fixture.witness);
  research.partOf(fixture.image, fixture.witness);
  research.hasAnnotation(fixture.text, RAMEN_ELEMENT.ANNOTATION);
  research.hasAnnotation(fixture.image, RAMEN_ELEMENT.ANNOTATION);
  research.refersTo(RAMEN_ELEMENT.ANNOTATION, correspondent);
  research.refersTo(RAMEN_ELEMENT.ANNOTATION, fixture.place);
  const data: ModelInstanceGraph = recordedEdition(fixture, research, correspondent);
  const result: ValidationResult = research.validateInstances(data);

  assert.equal(result.hasErrors, false, JSON.stringify(result.diagnostics));
  assert.equal(research.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'role', 'name', 'sender').hasErrors, false);
  assert.equal(RamenModel.import(research.export()).validateInstances(data).hasErrors, false);

  const oldPerson: ModelInstanceGraph = {
    ...data,
    nodes: data.nodes.map((node: ModelInstanceNode): ModelInstanceNode =>
      node.id === 'person0000000000' ? { ...node, typeId: `${fixture.model.getModel().id}:${fixture.person.id}` } : node,
    ),
  };
  expectFinding(research.validateInstances(oldPerson), 'INSTANCE_RELATION_END_TYPE_INVALID', '/relations/3/toId');
  const invalidRole: ModelInstanceGraph = changeProperties(data, 'role', { name: 'editor' });
  expectFinding(research.validateInstances(invalidRole), 'INSTANCE_PROPERTY_LITERAL_INVALID', '/nodes/11/properties/name');
});
