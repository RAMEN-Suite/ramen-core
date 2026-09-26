import assert from 'node:assert/strict';
import test from 'node:test';
import type { Diagnostic, EvolutionChange, Model, Node, Relation } from '../../dist/model/index.js';
import { RamenModel } from '../../dist/ramen/index.js';
import type { AnnotationSuggestion, RamenChange, RamenEvolutionReport, RelationSuggestion } from '../../dist/ramen/index.js';
import { createCorrespondenceFixture } from './fixtures.ts';
import type { CorrespondenceFixture } from './fixtures.ts';

void test('M05: model with selected suggestions, exchange the project and report a later edit', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const parentSnapshot: readonly Model[] = base.project.getModels();
  const edition: RamenModel = nextEdition(base.project);
  const text: Node = edition.createNode({ name: 'EditedText', refines: base.nodes.text.id }).element;
  const annotation: Node = edition.createNode({ name: 'EditorialAnnotation', refines: base.nodes.annotation.id }).element;

  const choices: readonly RelationSuggestion[] = edition.suggestRelations(text.id, annotation.id);
  const choice: RelationSuggestion | undefined = choices.find(
    (candidate: RelationSuggestion): boolean => candidate.relationId === base.relations.textAnnotation.id,
  );
  assert.ok(choice);

  const connection: RamenChange<Relation> = edition.connect(text, annotation, choice);
  assert.equal(connection.validation.valid, true, JSON.stringify(connection.validation.diagnostics));
  assert.deepEqual(connection.element.superTypes, [`${base.model.id}:${base.relations.textAnnotation.id}`]);
  assert.deepEqual(suggestedTypes(edition, text), ['comment', 'date', 'externalReference', 'persName', 'placeName']);

  const restored: RamenModel = roundTrip(edition);
  assert.deepEqual(suggestedTypes(restored, text), suggestedTypes(edition, text));
  assertRenameReported(edition, restored, text);
  assert.deepEqual(base.project.getModels(), parentSnapshot);
});

void test('M06: reject a widened relation, correct it and exchange the valid model', (): void => {
  const base: CorrespondenceFixture = createCorrespondenceFixture();
  const parentRelation: Relation = base.relations.witnessInLetter;
  const narrowed: RamenChange<Relation> = base.project.updateRelation(parentRelation.id, {
    to: { ...parentRelation.to, bounds: { lowerBound: 1, upperBound: 1 } },
  });
  assert.equal(narrowed.validation.valid, true);

  const parentSnapshot: readonly Model[] = base.project.getModels();
  const edition: RamenModel = nextEdition(base.project);
  const witness: Node = edition.createNode({ name: 'PhysicalWitness', refines: base.nodes.witness.id }).element;
  const letter: Node = edition.createNode({ name: 'EditedLetter', refines: base.nodes.letter.id }).element;
  const invalid: RamenChange<Relation> = edition.createRelation({
    refines: parentRelation.id,
    fromNodeId: witness.id,
    toNodeId: letter.id,
    toBounds: { lowerBound: 0, upperBound: -1 },
  });
  assert.equal(invalid.validation.valid, false);
  assert.ok(invalid.validation.diagnostics.some((item: Diagnostic): boolean => item.code === 'RELATION_BOUNDS_WIDENED'));
  assert.throws((): void => {
    edition.export();
  });

  const corrected: RamenChange<Relation> = edition.updateRelation(invalid.element.id, {
    to: { ...invalid.element.to, bounds: { lowerBound: 1, upperBound: 1 } },
  });
  assert.equal(corrected.validation.valid, true, JSON.stringify(corrected.validation.diagnostics));
  assert.equal(roundTrip(edition).validate().valid, true);
  assert.deepEqual(base.project.getModels(), parentSnapshot);
});

function nextEdition(base: RamenModel): RamenModel {
  return base.createNextLevel({
    id: 'scenarioEdition01',
    uri: 'https://example.org/models/scenario-edition',
    name: 'Edition',
    version: '1.0.0',
  });
}

function suggestedTypes(project: RamenModel, carrier: Node): readonly string[] {
  return project
    .createAdvisor()
    .suggestAnnotationsForNode(project.getModel().id, carrier.id)
    .map((suggestion: AnnotationSuggestion): string => suggestion.type)
    .sort();
}

function roundTrip(project: RamenModel): RamenModel {
  const json: string = JSON.stringify(project.export());
  const input: unknown = JSON.parse(json);
  const restored: RamenModel = RamenModel.import(input);

  assert.deepEqual(modelsById(restored), modelsById(project));
  assert.equal(restored.validate().valid, true);
  return restored;
}

function modelsById(project: RamenModel): ReadonlyMap<string, Model> {
  return new Map<string, Model>(project.getModels().map((model: Model): [string, Model] => [model.id, model]));
}

function assertRenameReported(before: RamenModel, after: RamenModel, node: Node): void {
  const snapshot: readonly Model[] = before.getModels();
  const edit: RamenChange<Node> = after.updateNode(node.id, { name: 'PublishedText' });
  const report: RamenEvolutionReport = before.compareTo(after);

  assert.equal(edit.validation.valid, true);
  assert.deepEqual(report.beforeDiagnostics, []);
  assert.deepEqual(report.afterDiagnostics, []);
  assert.deepEqual(report.annotationChanges, []);
  assert.equal(report.changes.length, 1);
  const change: EvolutionChange | undefined = report.changes[0];

  assert.equal(change?.element, 'node');
  assert.equal(change?.elementId, node.id);
  assert.equal(change?.action, 'changed');
  assert.deepEqual(before.getModels(), snapshot);
}
