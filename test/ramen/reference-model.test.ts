import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RAMEN_ANNOTATION_SCHEMA_URI,
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  RamenAnnotationSchemaValidator,
  RamenProject,
  createModelBundle,
  splitModelBundle,
} from '../../dist/index.js';
import type {
  CreateBundleResult,
  DataTypeSuggestion,
  GAttribute,
  GModel,
  GNode,
  NodeRefinementSuggestion,
  RamenAdvisor,
  RamenChange,
} from '../../dist/index.js';

function createProject(): RamenProject {
  return RamenProject.create({
    uri: 'https://example.org/models/editorial',
    id: 'editorialModel01',
    name: 'Editorial',
    version: '1.0.0',
  });
}

void test('publishes the RAMEN reference model and its reusable scalar types', (): void => {
  const names: readonly string[] = RAMEN_MODEL.classifiers
    .filter((classifier): boolean => classifier.kind === 'GDataType')
    .map((classifier): string => classifier.name);
  assert.deepEqual(names, ['UUID', 'Date', 'DateTime', 'URI', 'Email']);
});

void test('publishes a schema specifically for ext.ramen annotation definitions', (): void => {
  assert.equal(RamenAnnotationSchemaValidator.getSchemaNode().$id, RAMEN_ANNOTATION_SCHEMA_URI);
  assert.equal(RamenAnnotationSchemaValidator.isValid({ annotations: [] }), true);
  assert.equal(RamenAnnotationSchemaValidator.isValid({ annotations: [{ id: 'incomplete' }] }), false);
  assert.equal(RamenAnnotationSchemaValidator.isValid({ annotations: [], unknown: true }), false);
});

void test('creates nodes and attributes while validating every change', (): void => {
  const project: RamenProject = createProject();
  const person: RamenChange<GNode> = project.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  });
  const birthDate: RamenChange<GAttribute> = project.createAttribute(person.element.id, {
    name: 'birthDate',
    typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`,
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  assert.equal(person.validation.valid, true);
  assert.equal(birthDate.validation.valid, true);
});

void test('exposes refinements and data types through the consumer API', (): void => {
  const advisor: RamenAdvisor | undefined = createProject().createAdvisor();
  assert.ok(advisor);
  const nodeNames: readonly string[] = advisor
    .suggestNodeRefinements('editorialModel01')
    .map((item: NodeRefinementSuggestion): string => item.name);
  const dataTypeNames: readonly string[] = advisor
    .suggestDataTypes('editorialModel01')
    .map((item: DataTypeSuggestion): string => item.name);
  assert.deepEqual(nodeNames, ['Annotation', 'Collection', 'Content', 'Entity']);
  assert.ok(dataTypeNames.includes('String'));
  assert.ok(dataTypeNames.includes('DateTime'));
});

void test('keeps RAMEN extensions when a project is bundled and split', (): void => {
  const project: RamenProject = createProject();
  const annotation: GNode = project.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  project.createAnnotation({ annotationId: annotation.id, type: 'date' });
  const model: GModel = project.getModel();
  const result: CreateBundleResult = createModelBundle(model.id, [model, RAMEN_MODEL]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const restored: readonly GModel[] = splitModelBundle(result.bundle);
  const restoredProject: GModel | undefined = restored.find((item: GModel): boolean => item.id === model.id);
  assert.deepEqual(restoredProject?.ext?.ramen, model.ext?.ramen);
});
