import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel, RamenValidator } from '../../dist/index.js';
import type {
  Diagnostic,
  ModelInstanceGraph,
  Node,
  ProjectValidationResult,
  RamenModelDocument,
  Relation,
  RelationRefinementSuggestion,
} from '../../dist/index.js';

function project(): RamenModel {
  return RamenModel.create({ id: 'scopeProject010000', uri: 'https://example.org/scope', name: 'Scope', version: '1.0.0' });
}

function next(parent: RamenModel, id: string): RamenModel {
  return parent.createNextLevel({ id, uri: `https://example.org/${id}`, name: id, version: '1.0.0' });
}

void test('each level explicitly selects relations and cannot skip an empty intermediate level', (): void => {
  const first: RamenModel = project();
  const witness: Node = first.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const letter: Node = first.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const selected: Relation = first.partOf(witness, letter).element;
  const second: RamenModel = next(first, 'scopeSecond0100000');

  assert.equal(second.suggestRelations(witness.id, letter.id).length, 1);
  assert.deepEqual(
    second.createAdvisor().adviseNode(second.getModel().id, `${first.getModel().id}:${witness.id}`)?.relations,
    [],
  );
  const third: RamenModel = next(second, 'scopeThird01000000');
  assert.deepEqual(third.suggestRelations(witness.id, letter.id), []);
  assert.throws((): void => {
    third.partOf(witness, letter);
  }, /found 0/);

  const chosen: Relation = second.partOf(witness, letter).element;
  assert.deepEqual(chosen.superTypes, [`${first.getModel().id}:${selected.id}`]);
  assert.equal(second.validate().valid, true);
  assert.equal(next(second, 'scopeFourth0100000').suggestRelations(witness.id, letter.id).length, 1);
});

void test('a direct RAMEN import cannot restore an excluded project relation', (): void => {
  const first: RamenModel = project();
  const letter: Node = first.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const second: RamenModel = next(first, 'scopeBypass0100000');
  const base: Relation | undefined = RAMEN_MODEL.relations.find(
    (item: Relation): boolean =>
      item.name === 'PART_OF' && item.from.nodeId === RAMEN_ELEMENT.COLLECTION && item.to.nodeId === RAMEN_ELEMENT.COLLECTION,
  );
  assert.ok(base);

  const invalid: Relation = second.createRelation({ refines: base.id, fromNodeId: letter.id, toNodeId: letter.id }).element;
  const document: RamenModelDocument = second.getModel();
  const bypass: RamenModelDocument = {
    ...document,
    imports: [...document.imports, { modelId: RAMEN_MODEL.id, modelUri: RAMEN_MODEL.$id, version: RAMEN_MODEL.version }],
  };
  const result: ProjectValidationResult = new RamenValidator().validateProject(bypass.id, [...first.getModels(), bypass]);

  assert.equal(result.valid, false);
  assert.ok(
    result.diagnostics.some(
      (item: Diagnostic): boolean => item.code === 'RAMEN_RELATION_SCOPE_INVALID' && item.ref === invalid.id,
    ),
  );
  assert.equal(second.exportBundle().ok, false);
});

void test('data cannot use an ancestor relation without selecting it at the current level', (): void => {
  const first: RamenModel = project();
  const node: Node = first.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const relation: Relation = first.partOf(node, node).element;
  const second: RamenModel = next(first, 'scopeData010000000');
  const data: ModelInstanceGraph = {
    modelId: second.getModel().id,
    nodes: [{ id: 'scopeRecord0100000', typeId: `${first.getModel().id}:${node.id}`, properties: {} }],
    relations: [
      {
        id: 'scopeEdge010000000',
        typeId: `${first.getModel().id}:${relation.id}`,
        fromId: 'scopeRecord0100000',
        toId: 'scopeRecord0100000',
      },
    ],
  };
  const result: readonly Diagnostic[] = second.validateInstances(data).diagnostics;

  assert.ok(result.some((item: Diagnostic): boolean => item.code === 'INSTANCE_RELATION_TYPE_NOT_ALLOWED'));
  assert.deepEqual(
    second.suggestRelations(node.id, node.id).map((item: RelationRefinementSuggestion): string => item.relationId),
    [relation.id],
  );
});
