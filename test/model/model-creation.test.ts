import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFactory, RAMEN_MODEL, ModelRef, ModelSchemaValidator } from '../../dist/index.js';
import type { Attribute, DataType, Literal, Model, Node, Relation, RelationEnd } from '../../dist/index.js';

const projectInput: { uri: string; id: string; name: string; version: string } = {
  uri: 'https://example.org/project',
  id: 'project-model-id',
  name: 'Example project',
  version: '1.0.0',
};

void test('createModel creates an empty model that imports its base model', () => {
  const model: Model = ModelFactory.createModel(RAMEN_MODEL, projectInput);

  assert.equal(model.id, projectInput.id);
  assert.deepEqual(model.classifiers, []);
  assert.deepEqual(model.relations, []);
  assert.equal(model.imports[0]?.modelId, RAMEN_MODEL.id);
  assert.equal(ModelSchemaValidator.isValid(model), true);
});

void test('createNode creates a node with a qualified base reference', () => {
  const node: Node = ModelFactory.createNode(RAMEN_MODEL.id, {
    name: 'Document',
    baseNodeId: 'abcdefghijklmnop',
  });

  assert.equal(node.kind, 'Node');
  assert.equal(node.name, 'Document');
  assert.deepEqual(node.superTypes, [ModelRef.qualify(RAMEN_MODEL.id, 'abcdefghijklmnop')]);
  assert.equal(node.id.length, 16);
  assert.deepEqual(node.attributes, []);
});

void test('createAttribute preserves type, bounds and modifiers', () => {
  const attribute: Attribute = ModelFactory.createAttribute({
    name: 'title',
    typeId: 'String',
    bounds: { lowerBound: 1, upperBound: 1 },
    isUnique: true,
  });

  assert.equal(attribute.typeId, 'String');
  assert.deepEqual(attribute.bounds, { lowerBound: 1, upperBound: 1 });
  assert.equal(attribute.isUnique, true);
});

void test('createDataType creates an empty custom data type', () => {
  const dataType: DataType = ModelFactory.createDataType({ name: 'EditorialStatus', baseType: 'String' });

  assert.equal(dataType.kind, 'DataType');
  assert.equal(dataType.baseType, 'String');
  assert.equal(dataType.name, 'EditorialStatus');
  assert.equal(dataType.id.length, 16);
  assert.equal(dataType.literals, undefined);
});

void test('createRelation copies roles and bounds from its base relation', () => {
  const baseRelation: Relation | undefined = RAMEN_MODEL.relations[0];

  assert.ok(baseRelation, 'RAMEN must contain a relation for this contract test');

  const relation: Relation = ModelFactory.createRelation(RAMEN_MODEL, RAMEN_MODEL.id, {
    baseRelationId: baseRelation.id,
    fromNodeId: 'local-from-node',
    toNodeId: 'local-to-node',
  });

  assert.equal(relation.name, baseRelation.name);
  assert.equal(relation.from.role, baseRelation.from.role);
  assert.equal(relation.to.role, baseRelation.to.role);
  assert.deepEqual(relation.from.bounds, baseRelation.from.bounds);
  assert.deepEqual(relation.to.bounds, baseRelation.to.bounds);
});

void test('createLiteral creates an identifiable enum literal', () => {
  const literal: Literal = ModelFactory.createLiteral('Published', 'published', 1);

  assert.equal(literal.id.length, 16);
  assert.equal(literal.literal, 'published');
  assert.equal(literal.value, 1);
});

void test('createRelationEnd creates an identifiable relation end', () => {
  const end: RelationEnd = ModelFactory.createRelationEnd('localNode000001', 'documents', { lowerBound: 0, upperBound: -1 });

  assert.equal(end.id.length, 16);
  assert.equal(end.nodeId, 'localNode000001');
  assert.deepEqual(end.bounds, { lowerBound: 0, upperBound: -1 });
});
