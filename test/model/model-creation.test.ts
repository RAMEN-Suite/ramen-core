import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ModelFactory,
  ModelEditor,
  RAMEN_MODEL,
  ModelRef,
  ModelSchemaValidator,
  ModelNames,
} from '../../dist/ramen-core/index.js';
import type {
  Bounds,
  Constraint,
  ConnectedNode,
  Attribute,
  DataType,
  Literal,
  Model,
  Node,
  Relation,
  RelationEnd,
} from '../../dist/ramen-core/index.js';

const projectInput: { uri: string; id: string; name: string; version: string } = {
  uri: 'https://example.org/project',
  id: 'project-model-id',
  name: 'Example project',
  version: '1.0.0',
};

void test('createRootModel starts a generic model without imports', (): void => {
  const root: Model = ModelFactory.createRootModel(projectInput);

  assert.equal(root.id, projectInput.id);
  assert.deepEqual(root.imports, []);
  assert.deepEqual(root.classifiers, []);
  assert.equal(ModelSchemaValidator.isValid(root), true);
});

void test('createModel creates an empty model that imports its base model', (): void => {
  const model: Model = ModelFactory.createModel(RAMEN_MODEL, projectInput);
  assert.equal(model.id, projectInput.id);
  assert.deepEqual(model.classifiers, []);
  assert.deepEqual(model.relations, []);
  assert.equal(model.imports[0]?.modelId, RAMEN_MODEL.id);
  assert.equal(ModelSchemaValidator.isValid(model), true);
});

void test('createNode creates a node with a qualified base reference', (): void => {
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

void test('createAttribute preserves type, bounds and modifiers', (): void => {
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

void test('createDataType creates an empty custom data type', (): void => {
  const dataType: DataType = ModelFactory.createDataType({ name: 'EditorialStatus', baseType: 'String' });
  assert.equal(dataType.kind, 'DataType');
  assert.equal(dataType.baseType, 'String');
  assert.equal(dataType.name, 'EditorialStatus');
  assert.equal(dataType.id.length, 16);
  assert.equal(dataType.literals, undefined);
});

void test('createRelation copies roles and bounds from its base relation', (): void => {
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

void test('createLiteral creates an identifiable enum literal', (): void => {
  const literal: Literal = ModelFactory.createLiteral('Published', 'published', 1);
  assert.equal(literal.id.length, 16);
  assert.equal(literal.literal, 'published');
  assert.equal(literal.value, 1);
});

void test('createRelationEnd creates an identifiable relation end', (): void => {
  const end: RelationEnd = ModelFactory.createRelationEnd('localNode000001', 'documents', { lowerBound: 0, upperBound: -1 });
  assert.equal(end.id.length, 16);
  assert.equal(end.nodeId, 'localNode000001');
  assert.deepEqual(end.bounds, { lowerBound: 0, upperBound: -1 });
});

void test('factory attributes detach caller bounds and names respect their length limits', (): void => {
  const bounds: Bounds = { lowerBound: 0, upperBound: 1 };
  const attribute: Attribute = ModelFactory.createAttribute({ name: 'title', typeId: 'String', bounds });
  bounds.lowerBound = 1;
  assert.equal(attribute.bounds.lowerBound, 0);

  const numeric: string = '1'.repeat(60);
  assert.equal(ModelNames.toPascalName(numeric).length, 40);
  assert.equal(ModelNames.toCamelName(numeric).length, 32);
  assert.equal(ModelNames.toScreamedName(numeric).length, 32);
  assert.match(ModelNames.toScreamedName(''), /^[A-Z]/);
});

void test('duplicateConnectedNode redirects qualified self-relations without touching the original', (): void => {
  const model: Model = ModelFactory.createRootModel({ ...projectInput, id: 'duplicateModel001' });
  const source: Node = { kind: 'Node', id: 'duplicateNode0001', name: 'Document', superTypes: [], attributes: [] };
  const reference: string = ModelRef.qualify(model.id, source.id);
  const relation: Relation = {
    kind: 'Relation',
    id: 'duplicateLink0001',
    name: 'RELATED',
    superTypes: [],
    from: ModelFactory.createRelationEnd(reference, 'source', { lowerBound: 0, upperBound: -1 }),
    to: ModelFactory.createRelationEnd(reference, 'target', { lowerBound: 0, upperBound: -1 }),
  };
  model.classifiers.push(source);
  model.relations.push(relation);

  const copy: ConnectedNode = ModelFactory.duplicateConnectedNode(model, source.id);
  assert.equal(copy.relations.length, 1);
  assert.equal(copy.relations[0]?.from.nodeId, copy.node.id);
  assert.equal(copy.relations[0]?.to.nodeId, copy.node.id);
  assert.notEqual(copy.relations[0]?.from.id, relation.from.id);
  assert.equal(model.relations[0]?.from.nodeId, reference);
});

void test('node duplication renews identifiers of attributes and all owned constraints', (): void => {
  const rule: Constraint = { id: 'originalRule0001', name: 'Uppercase', language: 'regex', expression: '^[A-Z]' };
  const field: Attribute = ModelFactory.createAttribute({
    name: 'title',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  field.constraints = [rule];
  const source: Node = {
    kind: 'Node',
    id: 'originalNode0001',
    name: 'Letter',
    superTypes: [],
    attributes: [field],
    constraints: [{ ...rule, id: 'nodeRule00000001' }],
  };
  const copy: Node = ModelFactory.duplicateNode(source);
  const copiedField: Attribute | undefined = copy.attributes[0];
  const copiedRule: Constraint | undefined = copiedField?.constraints?.[0];
  assert.ok(copiedField);
  assert.ok(copiedRule);
  assert.notEqual(copiedField.id, field.id);
  assert.notEqual(copiedRule.id, rule.id);
  assert.notEqual(copy.constraints?.[0]?.id, 'nodeRule00000001');
  assert.equal(copiedRule.expression, rule.expression);
  assert.equal(source.attributes[0]?.id, field.id);
});

void test('removeNode rejects data types and absent nodes without changing the source model', (): void => {
  const model: Model = ModelFactory.createRootModel({ ...projectInput, id: 'editorModel00001' });
  const type: DataType = ModelFactory.createDataType({ name: 'Status', baseType: 'String' });
  model.classifiers.push(type);
  const before: Model = structuredClone(model);
  assert.throws((): Model => ModelEditor.removeNode(model, type.id), /Node not found/);
  assert.throws((): Model => ModelEditor.removeNode(model, 'missingNode00001'), /Node not found/);
  assert.deepEqual(model, before);
});
