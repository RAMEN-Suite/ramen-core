import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ModelValidator,
  Modeller,
  type Diagnostic,
  type Model,
  type Node,
  type ProjectValidationResult,
} from '@ramen-suite/core/model';

void test('a changed import version is reported at the import reference', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const next: Modeller = base.createNextLevel('Website');
  next.createNode({ name: 'Page', refines: document });

  const changed: Model = { ...base.getModel(), version: '2.0.0' };
  const result: ProjectValidationResult = new ModelValidator().validateProject(next.getModel().id, [next.getModel(), changed]);

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'IMPORTED_VERSION_MISMATCH'));
});

void test('an inheritance cycle is found without exposing an unsafe project graph', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const first: Node = model.createNode('First').element;
  const second: Node = model.createNode({ name: 'Second', refines: first }).element;

  model.updateNode(first.id, { superTypes: [second.id] });
  const result: ProjectValidationResult = model.validate();

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'INHERITANCE_CYCLE'));
  assert.equal('graph' in result, false);
});

void test('duplicate IDs in different declaration kinds are rejected', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const raw: Model = model.getModel();

  raw.classifiers.push({ kind: 'DataType', id: document.id, name: 'Duplicate', baseType: 'String' });
  const result: ProjectValidationResult = new ModelValidator().validateProject(raw.id, [raw]);

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'DUPLICATE_ELEMENT_ID'));
});
