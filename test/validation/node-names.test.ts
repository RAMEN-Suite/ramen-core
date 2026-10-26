import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller, type Diagnostic, type ModelFile, type Node, type Relation } from '@ramen-suite/core/model';

void test('local node names are unique for independent nodes and refinements', (): void => {
  for (const refine of [false, true]) {
    const model: Modeller = Modeller.create('Names');
    const base: Node = model.createNode('Document').element;
    const duplicate: Node = model.createNode({ name: 'Document', ...(refine ? { refines: base } : {}) }).element;
    const findings: readonly Diagnostic[] = model.validate().diagnostics;

    assert.equal(model.validate().valid, false);
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.code, 'NODE_NAME_DUPLICATE');
    assert.equal(findings[0]?.severity, 'error');
    assert.equal(findings[0]?.ref, duplicate.id);
    assert.equal(findings[0]?.path, `/models/${model.getModel().id}/classifiers/1/name`);

    model.updateNode(duplicate.id, { name: 'Letter' });
    assert.equal(model.validate().valid, true);
    model.updateNode(duplicate.id, { name: 'Document' });
    assert.equal(model.validate().valid, false);
  }
});

void test('names remain independent across models and classifier kinds', (): void => {
  const base: Modeller = Modeller.create('Base');
  const document: Node = base.createNode('Document').element;
  base.createDataType({ name: 'Document', baseType: DataTypes.String });

  const next: Modeller = base.createNextLevel('Next');
  next.createNode({ name: 'Document', refines: document });

  assert.equal(next.validate().valid, true);
  assert.equal(Modeller.import(next.export()).validate().valid, true);

  next.createNode({ name: 'Document', refines: document });
  assert.equal(next.validate().diagnostics[0]?.code, 'NODE_NAME_DUPLICATE');
});

void test('import rejects duplicate node names introduced in an otherwise valid file', (): void => {
  const model: Modeller = Modeller.create('Names');
  model.createNode('Document');
  const letter: Node = model.createNode('Letter').element;

  const file: ModelFile = model.export();
  const duplicate: ModelFile = {
    ...file,
    classifiers: file.classifiers.map((item: ModelFile['classifiers'][number]): ModelFile['classifiers'][number] =>
      item.id === letter.id ? { ...item, name: 'Document' } : item,
    ),
  };

  assert.throws((): Modeller => Modeller.import(duplicate), /Node name 'Document' refers to different nodes/);
});

void test('using an imported relation endpoint conflicts with a same-named local refinement', (): void => {
  const base: Modeller = Modeller.create('Base');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const relation: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;

  const next: Modeller = base.createNextLevel('Next');
  const refined: Node = next.createNode({ name: 'Document', refines: document }).element;
  assert.equal(next.validate().valid, true);

  const use: Relation = next.createRelation({ refines: relation, from: { node: document }, to: { node: folder } }).element;
  const finding: Diagnostic | undefined = next
    .validate()
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'NODE_NAME_DUPLICATE');
  assert.equal(finding?.ref, use.id);
  assert.equal(finding?.path, `/models/${next.getModel().id}/relations/0/from/nodeId`);

  next.updateNode(refined.id, { name: 'Letter' });
  assert.equal(next.validate().valid, true);
});
