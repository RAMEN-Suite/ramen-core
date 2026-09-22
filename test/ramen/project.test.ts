import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenAdvisor, RamenInstanceValidator, RamenProject } from '../../dist/index.js';
import type {
  DataTypeSuggestion,
  GModel,
  GNode,
  GRelation,
  ModelInstanceNode,
  NodeRefinementSuggestion,
  RelationRefinementSuggestion,
} from '../../dist/index.js';

function project(): RamenProject {
  return RamenProject.create({
    uri: 'https://example.org/models/editorial',
    id: 'editorialModel01',
    name: 'Editorial',
    version: '1.0.0',
  });
}

void test('RAMEN provides reusable standard string datatypes', () => {
  const names = RAMEN_MODEL.classifiers
    .filter((classifier) => classifier.kind === 'GDataType')
    .map((classifier) => classifier.name);
  assert.deepEqual(names, ['UUID', 'Date', 'DateTime', 'URI', 'Email']);
});

void test('creates and validates a RAMEN project after every model change', () => {
  const ramenProject: RamenProject = project();
  assert.equal(ramenProject.validate().valid, true);

  const person = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  });
  assert.equal(person.element.id.length, 16);
  assert.equal(person.validation.valid, true);

  const birthDate = ramenProject.createAttribute(person.element.id, {
    name: 'birthDate',
    typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`,
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  assert.equal(birthDate.validation.valid, true);
});

void test('suggests node refinements and available data types from a valid graph', () => {
  const advisor: RamenAdvisor | undefined = project().createAdvisor();
  assert.ok(advisor);
  const nodeNames: readonly string[] = advisor
    .suggestNodeRefinements('editorialModel01')
    .map((item: NodeRefinementSuggestion): string => item.name);
  assert.deepEqual(nodeNames, ['Annotation', 'Collection', 'Content', 'Entity']);

  const dataTypeNames: readonly string[] = advisor
    .suggestDataTypes('editorialModel01')
    .map((item: DataTypeSuggestion): string => item.name);
  assert.ok(dataTypeNames.includes('String'));
  assert.ok(dataTypeNames.includes('DateTime'));
  assert.ok(dataTypeNames.includes('UUID'));
});

void test('suggests compatible relation reuse and refinement', () => {
  const ramenProject: RamenProject = project();
  const person = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  }).element;
  const annotation = ramenProject.createNode({
    name: 'PersonName',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  const advisor: RamenAdvisor | undefined = ramenProject.createAdvisor();
  assert.ok(advisor);
  const suggestions: readonly RelationRefinementSuggestion[] = advisor.suggestRelations(
    'editorialModel01',
    person.id,
    annotation.id,
  );
  const hasAnnotation: RelationRefinementSuggestion | undefined = suggestions.find(
    (item: RelationRefinementSuggestion): boolean => item.name === 'HAS_ANNOTATION',
  );
  assert.ok(hasAnnotation);
  assert.deepEqual(hasAnnotation.actions, ['reuse', 'refine']);

  const relation = ramenProject.createRelation({
    refines: { modelId: hasAnnotation.modelId, elementId: hasAnnotation.relationId },
    fromNodeId: person.id,
    toNodeId: annotation.id,
  });
  assert.equal(relation.validation.valid, true, JSON.stringify(relation.validation.diagnostics));
});

void test('returns semantic diagnostics for an invalid modeling change', () => {
  const ramenProject: RamenProject = project();
  const person = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  }).element;
  const duplicate = ramenProject.createAttribute(person.id, {
    name: 'label',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  assert.equal(duplicate.validation.valid, false);
  assert.ok(duplicate.validation.diagnostics.some((diagnostic) => diagnostic.code === 'ATTRIBUTE_NAME_SHADOWS_SUPERTYPE'));
});

interface AnnotationFixture {
  readonly model: GModel;
  readonly person: GNode;
  readonly annotation: GNode;
  readonly relation: GRelation;
  readonly baseRelationRef: string;
}

function annotationFixture(): AnnotationFixture {
  const ramenProject: RamenProject = project();
  const person = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  }).element;
  const annotation = ramenProject.createAnnotationType({ name: 'PersonName', typeValue: 'persName' }).element;
  const advisor: RamenAdvisor | undefined = ramenProject.createAdvisor();
  assert.ok(advisor);
  assert.deepEqual(
    advisor.suggestAnnotationTypes('editorialModel01').map((item) => item.typeValue),
    ['persName'],
  );
  const suggestion = advisor
    .suggestRelations('editorialModel01', annotation.id, person.id)
    .find((item) => item.name === 'REFERS_TO');
  assert.ok(suggestion);
  const relation = ramenProject.createRelation({
    refines: { modelId: suggestion.modelId, elementId: suggestion.relationId },
    fromNodeId: annotation.id,
    toNodeId: person.id,
    toBounds: { lowerBound: 1, upperBound: 1 },
  });
  assert.equal(relation.validation.valid, true, JSON.stringify(relation.validation.diagnostics));
  return { model: ramenProject.getModel(), person, annotation, relation: relation.element, baseRelationRef: suggestion.ref };
}

function annotationNodes(fixture: AnnotationFixture, typeValue: string): readonly ModelInstanceNode[] {
  return [
    {
      id: 'annotationInst01',
      typeId: fixture.annotation.id,
      properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: typeValue },
    },
    {
      id: 'personInstance01',
      typeId: fixture.person.id,
      properties: { uuid: '550e8400-e29b-41d4-a716-446655440000', label: 'Ada' },
    },
  ];
}

void test('models closed annotation types with required typed relations', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const result = new RamenInstanceValidator().validate(fixture.model.id, [fixture.model, RAMEN_MODEL], {
    modelId: fixture.model.id,
    nodes: annotationNodes(fixture, 'wrong'),
    relations: [],
  });
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_TYPE_MISMATCH'));
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'INSTANCE_CARDINALITY_INVALID'));
});

void test('rejects generic RAMEN relations for closed annotation types', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const result = new RamenInstanceValidator().validate(fixture.model.id, [fixture.model, RAMEN_MODEL], {
    modelId: fixture.model.id,
    nodes: annotationNodes(fixture, 'persName'),
    relations: [
      { id: 'genericRefers001', typeId: fixture.baseRelationRef, fromId: 'annotationInst01', toId: 'personInstance01' },
    ],
  });
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_DECLARED'));
});

void test('accepts a valid declared annotation relation', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const result = new RamenInstanceValidator().validate(fixture.model.id, [fixture.model, RAMEN_MODEL], {
    modelId: fixture.model.id,
    nodes: annotationNodes(fixture, 'persName'),
    relations: [{ id: 'refersInstance01', typeId: fixture.relation.id, fromId: 'annotationInst01', toId: 'personInstance01' }],
  });
  assert.deepEqual(result.diagnostics, []);
});

void test('rejects duplicate annotation type values', () => {
  const ramenProject: RamenProject = project();
  ramenProject.createAnnotationType({ name: 'PersonName', typeValue: 'name' });
  const duplicate = ramenProject.createAnnotationType({ name: 'PlaceName', typeValue: 'name' });
  assert.equal(duplicate.validation.valid, false);
  assert.ok(duplicate.validation.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_VALUE_DUPLICATE'));
});
