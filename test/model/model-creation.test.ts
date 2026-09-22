import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelElementFactory, RAMEN_MODEL, ModelReference, SchemaValidator } from '../../dist/index.js';

const projectInput = {
  uri: 'https://example.org/project',
  id: 'project-model-id',
  name: 'Example project',
  version: '1.0.0',
};

void test('createModel creates an empty model that imports its base model', () => {
  const model = ModelElementFactory.createModel(RAMEN_MODEL, projectInput);

  assert.equal(model.id, projectInput.id);
  assert.deepEqual(model.classifiers, []);
  assert.deepEqual(model.relations, []);
  assert.equal(model.imports[0]?.modelId, RAMEN_MODEL.id);
  assert.equal(SchemaValidator.isValid(model), true);
});

void test('createNode creates a node with a qualified base reference', () => {
  const node = ModelElementFactory.createNode(RAMEN_MODEL.id, {
    name: 'Document',
    baseNodeId: 'abcdefghijklmnop',
  });

  assert.equal(node.kind, 'GNode');
  assert.equal(node.name, 'Document');
  assert.deepEqual(node.superTypes, [ModelReference.qualify(RAMEN_MODEL.id, 'abcdefghijklmnop')]);
  assert.equal(node.id.length, 16);
  assert.deepEqual(node.attributes, []);
});

void test('createAttribute preserves type, bounds and modifiers', () => {
  const attribute = ModelElementFactory.createAttribute({
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
  const dataType = ModelElementFactory.createDataType({ name: 'EditorialStatus' });

  assert.equal(dataType.kind, 'GDataType');
  assert.equal(dataType.name, 'EditorialStatus');
  assert.equal(dataType.id.length, 16);
  assert.equal(dataType.literals, undefined);
});

void test('createRelation copies roles and bounds from its base relation', () => {
  const baseRelation = RAMEN_MODEL.relations[0];
  assert.ok(baseRelation, 'RAMEN must contain a relation for this contract test');

  const relation = ModelElementFactory.createRelation(RAMEN_MODEL, RAMEN_MODEL.id, {
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
