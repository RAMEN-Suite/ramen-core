import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectGraph, InstanceValidator } from '../../dist/index.js';
import type { GModel, ModelInstance, ProjectGraph } from '../../dist/index.js';
import { attribute, boundsOf, model, node, relation } from '../models.ts';

const MODEL_ID = 'instanceModel001';
const PERSON_ID = 'personNode000001';
const PLACE_ID = 'placeNode0000001';
const RELATION_ID = 'locatedRelation1';

function graph(): ProjectGraph {
  const schema: GModel = model(MODEL_ID);
  const person = node(PERSON_ID, 'Person');
  const name = attribute('personNameAttr01', 'name', 'String', boundsOf(1, 1));
  name.constraints = [
    {
      id: 'personNameRule01',
      name: 'capitalized name',
      language: 'regex',
      expression: '^[A-Z]',
      message: 'Name must start with an uppercase letter.',
    },
  ];
  person.attributes.push(name, attribute('personTagsAttr01', 'tags', 'String', boundsOf(0, -1)));
  schema.classifiers.push(person, node(PLACE_ID, 'Place'));
  schema.relations.push(relation(RELATION_ID, 'LOCATED_AT', PERSON_ID, PLACE_ID, boundsOf(1, 1)));
  const result = buildProjectGraph({ rootModelId: MODEL_ID, models: [schema] });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Test graph could not be built.');
  return result.graph;
}

void test('validates closed properties, values, arrays, and constraints', () => {
  const instance: ModelInstance = {
    modelId: MODEL_ID,
    nodes: [
      {
        id: 'personInstance01',
        typeId: PERSON_ID,
        properties: { name: 'lowercase', tags: 'not-an-array', unexpected: true },
      },
    ],
    relations: [],
  };
  const result = new InstanceValidator().validate(graph(), instance);
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes('INSTANCE_PROPERTY_UNKNOWN'));
  assert.ok(codes.includes('INSTANCE_PROPERTY_ARRAY_REQUIRED'));
  assert.ok(codes.includes('CONSTRAINT_REGEX_MISMATCH'));
});

void test('accepts valid nodes and relation cardinalities', () => {
  const instance: ModelInstance = {
    modelId: MODEL_ID,
    nodes: [
      { id: 'personInstance01', typeId: PERSON_ID, properties: { name: 'Ada', tags: ['researcher'] } },
      { id: 'placeInstance001', typeId: PLACE_ID, properties: {} },
    ],
    relations: [{ id: 'locatedInstance1', typeId: RELATION_ID, fromId: 'personInstance01', toId: 'placeInstance001' }],
  };
  const result = new InstanceValidator().validate(graph(), instance);
  assert.deepEqual(result.diagnostics, []);
});

void test('validates relation endpoint types and required cardinalities', () => {
  const instance: ModelInstance = {
    modelId: MODEL_ID,
    nodes: [
      { id: 'personInstance01', typeId: PERSON_ID, properties: { name: 'Ada', tags: [] } },
      { id: 'personInstance02', typeId: PERSON_ID, properties: { name: 'Grace', tags: [] } },
    ],
    relations: [{ id: 'locatedInstance1', typeId: RELATION_ID, fromId: 'personInstance01', toId: 'personInstance02' }],
  };
  const result = new InstanceValidator().validate(graph(), instance);
  const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes('INSTANCE_RELATION_END_TYPE_INVALID'));
  assert.ok(codes.includes('INSTANCE_CARDINALITY_INVALID'));
});
