import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_ELEMENT, RamenModel } from '../../dist/index.js';
import type {
  AnnotationLink,
  AnnotationRelation,
  Bounds,
  ModelInstanceGraph,
  ModelInstanceNode,
  Node,
  RamenAnnotation,
  RamenChange,
  RamenModelDocument,
  Relation,
} from '../../dist/index.js';

const ONE: Bounds = { lowerBound: 1, upperBound: 1 };

function links(text: Node, target: Node | string): readonly AnnotationLink[] {
  return [
    { relation: 'HAS_ANNOTATION', from: text, bounds: ONE },
    { relation: 'REFERS_TO', to: target, bounds: ONE },
  ];
}

function records(project: RamenModel, text: Node, target: Node, definition: RamenAnnotation): ModelInstanceGraph {
  const incoming: string | undefined = definition.relations.find(
    (item: AnnotationRelation): boolean => item.direction === 'incoming',
  )?.relationId;
  const outgoing: string | undefined = definition.relations.find(
    (item: AnnotationRelation): boolean => item.direction === 'outgoing',
  )?.relationId;
  assert.ok(incoming && outgoing);
  return {
    modelId: project.getModel().id,
    nodes: [
      { id: 'textRecord000001', typeId: text.id, properties: { uuid: 'abac88bd-b3e3-418a-8afe-000000000001' } },
      {
        id: 'entityRecord0001',
        typeId: target.id,
        properties: { uuid: 'abac88bd-b3e3-418a-8afe-000000000002', label: 'Target' },
      },
      {
        id: 'annotationRec001',
        typeId: definition.annotationId,
        properties: { uuid: 'abac88bd-b3e3-418a-8afe-000000000003', type: definition.type },
      },
    ],
    relations: [
      { id: 'annotationLink01', typeId: incoming, fromId: 'textRecord000001', toId: 'annotationRec001' },
      { id: 'entityLink000001', typeId: outgoing, fromId: 'annotationRec001', toId: 'entityRecord0001' },
    ],
  };
}

void test('broad Entity selection reuses RAMEN and accepts entities added after the annotation definition', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'entity',
    relations: links(text, RAMEN_ELEMENT.ENTITY),
  });
  assert.equal(created.validation.valid, true);
  assert.equal(project.getModel().relations.length, 1);
  const organization: Node = project.createNode({ name: 'Organization', refines: RAMEN_ELEMENT.ENTITY }).element;
  const input: ModelInstanceGraph = records(project, text, organization, created.element);
  assert.equal(project.validateInstances(input).hasErrors, false);
  const restored: RamenModel = RamenModel.import(project.export());
  assert.equal(restored.validateInstances(input).hasErrors, false);
  assert.deepEqual(restored.getAnnotations(), project.getAnnotations());
  assert.equal(project.suggestAnnotationsForNode(text)[0]?.type, 'entity');
});

void test('Person and Place selections remain narrow and reuse existing endpoint relationships', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const person: Node = project.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  const place: Node = project.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
  const reference: Relation = project.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'person',
    relations: links(text, person),
  });
  assert.equal(created.validation.valid, true);
  assert.equal(created.element.relations[1]?.relationId, reference.id);
  assert.equal(project.getModel().relations.length, 2);
  assert.equal(project.validateInstances(records(project, text, person, created.element)).hasErrors, false);
  assert.equal(project.validateInstances(records(project, text, place, created.element)).hasErrors, true);
  const placeType: RamenChange<RamenAnnotation> = project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'place',
    relations: links(text, place),
  });
  assert.equal(placeType.validation.valid, true);
  assert.equal(project.getModel().relations.length, 3);
  assert.equal(project.validateInstances(records(project, text, place, placeType.element)).hasErrors, false);
});

void test('refined Annotation nodes support broad targets and annotation updates resolve endpoint selections', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const annotation: Node = project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const person: Node = project.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  const place: Node = project.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    annotationId: annotation,
    type: 'entity',
    relations: links(text, person),
  });
  const updated: RamenChange<RamenAnnotation> = project.updateAnnotation(created.element.id, {
    relations: links(text, RAMEN_ELEMENT.ENTITY),
  });
  assert.equal(updated.validation.valid, true);
  assert.equal(project.validateInstances(records(project, text, place, updated.element)).hasErrors, false);
});

void test('endpoint selection cannot reopen broad Entity relationships excluded by a predecessor and rolls back on failure', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const person: Node = project.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  project.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
  project.refersTo(RAMEN_ELEMENT.ANNOTATION, person);
  const next: RamenModel = project.createNextLevel('Letters');
  const refinedText: Node = next.createNode({ name: 'LetterText', refines: text }).element;
  const before: RamenModelDocument = next.getModel();
  assert.throws((): void => {
    next.createAnnotation({
      annotationId: RAMEN_ELEMENT.ANNOTATION,
      type: 'entity',
      relations: links(refinedText, RAMEN_ELEMENT.ENTITY),
    });
  }, /found 0/);
  assert.deepEqual(next.getModel(), before);
  assert.equal(next.validate().valid, true);
  const narrowed: RamenChange<RamenAnnotation> = next.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'person',
    relations: links(refinedText, person),
  });
  assert.equal(narrowed.validation.valid, true);
});

void test('unknown relationship names and malformed bounds leave the model unchanged', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const before: RamenModelDocument = project.getModel();
  assert.throws((): void => {
    project.createAnnotation({
      annotationId: RAMEN_ELEMENT.ANNOTATION,
      type: 'note',
      relations: [{ relation: 'UNKNOWN', from: text, bounds: ONE }],
    });
  }, /Unknown RAMEN relationship/);
  assert.deepEqual(project.getModel(), before);
  assert.throws((): void => {
    project.createAnnotation({
      annotationId: RAMEN_ELEMENT.ANNOTATION,
      type: 'note',
      relations: [{ relation: 'HAS_ANNOTATION', from: text, bounds: { lowerBound: -1, upperBound: 1 } }],
    });
  }, /Invalid annotation definitions/);
  assert.deepEqual(project.getModel(), before);
});

void test('an inherited broad annotation accepts future entities when each next level explicitly selects its relationships', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'entity',
    relations: links(text, RAMEN_ELEMENT.ENTITY),
  });
  const next: RamenModel = project.createNextLevel('Organizations');
  const organization: Node = next.createNode({ name: 'Organization', refines: RAMEN_ELEMENT.ENTITY }).element;
  const incoming: Relation = next.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
  const outgoing: Relation = next.refersTo(RAMEN_ELEMENT.ANNOTATION, RAMEN_ELEMENT.ENTITY).element;
  const inherited: RamenAnnotation = {
    ...created.element,
    relations: [
      { relationId: incoming.id, direction: 'incoming', bounds: ONE },
      { relationId: outgoing.id, direction: 'outgoing', bounds: ONE },
    ],
  };
  const data: ModelInstanceGraph = records(next, text, organization, inherited);
  const textRecord: ModelInstanceNode | undefined = data.nodes[0];
  assert.ok(textRecord);
  const qualified: ModelInstanceGraph = {
    ...data,
    nodes: [{ ...textRecord, typeId: `${project.getModel().id}:${text.id}` }, ...data.nodes.slice(1)],
  };
  assert.equal(next.validate().valid, true);
  assert.equal(next.validateInstances(qualified).hasErrors, false);
  assert.equal(RamenModel.import(next.export()).validateInstances(qualified).hasErrors, false);
});

void test('ambiguous endpoint selections require an explicit reference rather than choosing an arbitrary relationship', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  project.refersTo(RAMEN_ELEMENT.ANNOTATION, RAMEN_ELEMENT.ENTITY);
  project.refersTo(RAMEN_ELEMENT.ANNOTATION, RAMEN_ELEMENT.ENTITY);
  const before: RamenModelDocument = project.getModel();
  assert.throws((): void => {
    project.createAnnotation({
      annotationId: RAMEN_ELEMENT.ANNOTATION,
      type: 'entity',
      relations: [{ relation: 'REFERS_TO', to: RAMEN_ELEMENT.ENTITY, bounds: ONE }],
    });
  }, /Multiple 'REFERS_TO'/);
  assert.deepEqual(project.getModel(), before);
});
