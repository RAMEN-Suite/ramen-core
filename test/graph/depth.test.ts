import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectGraph, ModelRelationScope } from '../../dist/model/index.js';
import type { Model, Node, Relation, ProjectGraphResult, Id, Ref } from '../../dist/model/index.js';
import { model, node, relation } from '../models.ts';

function identifier(index: number): string {
  return `depth${String(index).padStart(12, '0')}`;
}

void test('12000 imports and a deep import cycle are checked without recursive calls', (): void => {
  const models: Model[] = [];
  for (let index: number = 0; index < 12000; index += 1) {
    const previous: Model | undefined = models.at(-1);
    models.push(model(identifier(index), previous ? [previous] : []));
  }
  const root: Model | undefined = models.at(-1);
  const first: Model | undefined = models[0];
  assert.ok(root && first);
  const valid: ProjectGraphResult = buildProjectGraph({ rootModelId: root.id, models });
  assert.equal(valid.ok, true);

  first.imports.push({ modelId: root.id, modelUri: root.$id, version: root.version });
  const cyclic: ProjectGraphResult = buildProjectGraph({ rootModelId: root.id, models });
  assert.equal(cyclic.ok, false);
  assert.equal(cyclic.diagnostics[0]?.code, 'IMPORT_CYCLE');
});

void test('12000 node and relation refinements detect deep cycles without recursive calls', (): void => {
  const source: Model = model('deepRefinements1');
  const nodes: Node[] = [];
  const relations: Relation[] = [];
  for (let index: number = 0; index < 12000; index += 1) {
    const current: Node = node(identifier(index), 'Document', index < 11999 ? [identifier(index + 1)] : []);
    const link: Relation = relation(`link${identifier(index)}`, 'NEXT', current.id, current.id);
    if (index < 11999) link.superTypes = [`link${identifier(index + 1)}`];
    nodes.push(current);
    relations.push(link);
  }
  source.classifiers = nodes;
  source.relations = relations;
  assert.equal(buildProjectGraph({ rootModelId: source.id, models: [source] }).ok, true);

  const lastNode: Node | undefined = nodes.at(-1);
  const lastRelation: Relation | undefined = relations.at(-1);
  assert.ok(lastNode && lastRelation);
  lastNode.superTypes = [identifier(0)];
  lastRelation.superTypes = [`link${identifier(0)}`];
  const cyclic: ProjectGraphResult = buildProjectGraph({ rootModelId: source.id, models: [source] });
  assert.equal(cyclic.ok, false);
  assert.equal(cyclic.diagnostics.length, 2);
  for (const diagnostic of cyclic.diagnostics) assert.equal(diagnostic.code, 'INHERITANCE_CYCLE');
});

void test('12000 explicit relation selections resolve iteratively and cannot restore an omitted predecessor selection', (): void => {
  const base: Model = model('relationDepth001');
  base.classifiers.push(node('relationNode0001', 'Document'));
  base.relations.push(relation('relationEdge0001', 'NEXT', 'relationNode0001', 'relationNode0001'));
  const models: Model[] = [base];
  const selections: Map<Id, readonly Ref[]> = new Map<Id, readonly Ref[]>();
  const reference: Ref = `${base.id}:relationEdge0001`;
  for (let index: number = 0; index < 12000; index += 1) {
    const previous: Model | undefined = models.at(-1);
    assert.ok(previous);
    const current: Model = model(identifier(index), [previous]);
    selections.set(current.id, [reference]);
    models.push(current);
  }
  const root: Model | undefined = models.at(-1);
  assert.ok(root);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: root.id, models });
  assert.ok(result.ok);
  const scope: ModelRelationScope = new ModelRelationScope(result.graph, selections);
  assert.equal(scope.available(root.id).length, 1);
  assert.equal(scope.allowsBase(root.id, reference), true);

  selections.delete(identifier(6000));
  const restricted: ModelRelationScope = new ModelRelationScope(result.graph, selections);
  assert.equal(restricted.available(root.id).length, 0);
  assert.equal(restricted.allowsBase(root.id, reference), false);
});
