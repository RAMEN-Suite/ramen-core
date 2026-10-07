import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  type DataType,
  type Diagnostic,
  type EvolutionReport,
  type Model,
  type Node,
} from '@ramen-suite/core/model';

void test('workspace comparison reports isolated import cycles alongside valid model branches', (): void => {
  const leaf: Model = Modeller.create('Independent').getModel();
  const first: Model = Modeller.create('First').getModel();
  const second: Model = Modeller.create('Second').getModel();

  first.imports = [{ modelId: second.id, modelUri: second.$id, version: second.version }];
  second.imports = [{ modelId: first.id, modelUri: first.$id, version: first.version }];

  const workspace: Modeller = Modeller.load(leaf, [first, second]);
  const report: EvolutionReport = workspace.snapshot().compareTo(workspace);

  assert.equal(workspace.validate().valid, true);
  assert.deepEqual(report.changes, []);
  assert.ok(report.beforeDiagnostics.some((item: Diagnostic): boolean => item.code === 'IMPORT_CYCLE'));
  assert.ok(report.afterDiagnostics.some((item: Diagnostic): boolean => item.code === 'IMPORT_CYCLE'));
});

void test('workspace comparison reports shared dependency errors once across sibling branches', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const status: DataType = base.createDataType({ name: 'Status', baseType: DataTypes.String }).element;

  base.createAttribute(document, { name: 'status', type: status });
  base.createNextLevel('Website');
  base.createNextLevel('Edition');
  const before: Modeller = base.snapshot();

  base.removeDataType(status.id);
  const report: EvolutionReport = before.compareTo(base);
  const errors: readonly Diagnostic[] = report.afterDiagnostics.filter(
    (item: Diagnostic): boolean => item.code === 'ELEMENT_REFERENCE_NOT_FOUND',
  );

  assert.deepEqual(report.beforeDiagnostics, []);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.ref, status.id);
});
