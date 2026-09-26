import assert from 'node:assert/strict';
import test from 'node:test';
import { RamenModel } from '../../dist/index.js';
import type {
  RelationAdvice,
  AnnotationSuggestion,
  CreateRamenBundleResult,
  Diagnostic,
  Import,
  ModelInstanceGraph,
  Node,
  NodeAdvice,
  NodeLineageItem,
  NodeRelationSuggestion,
  RamenAnnotation,
  RamenAdvisor,
  ValidationResult,
} from '../../dist/index.js';
import { CORRESPONDENCE_MODEL_ID, SCHOLARLY_MODEL_ID, createCorrespondenceFixture, createScholarlyFixture } from './fixtures.ts';
import type { CorrespondenceFixture, ScholarlyFixture } from './fixtures.ts';

void test('creates and validates a Correspondence model with Letter, Witness, and five annotations', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  assert.equal(fixture.project.validate().valid, true);
  assert.deepEqual(
    fixture.project.getAnnotations().map((annotation: RamenAnnotation): string => annotation.type),
    ['persName', 'placeName', 'date', 'comment', 'externalReference'],
  );
});

void test('suggests all attachable annotations for Text and Person', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const advisor: RamenAdvisor = fixture.project.createAdvisor();

  assert.ok(advisor);
  const text: readonly string[] = annotationTypes(
    advisor.suggestAnnotationsForNode(CORRESPONDENCE_MODEL_ID, fixture.nodes.text.id),
  );
  const person: readonly string[] = annotationTypes(
    advisor.suggestAnnotationsForNode(CORRESPONDENCE_MODEL_ID, fixture.nodes.person.id),
  );
  const expected: readonly string[] = ['comment', 'date', 'externalReference', 'persName', 'placeName'];

  assert.deepEqual(text, expected);
  assert.deepEqual(person, expected);
});

void test('suggests the modeled attachment and target relations of persName', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const advisor: RamenAdvisor = fixture.project.createAdvisor();

  assert.ok(advisor);
  const relations: readonly RelationAdvice[] = advisor.suggestRelationsForAnnotation(
    CORRESPONDENCE_MODEL_ID,
    fixture.nodes.annotation.id,
    'persName',
  );

  assert.equal(relations.length, 3);
  const target: RelationAdvice | undefined = relations.find(
    (relation: RelationAdvice): boolean => relation.direction === 'outgoing',
  );

  assert.equal(target?.name, 'REFERS_TO');
  assert.equal(target?.targetName, 'Person');
  assert.deepEqual(target?.suggestedBounds, { lowerBound: 1, upperBound: 1 });
});

void test('suggests Letter above Witness and Text below Witness', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const advisor: RamenAdvisor = fixture.project.createAdvisor();

  assert.ok(advisor);
  const connections: readonly NodeRelationSuggestion[] = advisor.suggestConnections(
    CORRESPONDENCE_MODEL_ID,
    fixture.nodes.witness.id,
  );

  assert.ok(
    connections.some(
      (relation: NodeRelationSuggestion): boolean =>
        relation.direction === 'outgoing' && relation.compatibleTargetNodeIds.includes(fixture.nodes.letter.id),
    ),
  );
  assert.ok(
    connections.some(
      (relation: NodeRelationSuggestion): boolean =>
        relation.direction === 'incoming' && relation.compatibleTargetNodeIds.includes(fixture.nodes.text.id),
    ),
  );
});

void test('refines the complete Correspondence model at another level', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const scholarly: ScholarlyFixture = createScholarlyFixture(base);
  const advisor: RamenAdvisor = scholarly.project.createAdvisor();

  assert.ok(advisor);
  assert.deepEqual(
    scholarly.model.imports.map((item: Import): string => item.modelId),
    [base.model.id],
  );
  assert.equal(scholarly.model.annotations.length, 0);
  assert.equal(scholarly.project.suggestAnnotations(base.nodes.annotation.id).length, 5);
  const annotations: readonly string[] = annotationTypes(
    advisor.suggestAnnotations(SCHOLARLY_MODEL_ID, scholarly.nodes.annotation.id),
  );
  const witness: NodeAdvice | undefined = advisor.adviseNode(SCHOLARLY_MODEL_ID, scholarly.nodes.witness.id);

  assert.deepEqual(annotations, ['comment', 'date', 'externalReference', 'persName', 'placeName']);
  assert.deepEqual(
    witness?.lineage.map((item: NodeLineageItem): string => item.name),
    ['Collection', 'Witness', 'PhysicalWitness'],
  );
  assert.ok(
    witness?.relations.some(
      (relation: NodeRelationSuggestion): boolean =>
        relation.direction === 'outgoing' && relation.compatibleTargetNodeIds.includes(scholarly.nodes.letter.id),
    ),
  );
});

void test('retains annotation semantics through an arbitrary third project level', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const scholarly: ScholarlyFixture = createScholarlyFixture(base);
  const edition: RamenModel = scholarly.project.createNextLevel({
    uri: 'https://example.org/models/digital-edition',
    id: 'digitalEditionLevel01',
    name: 'Digital Edition',
    version: '1.0.0',
  });
  const annotation: Node = edition.createNode({
    name: 'EditionAnnotation',
    refines: { modelId: scholarly.model.id, elementId: scholarly.nodes.annotation.id },
  }).element;
  const advisor: RamenAdvisor = edition.createAdvisor();

  assert.ok(advisor);
  const types: readonly string[] = annotationTypes(advisor.suggestAnnotations(edition.getModel().id, annotation.id));
  assert.deepEqual(types, ['comment', 'date', 'externalReference', 'persName', 'placeName']);
  assert.equal(edition.getModels().length, 4);
});

void test('serializes three model levels and validates data after importing the bundle', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const scholarly: ScholarlyFixture = createScholarlyFixture(base);
  const edition: RamenModel = scholarly.project.createNextLevel({
    uri: 'https://example.org/models/edition-roundtrip',
    id: 'editionRoundtrip01',
    name: 'Edition Roundtrip',
    version: '1.0.0',
  });
  const annotation: Node = edition.createNode({
    name: 'EditionAnnotation',
    refines: { modelId: scholarly.model.id, elementId: scholarly.nodes.annotation.id },
  }).element;
  const exported: CreateRamenBundleResult = edition.exportBundle();

  assert.equal(exported.ok, true);
  if (!exported.ok) return;

  const serialized: string = JSON.stringify(exported.bundle);
  const parsed: unknown = JSON.parse(serialized);
  const restored: RamenModel = RamenModel.importBundle(parsed);
  const data: ModelInstanceGraph = editionAnnotationData(restored.getModel().id, annotation.id);
  const valid: ValidationResult = restored.validateInstances(data);
  const invalid: ValidationResult = restored.validateInstances({
    ...data,
    nodes: [{ ...data.nodes[0], properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: 'missing' } }],
  });

  assert.equal(restored.getModels().length, 4);
  assert.equal(restored.createAdvisor().suggestAnnotations(restored.getModel().id, annotation.id).length, 5);
  assert.deepEqual(valid.diagnostics, []);
  assert.ok(
    invalid.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_UNKNOWN'),
  );
});

function editionAnnotationData(modelId: string, annotationId: string): ModelInstanceGraph {
  return {
    modelId: modelId,
    nodes: [
      {
        id: 'editionAnnotation1',
        typeId: annotationId,
        properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: 'date' },
      },
    ],
    relations: [],
  };
}

function annotationTypes(suggestions: readonly AnnotationSuggestion[]): readonly string[] {
  return suggestions.map((annotation: AnnotationSuggestion): string => annotation.type).sort();
}
