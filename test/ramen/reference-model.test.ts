import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RAMEN_ANNOTATION_SCHEMA_URI,
  RAMEN_BUNDLE_SCHEMA_URI,
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  RAMEN_MODEL_URI,
  RAMEN_PROJECT_SCHEMA_URI,
  ModelSchemaValidator,
  RamenAnnotationSchemaValidator,
  RamenModel,
  RamenProjectSchemaValidator,
  createRamenBundle,
  splitRamenBundle,
} from '../../dist/index.js';
import type {
  CreateRamenBundleResult,
  DataTypeSuggestion,
  Attribute,
  Classifier,
  Model,
  Node,
  NodeRefinementSuggestion,
  RamenAdvisor,
  RamenChange,
  RamenModelDocument,
} from '../../dist/index.js';

function createProject(): RamenModel {
  return RamenModel.create({
    uri: 'https://example.org/models/editorial',
    id: 'editorialModel01',
    name: 'Editorial',
    version: '1.0.0',
  });
}

void test('publishes the RAMEN reference model and its reusable scalar types', (): void => {
  const names: readonly string[] = RAMEN_MODEL.classifiers
    .filter((classifier: Classifier): boolean => classifier.kind === 'DataType')
    .map((classifier: Classifier): string => classifier.name);

  assert.deepEqual(names, ['UUID', 'Date', 'DateTime', 'URI', 'Email']);
  assert.equal(RAMEN_MODEL.$id, RAMEN_MODEL_URI);
});

void test('publishes a schema for RAMEN annotation definitions', (): void => {
  assert.equal(RamenAnnotationSchemaValidator.getSchemaNode().$id, RAMEN_ANNOTATION_SCHEMA_URI);
  assert.equal(RamenAnnotationSchemaValidator.isValid({ annotations: [] }), true);
  assert.equal(RamenAnnotationSchemaValidator.isValid({ annotations: [{ id: 'incomplete' }] }), false);
  assert.equal(RamenAnnotationSchemaValidator.isValid({ annotations: [], unknown: true }), false);
});

void test('validates first-class annotations with the RAMEN project schema', (): void => {
  const project: RamenModel = createProject();
  const model: RamenModelDocument = project.getModel();
  const legacy: unknown = { ...model, ext: { ramen: { annotations: [] } } };
  const missing: unknown = { ...model, annotations: undefined };

  assert.equal(RamenProjectSchemaValidator.getSchemaNode().$id, RAMEN_PROJECT_SCHEMA_URI);
  assert.equal(RamenProjectSchemaValidator.isValid(model), true);
  assert.equal(ModelSchemaValidator.isValid(model), false);
  assert.equal(RamenProjectSchemaValidator.isValid(legacy), false);
  assert.equal(RamenProjectSchemaValidator.isValid(missing), false);
  assert.deepEqual(model.annotations, []);
});

void test('creates nodes and attributes while validating every change', (): void => {
  const project: RamenModel = createProject();
  const person: RamenChange<Node> = project.createNode({
    name: 'Person',
    refines: RAMEN_ELEMENT.ENTITY,
  });
  const birthDate: RamenChange<Attribute> = project.createAttribute(person.element.id, {
    name: 'birthDate',
    typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`,
    bounds: { lowerBound: 0, upperBound: 1 },
  });

  assert.equal(person.validation.valid, true);
  assert.equal(birthDate.validation.valid, true);
});

void test('exposes refinements and data types through the consumer API', (): void => {
  const advisor: RamenAdvisor = createProject().createAdvisor();
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

void test('keeps first-class annotations when a project is bundled and split', (): void => {
  const project: RamenModel = createProject();
  const annotation: Node = project.createNode({
    name: 'TextAnnotation',
    refines: RAMEN_ELEMENT.ANNOTATION,
  }).element;

  project.createAnnotation({ annotationId: annotation.id, type: 'date' });
  const model: RamenModelDocument = project.getModel();
  const result: CreateRamenBundleResult = createRamenBundle(model.id, [model, RAMEN_MODEL]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bundle.$schema, RAMEN_BUNDLE_SCHEMA_URI);
  assert.equal(result.bundle.kind, 'RamenModelBundle');
  assert.equal(result.bundle.models.length, 2);

  const restored: readonly Model[] = splitRamenBundle(result.bundle);
  const restoredProject: Model | undefined = restored.find((item: Model): boolean => item.id === model.id);
  assert.deepEqual((restoredProject as RamenModelDocument | undefined)?.annotations, model.annotations);
  assert.equal(restoredProject?.ext?.ramen, undefined);
});
