import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, Diagnostics, RAMEN_MODEL, RamenInstanceValidator, RamenModel } from '../../dist/index.js';
import type {
  AnnotationAdvice,
  AnnotationPropertyAdvice,
  Classifier,
  Constraint,
  ConstraintContext,
  Diagnostic,
  ModelInstanceGraph,
  ProjectValidationResult,
  RamenAnnotation,
  RamenChange,
  RamenModelDocument,
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
  assert.deepEqual(fixture.model.annotations, annotations);
});

void test('advises selectable annotation properties and their cardinalities', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const advice: AnnotationAdvice | undefined = fixture.project
    .createAdvisor()
    .adviseAnnotation(fixture.model.id, fixture.nodes.annotation.id);

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

void test('evaluates a registered project constraint language on annotation data', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const constraint: Constraint = {
    id: 'archiveUrlRule01',
    name: 'Archive URL',
    language: 'https://example.org/constraints/prefix/1',
    expression: 'https://archives.example/',
  };
  fixture.project.updateAttribute(fixture.nodes.annotation.id, fixture.url.id, { constraints: [constraint] });

  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  registry.register({
    language: constraint.language,
    evaluate(rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
      if (typeof context.value === 'string' && typeof rule.expression === 'string' && context.value.startsWith(rule.expression))
        return [];
      return [Diagnostics.error({ code: 'ARCHIVE_URL_REQUIRED', message: 'Expected an archive URL.', path: context.path })];
    },
  });

  const validator: RamenInstanceValidator = RamenInstanceValidator.withConstraints(registry);
  const graph: ModelInstanceGraph = annotationGraph(fixture, 'externalReference', { url: 'https://example.org/record' });
  const result: ValidationResult = validator.validate(fixture.model.id, fixture.project.getModels(), graph);
  const acceptedGraph: ModelInstanceGraph = annotationGraph(fixture, 'externalReference', {
    url: 'https://archives.example/record',
  });
  const accepted: ValidationResult = validator.validate(fixture.model.id, fixture.project.getModels(), acceptedGraph);

  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'ARCHIVE_URL_REQUIRED'));
  assert.deepEqual(accepted.diagnostics, []);
});

void test('requires the modeled person relation for a persName annotation', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const missing: ModelInstanceGraph = annotationGraph(fixture, 'persName', {});
  const result: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], missing);

  assert.equal(result.hasErrors, true);
  assert.ok(
    result.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY',
    ),
  );
});

void test('accepts one modeled person relation and rejects another annotation relation', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const valid: ModelInstanceGraph = personAnnotationGraph(fixture);
  const accepted: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], valid);

  assert.deepEqual(accepted.diagnostics, []);

  const annotationId: string = valid.nodes[0]?.id ?? '';
  const personId: string = valid.nodes[1]?.id ?? '';
  const invalid: ModelInstanceGraph = {
    ...valid,
    relations: [
      ...valid.relations,
      {
        id: 'hasAnnotation0001',
        typeId: fixture.relations.personAnnotation.id,
        fromId: personId,
        toId: annotationId,
      },
    ],
  };
  const rejected: ValidationResult = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], invalid);

  assert.ok(
    rejected.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_NOT_ALLOWED',
    ),
  );
});

function personAnnotationGraph(fixture: CorrespondenceFixture): ModelInstanceGraph {
  const base: ModelInstanceGraph = annotationGraph(fixture, 'persName', {});
  const person: ModelInstanceGraph['nodes'][number] = {
    id: 'personInstance001',
    typeId: fixture.nodes.person.id,
    properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', label: 'Ada' },
  };
  return {
    ...base,
    nodes: [...base.nodes, person],
    relations: [
      {
        id: 'refersPerson0001',
        typeId: fixture.relations.refersPerson.id,
        fromId: base.nodes[0]?.id ?? '',
        toId: person.id,
      },
    ],
  };
}

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

  const child: RamenModel = fixture.project.createNextLevel({
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

void test('rejects malformed project annotation definitions', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const malformed: RamenModelDocument = {
    ...fixture.model,
    annotations: [{ id: 'incomplete' }],
  } as unknown as RamenModelDocument;
  const result: ProjectValidationResult = RamenModel.load(malformed).validate();
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
