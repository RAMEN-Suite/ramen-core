import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelEvolution } from '../../dist/ramen-core/index.js';
import type { Attribute, Diagnostic, EvolutionChange, EvolutionReport, Model, Node } from '../../dist/ramen-core/index.js';
import { attribute, model, node } from '../models.ts';

void test('reports model evolution at stable element identities without mutating either state', (): void => {
  const before: Model = model('evolutionModel001');
  const person: Node = node('personNode000001', 'Person');
  person.attributes.push(attribute('personName000001', 'name', 'String'));
  before.classifiers.push(person);

  const after: Model = structuredClone(before);
  const refined: Node = after.classifiers[0] as Node;
  const preferredName: Attribute | undefined = refined.attributes[0];

  assert.ok(preferredName);
  refined.name = 'HistoricalPerson';
  preferredName.name = 'preferredName';
  refined.attributes.push(attribute('personDate000001', 'birthDate', 'String'));
  after.classifiers.push(node('placeNode0000001', 'Place'));
  const snapshot: Model = structuredClone(after);

  const report: EvolutionReport = ModelEvolution.compare(before.id, [before], after.id, [after]);
  const changes: readonly Pick<EvolutionChange, 'action' | 'element' | 'elementId'>[] = report.changes.map(
    (change: EvolutionChange): Pick<EvolutionChange, 'action' | 'element' | 'elementId'> => ({
      action: change.action,
      element: change.element,
      elementId: change.elementId,
    }),
  );

  assert.deepEqual(changes, [
    { action: 'added', element: 'attribute', elementId: 'personDate000001' },
    { action: 'changed', element: 'attribute', elementId: 'personName000001' },
    { action: 'changed', element: 'node', elementId: 'personNode000001' },
    { action: 'added', element: 'node', elementId: 'placeNode0000001' },
  ]);
  assert.deepEqual(before.classifiers[0], person);
  assert.deepEqual(after, snapshot);
  assert.deepEqual(report.beforeDiagnostics, []);
  assert.deepEqual(report.afterDiagnostics, []);
});

void test('reports removed elements and validation findings in the new state', (): void => {
  const before: Model = model('evolutionModel002');
  before.classifiers.push(node('personNode000002', 'Person'));

  const after: Model = structuredClone(before);
  after.classifiers = [];
  after.imports.push({ modelId: 'missingModel0001', modelUri: 'https://example.org/missing', version: '1.0.0' });
  const report: EvolutionReport = ModelEvolution.compare(before.id, [before], after.id, [after]);

  assert.equal(
    report.changes.some((change: EvolutionChange): boolean => change.action === 'removed'),
    true,
  );
  assert.equal(
    report.afterDiagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'IMPORTED_MODEL_NOT_FOUND'),
    true,
  );
});

void test('ignores JSON object key order while comparing unchanged elements', (): void => {
  const before: Model = model('evolutionModel003');
  before.classifiers.push(node('personNode000003', 'Person'));

  const after: Model = structuredClone(before);
  after.ext = { second: true, first: true };
  before.ext = { first: true, second: true };
  const report: EvolutionReport = ModelEvolution.compare(before.id, [before], after.id, [after]);

  assert.deepEqual(report.changes, []);
});

void test('moving an unchanged attribute to another node is an observable change', (): void => {
  const before: Model = model('movingModel00001');
  const left: Node = node('movingLeft000001', 'Left');
  const right: Node = node('movingRight00001', 'Right');
  const title: Attribute = attribute('movingTitle00001', 'title', 'String');
  left.attributes.push(title);
  before.classifiers.push(left, right);

  const after: Model = structuredClone(before);
  (after.classifiers[0] as Node).attributes = [];
  (after.classifiers[1] as Node).attributes = [structuredClone(title)];
  const changes: readonly EvolutionChange[] = ModelEvolution.compareChanges([before], [after]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.elementId, title.id);
  assert.equal(changes[0]?.ownerId, right.id);
  assert.equal(changes[0]?.action, 'changed');
});

void test('JSON comparison preserves ordinary __proto__ keys from parsed documents', (): void => {
  const left: unknown = JSON.parse('{"__proto__":{"label":"before"}}');
  const right: unknown = JSON.parse('{"__proto__":{"label":"after"}}');
  assert.equal(ModelEvolution.sameJson(left, right), false);
  assert.equal(ModelEvolution.sameJson(left, JSON.parse(JSON.stringify(left)) as unknown), true);
});
