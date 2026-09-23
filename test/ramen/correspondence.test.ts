import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AnnotationRelationAdvice,
  AnnotationSuggestion,
  Node,
  NodeAdvice,
  NodeLineageItem,
  NodeRelationSuggestion,
  RamenAnnotation,
  RamenAdvisor,
  RamenProject,
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
  const advisor: RamenAdvisor | undefined = fixture.project.createAdvisor();

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

void test('suggests only the modeled relation of persName', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const advisor: RamenAdvisor | undefined = fixture.project.createAdvisor();

  assert.ok(advisor);
  const relations: readonly AnnotationRelationAdvice[] = advisor.suggestRelationsForAnnotation(
    CORRESPONDENCE_MODEL_ID,
    fixture.nodes.annotation.id,
    'persName',
  );

  assert.equal(relations.length, 1);
  assert.equal(relations[0]?.name, 'REFERS_TO');
  assert.equal(relations[0]?.targetName, 'Person');
  assert.deepEqual(relations[0]?.suggestedBounds, { lowerBound: 1, upperBound: 1 });
});

void test('suggests Letter above Witness and Text below Witness', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const advisor: RamenAdvisor | undefined = fixture.project.createAdvisor();

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
  const advisor: RamenAdvisor | undefined = scholarly.project.createAdvisor();

  assert.ok(advisor);
  assert.equal(scholarly.model.annotations.length, 1);
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
  const edition: RamenProject = scholarly.project.createNextLevel({
    uri: 'https://example.org/models/digital-edition',
    id: 'digitalEditionLevel01',
    name: 'Digital Edition',
    version: '1.0.0',
  });
  const annotation: Node = edition.createNode({
    name: 'EditionAnnotation',
    refines: { modelId: scholarly.model.id, elementId: scholarly.nodes.annotation.id },
  }).element;
  const advisor: RamenAdvisor | undefined = edition.createAdvisor();

  assert.ok(advisor);
  const types: readonly string[] = annotationTypes(advisor.suggestAnnotations(edition.getModel().id, annotation.id));
  assert.deepEqual(types, ['comment', 'date', 'externalReference', 'persName', 'placeName']);
  assert.equal(edition.getModels().length, 4);
});

function annotationTypes(suggestions: readonly AnnotationSuggestion[]): readonly string[] {
  return suggestions.map((annotation: AnnotationSuggestion): string => annotation.type).sort();
}
