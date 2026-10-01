import assert from 'node:assert/strict';
import test from 'node:test';
import { InstanceValidator, ModelFactory, ModelValidator } from '../../dist/ramen-core/index.js';
import type {
  Attribute,
  Diagnostic,
  Model,
  ModelInstanceGraph,
  Node,
  ProjectValidationResult,
  Relation,
  ValidationResult,
} from '../../dist/ramen-core/index.js';
import { model, node, relation } from '../models.ts';

function document(property: Attribute): Model {
  const schema: Model = model('modifierModel00001');
  const owner: Node = node('modifierNode000001', 'Record');
  owner.attributes.push(property);
  schema.classifiers.push(owner);
  return schema;
}

function validate(schema: Model, values: readonly string[]): ValidationResult {
  const project: ProjectValidationResult = new ModelValidator().validateProject(schema.id, [schema]);
  assert.ok(project.valid, JSON.stringify(project.diagnostics));
  const data: ModelInstanceGraph = {
    nodes: [{ id: 'modifierRecord001', typeId: 'modifierNode000001', properties: { labels: values } }],
    relations: [],
  };
  return new InstanceValidator().validate(project.graph, data);
}

void test('schema defaults require unique values; ordering and read-only do not reject a snapshot', (): void => {
  const labels: Attribute = {
    id: 'modifierLabels001',
    name: 'labels',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: -1 },
    isReadOnly: true,
    isOrdered: true,
  };
  const schema: Model = document(labels);
  const before: string = JSON.stringify(schema);
  const values: readonly string[] = ['z', 'a'];

  assert.equal(validate(schema, values).hasErrors, false);
  assert.deepEqual(values, ['z', 'a']);
  assert.equal(JSON.stringify(schema), before);
  assert.ok(
    validate(schema, ['a', 'a']).diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_PROPERTY_NOT_UNIQUE'),
  );
  labels.isUnique = false;
  assert.equal(validate(schema, ['a', 'a']).hasErrors, false);
});

void test('keys require exactly one value and factory defaults agree with the schema', (): void => {
  const key: Attribute = ModelFactory.createAttribute({
    name: 'labels',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
    isKey: true,
  });
  const schema: Model = document(key);
  const invalid: ProjectValidationResult = new ModelValidator().validateProject(schema.id, [schema]);

  assert.ok(invalid.diagnostics.some((item: Diagnostic): boolean => item.code === 'ATTRIBUTE_KEY_BOUNDS_INVALID'));
  assert.equal(key.isReadOnly, false);
  assert.equal(key.isOrdered, true);
  assert.equal(key.isUnique, true);
  key.bounds = { lowerBound: 1, upperBound: 1 };
  assert.equal(new ModelValidator().validateProject(schema.id, [schema]).valid, true);
});

void test('composition allows one owner end and navigability does not prohibit stored relations or cycles', (): void => {
  const schema: Model = model('modifierModel00001');
  const owner: Node = node('modifierNode000001', 'Record');
  const edge: Relation = relation('modifierRelation01', 'PART_OF', owner.id, owner.id);
  edge.to.isComposite = true;
  edge.to.isNavigable = false;
  schema.classifiers.push(owner);
  schema.relations.push(edge);
  const project: ProjectValidationResult = new ModelValidator().validateProject(schema.id, [schema]);
  assert.ok(project.valid);
  const data: ModelInstanceGraph = {
    nodes: [{ id: 'modifierRecord001', typeId: owner.id, properties: {} }],
    relations: [{ id: 'modifierEdge00001', typeId: edge.id, fromId: 'modifierRecord001', toId: 'modifierRecord001' }],
  };

  assert.equal(new InstanceValidator().validate(project.graph, data).hasErrors, false);
  edge.from.isComposite = true;
  assert.ok(
    new ModelValidator()
      .validateProject(schema.id, [schema])
      .diagnostics.some((item: Diagnostic): boolean => item.code === 'RELATION_COMPOSITE_BOTH_ENDS'),
  );
});
