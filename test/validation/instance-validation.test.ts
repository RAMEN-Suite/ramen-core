import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectGraph, InstanceValidator } from '../../dist/index.js';
import type {
  GAttribute,
  GModel,
  GNode,
  ModelInstanceGraph,
  ProjectGraph,
  ProjectGraphResult,
  ValidationResult,
} from '../../dist/index.js';
import { attribute, boundsOf, model, node, relation } from '../models.ts';

const MODEL_ID: string = 'instanceModel001';
const PERSON_ID: string = 'personNode000001';
const PLACE_ID: string = 'placeNode0000001';
const RELATION_ID: string = 'locatedRelation1';

function graph(): ProjectGraph {
  const schema: GModel = model(MODEL_ID);
  const person: GNode = node(PERSON_ID, 'Person');
  const name: GAttribute = attribute('personNameAttr01', 'name', 'String', boundsOf(1, 1));
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
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: MODEL_ID, models: [schema] });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Test graph could not be built.');
  return result.graph;
}

void test('validates closed properties, values, arrays, and constraints', () => {
  const instance: ModelInstanceGraph = {
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
  const result: ValidationResult = new InstanceValidator().validate(graph(), instance);
  const codes: string[] = result.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes('INSTANCE_PROPERTY_UNKNOWN'));
  assert.ok(codes.includes('INSTANCE_PROPERTY_ARRAY_REQUIRED'));
  assert.ok(codes.includes('CONSTRAINT_REGEX_MISMATCH'));
});

void test('rejects undeclared fields outside the modeled properties object', () => {
  const input: unknown = {
    modelId: MODEL_ID,
    nodes: [
      {
        id: 'personInstance01',
        typeId: PERSON_ID,
        properties: { name: 'Ada', tags: [] },
        createdAt: '2026-09-22T10:30:00Z',
      },
    ],
    relations: [],
  };
  const result: ValidationResult = new InstanceValidator().validate(graph(), input);
  assert.equal(result.diagnostics[0]?.code, 'INSTANCE_SCHEMA_INVALID');
});

void test('accepts valid nodes and relation cardinalities', () => {
  const instance: ModelInstanceGraph = {
    modelId: MODEL_ID,
    nodes: [
      { id: 'personInstance01', typeId: PERSON_ID, properties: { name: 'Ada', tags: ['researcher'] } },
      { id: 'placeInstance001', typeId: PLACE_ID, properties: {} },
    ],
    relations: [{ id: 'locatedInstance1', typeId: RELATION_ID, fromId: 'personInstance01', toId: 'placeInstance001' }],
  };
  const result: ValidationResult = new InstanceValidator().validate(graph(), instance);
  assert.deepEqual(result.diagnostics, []);
});

void test('validates relation endpoint types and required cardinalities', () => {
  const instance: ModelInstanceGraph = {
    modelId: MODEL_ID,
    nodes: [
      { id: 'personInstance01', typeId: PERSON_ID, properties: { name: 'Ada', tags: [] } },
      { id: 'personInstance02', typeId: PERSON_ID, properties: { name: 'Grace', tags: [] } },
    ],
    relations: [{ id: 'locatedInstance1', typeId: RELATION_ID, fromId: 'personInstance01', toId: 'personInstance02' }],
  };
  const result: ValidationResult = new InstanceValidator().validate(graph(), instance);
  const codes: string[] = result.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes('INSTANCE_RELATION_END_TYPE_INVALID'));
  assert.ok(codes.includes('INSTANCE_CARDINALITY_INVALID'));
});

void test('validates a modeled Date datatype as a constrained String', () => {
  const schema: GModel = model('dateModel0000001');
  schema.classifiers.push(
    {
      kind: 'GDataType',
      id: 'dateDataType0001',
      name: 'Date',
      baseType: 'String',
      constraints: [{ id: 'dateConstraint01', name: 'ISO date', language: 'format', expression: 'date' }],
    },
    {
      ...node('eventNode0000001', 'Event'),
      attributes: [attribute('eventDateAttr001', 'date', 'dateDataType0001', boundsOf(1, 1))],
    },
  );
  const built: ProjectGraphResult = buildProjectGraph({ rootModelId: schema.id, models: [schema] });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const result: ValidationResult = new InstanceValidator().validate(built.graph, {
    modelId: schema.id,
    nodes: [{ id: 'eventInstance001', typeId: 'eventNode0000001', properties: { date: '2026-02-30' } }],
    relations: [],
  });
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CONSTRAINT_FORMAT_MISMATCH'));
});
