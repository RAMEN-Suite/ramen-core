import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_MODEL, RamenInstanceValidator, RamenProject } from '../../dist/index.js';
import type {
  AnnotationAdvice,
  AnnotationPropertyAdvice,
  Classifier,
  Diagnostic,
  Model,
  ModelInstanceGraph,
  ProjectValidationResult,
  RamenAnnotation,
  RamenChange,
  ValidationResult,
} from '../../dist/index.js';
import { createCorrespondenceFixture } from './fixtures.ts';
import type { CorrespondenceFixture } from './fixtures.ts';

void test('stores five closed annotation definitions outside the model node list', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const annotations: readonly RamenAnnotation[] = fixture.project.getAnnotations();
  const types: readonly string[] = annotations.map((annotation: RamenAnnotation): string => annotation.type).sort();

  assert.equal(fixture.model.classifiers.filter((item: Classifier): boolean => item.kind === 'Node').length, 6);
  assert.deepEqual(types, ['comment', 'date', 'externalReference', 'persName', 'placeName']);
  assert.deepEqual(fixture.model.ext?.ramen, { annotations: annotations });
});

void test('advises selectable annotation properties and their cardinalities', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const advice: AnnotationAdvice | undefined = fixture.project
    .createAdvisor()
    ?.adviseAnnotation(fixture.model.id, fixture.nodes.annotation.id);

  assert.ok(advice);
  const url: AnnotationPropertyAdvice | undefined = advice.properties.find(
    (property: AnnotationPropertyAdvice): boolean => property.attributeId === fixture.url.id,
  );

  assert.ok(url);
  assert.deepEqual(url.cardinalityOptions, [
    { lowerBound: 0, upperBound: 1 },
    { lowerBound: 1, upperBound: 1 },
  ]);
});

void test('validates an annotation instance against its selected property set', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const invalidGraph: ModelInstanceGraph = annotationGraph(fixture, 'persName', { url: 'https://example.org' });
  const validGraph: ModelInstanceGraph = annotationGraph(fixture, 'externalReference', { url: 'https://example.org' });
  const invalid: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], invalidGraph);
  const valid: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], validGraph);

  assert.ok(
    invalid.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED',
    ),
  );
  assert.deepEqual(valid.diagnostics, []);
});

void test('rejects duplicate types and implicit replacement of inherited definitions', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const duplicate: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: fixture.nodes.annotation.id,
    type: 'persName',
  });

  assert.ok(
    duplicate.validation.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_DUPLICATE',
    ),
  );

  const child: RamenProject = fixture.project.createNextLevel({
    uri: 'https://example.org/models/implicit-replacement',
    id: 'implicitReplacement01',
    name: 'Implicit Replacement',
    version: '1.0.0',
  });
  const annotationId: string = child.createNode({
    name: 'DetailedAnnotation',
    refines: { modelId: fixture.model.id, elementId: fixture.nodes.annotation.id },
  }).element.id;
  const replacement: RamenChange<RamenAnnotation> = child.createAnnotation({ annotationId: annotationId, type: 'persName' });

  assert.ok(
    replacement.validation.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATION_REFINEMENT_REQUIRED',
    ),
  );
});

void test('rejects a malformed serialized annotation extension', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const malformed: Model = { ...fixture.model, ext: { ramen: { annotations: [{ id: 'incomplete' }] } } };
  const result: ProjectValidationResult = RamenProject.load(malformed).validate();
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATIONS_INVALID'));
});

function annotationGraph(
  fixture: CorrespondenceFixture,
  type: string,
  extra: Readonly<Record<string, unknown>>,
): ModelInstanceGraph {
  return {
    modelId: fixture.model.id,
    nodes: [
      {
        id: 'annotationInstance01',
        typeId: fixture.nodes.annotation.id,
        properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: type, ...extra },
      },
    ],
    relations: [],
  };
}
