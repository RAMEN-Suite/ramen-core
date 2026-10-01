import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_ELEMENT, RamenModel } from '../../dist/ramen-core/index.js';
import type {
  AnnotationConnection,
  AnnotationRelation,
  Bounds,
  ModelInstanceGraph,
  ModelInstanceNode,
  Node,
  RamenAnnotation,
  RamenAdvisor,
  RamenChange,
  RamenModelDocument,
  Relation,
  RelationSelection,
} from '../../dist/ramen-core/index.js';

const ONE: Bounds = { lowerBound: 1, upperBound: 1 };

function links(project: RamenModel, owner: Node | string, text: Node, target: Node | string): readonly AnnotationConnection[] {
  const [incoming]: readonly RelationSelection[] = project.getRelations(text, owner);
  const [outgoing]: readonly RelationSelection[] = project.getRelations(owner, target);
  assert.ok(incoming && outgoing, 'Expected existing annotation relationships.');
  return [
    { connection: incoming, bounds: { lowerBound: 1, upperBound: 1 } },
    { connection: outgoing, bounds: { lowerBound: 1, upperBound: 1 } },
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
  project.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'entity',
    relations: links(project, RAMEN_ELEMENT.ANNOTATION, text, RAMEN_ELEMENT.ENTITY),
  });
  assert.equal(created.validation.valid, true);
  assert.equal(project.getModel().relations.length, 1);
  const beforeQuery: RamenModelDocument = project.getModel();
  const matches: readonly RelationSelection[] = project.getRelations(RAMEN_ELEMENT.ANNOTATION, RAMEN_ELEMENT.ENTITY);
  assert.equal(matches.length, 1, 'An explicitly reused predecessor relationship appears only once.');
  assert.equal(Object.isFrozen(matches), true);
  assert.equal(Object.isFrozen(matches[0]), true);
  assert.deepEqual(project.getModel(), beforeQuery);
  const organisation: Node = project.createNode({ name: 'Organisation', refines: RAMEN_ELEMENT.ENTITY }).element;
  const input: ModelInstanceGraph = records(project, text, organisation, created.element);
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
  project.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
  const reference: Relation = project.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'person',
    relations: links(project, RAMEN_ELEMENT.ANNOTATION, text, person),
  });
  assert.equal(created.validation.valid, true);
  assert.equal(created.element.relations[1]?.relationId, reference.id);
  assert.equal(project.getModel().relations.length, 2);
  assert.equal(project.validateInstances(records(project, text, person, created.element)).hasErrors, false);
  assert.equal(project.validateInstances(records(project, text, place, created.element)).hasErrors, true);
  project.refersTo(RAMEN_ELEMENT.ANNOTATION, place);
  const placeType: RamenChange<RamenAnnotation> = project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'place',
    relations: links(project, RAMEN_ELEMENT.ANNOTATION, text, place),
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
  project.hasAnnotation(text, annotation);
  project.refersTo(annotation, person);
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    node: annotation,
    type: 'entity',
    relations: links(project, annotation, text, person),
  });
  project.refersTo(annotation, RAMEN_ELEMENT.ENTITY);
  const updated: RamenChange<RamenAnnotation> = project.updateAnnotation(created.element.id, {
    relations: links(project, annotation, text, RAMEN_ELEMENT.ENTITY),
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
  next.hasAnnotation(refinedText, RAMEN_ELEMENT.ANNOTATION);
  const before: RamenModelDocument = next.getModel();
  assert.throws((): void => {
    next.createAnnotation({
      nodeId: RAMEN_ELEMENT.ANNOTATION,
      type: 'entity',
      relations: [{ to: RAMEN_ELEMENT.ENTITY, bounds: { lowerBound: 1, upperBound: 1 } }],
    });
  }, /found 0/);
  assert.deepEqual(next.getModel(), before);
  assert.equal(next.validate().valid, true);
  const narrowed: RamenChange<RamenAnnotation> = next.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'person',
    relations: links(next, RAMEN_ELEMENT.ANNOTATION, refinedText, person),
  });
  assert.equal(narrowed.validation.valid, true);
});

void test('unknown endpoints and malformed bounds leave the model unchanged', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  project.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
  const before: RamenModelDocument = project.getModel();
  assert.throws((): void => {
    project.createAnnotation({
      nodeId: RAMEN_ELEMENT.ANNOTATION,
      type: 'note',
      relations: [{ to: 'unknownNode00001', bounds: ONE }],
    });
  }, /Expected one node/);
  assert.deepEqual(project.getModel(), before);
  assert.throws((): void => {
    project.createAnnotation({
      nodeId: RAMEN_ELEMENT.ANNOTATION,
      type: 'note',
      relations: [{ from: text, bounds: { lowerBound: -1, upperBound: 1 } }],
    });
  }, /Invalid annotation definitions/);
  assert.deepEqual(project.getModel(), before);
});

void test('an inherited broad annotation accepts future entities when each next level explicitly selects its relationships', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  project.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION);
  const created: RamenChange<RamenAnnotation> = project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'entity',
    relations: links(project, RAMEN_ELEMENT.ANNOTATION, text, RAMEN_ELEMENT.ENTITY),
  });
  const next: RamenModel = project.createNextLevel('Organisations');
  const organisation: Node = next.createNode({ name: 'Organisation', refines: RAMEN_ELEMENT.ENTITY }).element;
  const incoming: Relation = next.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
  const outgoing: Relation = next.refersTo(RAMEN_ELEMENT.ANNOTATION, RAMEN_ELEMENT.ENTITY).element;
  const inherited: RamenAnnotation = {
    ...created.element,
    relations: [
      { relationId: incoming.id, direction: 'incoming', bounds: ONE },
      { relationId: outgoing.id, direction: 'outgoing', bounds: ONE },
    ],
  };
  const data: ModelInstanceGraph = records(next, text, organisation, inherited);
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
      nodeId: RAMEN_ELEMENT.ANNOTATION,
      type: 'entity',
      relations: [{ to: RAMEN_ELEMENT.ENTITY, bounds: ONE }],
    });
  }, /found 3/);
  assert.deepEqual(project.getModel(), before);
});

void test('stored connection selections are rechecked after edits and cannot be applied to a different Annotation node', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const person: Node = project.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  const other: Node = project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const relation: Relation = project.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;
  const [connection]: readonly RelationSelection[] = project.getRelations(RAMEN_ELEMENT.ANNOTATION, person);
  assert.ok(connection);
  const before: RamenModelDocument = project.getModel();
  assert.throws((): void => {
    project.createAnnotation({
      node: other,
      type: 'person',
      relations: [{ connection, bounds: { lowerBound: 1, upperBound: 1 } }],
    });
  }, /does not involve this Annotation/);
  assert.deepEqual(project.getModel(), before);
  project.removeRelation(relation.id);
  const removed: RamenModelDocument = project.getModel();
  assert.throws((): void => {
    project.createAnnotation({
      nodeId: RAMEN_ELEMENT.ANNOTATION,
      type: 'person',
      relations: [{ connection, bounds: { lowerBound: 1, upperBound: 1 } }],
    });
  }, /found 0/);
  assert.deepEqual(project.getModel(), removed);
});

void test('RAMEN uses the generic relationship query in both its facade and advisor', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const annotation: Node = project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  assert.deepEqual(project.getRelations(text, annotation), []);
  project.hasAnnotation(text, annotation);
  const advisor: RamenAdvisor = project.getAdvisor();
  const matches: readonly RelationSelection[] = project.getRelations(text, annotation);
  assert.equal(matches.length, 1);
  assert.deepEqual(advisor.getRelations(project.getModel().id, text.id, annotation.id), matches);
  project.hasAnnotation(text, annotation);
  assert.equal(project.getRelations(text, annotation).length, 2);
  assert.equal(advisor.getRelations(project.getModel().id, text.id, annotation.id).length, 1);
  assert.deepEqual(project.getRelations(annotation, text), []);
});

void test('RAMEN options returns empty collections or absent options for inapplicable annotations', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const advisor: RamenAdvisor = project.getAdvisor();
  const context: string = project.getModel().id;
  assert.deepEqual(project.getAnnotations(), []);
  assert.deepEqual(project.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION), []);
  assert.deepEqual(project.suggestAnnotationsForNode(text), []);
  assert.deepEqual(project.getRelationsForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'missing'), []);
  assert.deepEqual(project.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'missing'), []);
  assert.equal(project.suggestAnnotationOptions(text), undefined);
  assert.equal(advisor.suggestAnnotationOptions(context, 'missingNode00001'), undefined);
});
