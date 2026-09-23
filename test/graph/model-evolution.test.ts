import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelEvolution } from '../../dist/index.js';
import type { Attribute, Diagnostic, EvolutionChange, EvolutionReport, Model, Node } from '../../dist/index.js';
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
