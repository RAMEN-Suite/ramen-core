import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Modeler,
  RamenModel,
  RAMEN_MODEL,
  DiagnosticPath,
  ConstraintRegistry,
  Diagnostics,
  MODEL_INSTANCES_SCHEMA_URI,
  InstanceSchemaValidator,
  InstanceValidator,
  buildProjectGraph,
} from '../../dist/ramen-core/index.js';
import type {
  Attribute,
  Constraint,
  ConstraintContext,
  Diagnostic,
  Model,
  Node,
  ModelInstanceGraph,
  ProjectGraph,
  ProjectGraphResult,
  ValidationResult,
} from '../../dist/ramen-core/index.js';
import { attribute, boundsOf, model, node, relation } from '../models.ts';

const MODEL_ID: string = 'instanceModel001';
const PERSON_ID: string = 'personNode000001';
const PLACE_ID: string = 'placeNode0000001';
const RELATION_ID: string = 'locatedRelation1';

void test('publishes the canonical instance schema identifier', (): void => {
  assert.equal(InstanceSchemaValidator.getSchemaNode().$id, MODEL_INSTANCES_SCHEMA_URI);
});

function graph(): ProjectGraph {
  const schema: Model = model(MODEL_ID);
  const person: Node = node(PERSON_ID, 'Person');
  const name: Attribute = attribute('personNameAttr01', 'name', 'String', boundsOf(1, 1));

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

void test('validates closed properties, values, arrays, and constraints', (): void => {
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
  const codes: string[] = result.diagnostics.map((diagnostic: Diagnostic): string => diagnostic.code);

  assert.ok(codes.includes('INSTANCE_PROPERTY_UNKNOWN'));
  assert.ok(codes.includes('INSTANCE_PROPERTY_ARRAY_REQUIRED'));
  assert.ok(codes.includes('CONSTRAINT_REGEX_MISMATCH'));
});

void test('rejects undeclared fields outside the modeled properties object', (): void => {
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

void test('accepts valid nodes and relation cardinalities', (): void => {
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

void test('validates relation endpoint types and required cardinalities', (): void => {
  const instance: ModelInstanceGraph = {
    modelId: MODEL_ID,
    nodes: [
      { id: 'personInstance01', typeId: PERSON_ID, properties: { name: 'Ada', tags: [] } },
      { id: 'personInstance02', typeId: PERSON_ID, properties: { name: 'Grace', tags: [] } },
    ],
    relations: [{ id: 'locatedInstance1', typeId: RELATION_ID, fromId: 'personInstance01', toId: 'personInstance02' }],
  };
  const result: ValidationResult = new InstanceValidator().validate(graph(), instance);
  const codes: string[] = result.diagnostics.map((diagnostic: Diagnostic): string => diagnostic.code);

  assert.ok(codes.includes('INSTANCE_RELATION_END_TYPE_INVALID'));
  assert.ok(codes.includes('INSTANCE_CARDINALITY_INVALID'));
});

void test('validates a modeled Date datatype as a constrained String', (): void => {
  const schema: Model = model('dateModel0000001');
  schema.classifiers.push(
    {
      kind: 'DataType',
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
  assert.ok(result.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'CONSTRAINT_FORMAT_MISMATCH'));
});

void test('passes the complete graph and current instance to a custom constraint language', (): void => {
  const schema: Model = model('graphRuleModel01');
  const person: Node = node(PERSON_ID, 'Person');
  const place: Node = node(PLACE_ID, 'Place');
  const rule: Constraint = {
    id: 'placeLinkRule001',
    name: 'Place link required',
    language: 'example:place-link',
    expression: {},
  };

  person.constraints = [rule];
  schema.classifiers.push(person, place);
  schema.relations.push(relation(RELATION_ID, 'LOCATED_AT', PERSON_ID, PLACE_ID, boundsOf(0, -1)));

  const built: ProjectGraphResult = buildProjectGraph({ rootModelId: schema.id, models: [schema] });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  registerPlaceLinkRule(registry, rule);

  const data: ModelInstanceGraph = {
    modelId: schema.id,
    nodes: [
      { id: 'personInstance01', typeId: PERSON_ID, properties: {} },
      { id: 'placeInstance001', typeId: PLACE_ID, properties: {} },
    ],
    relations: [],
  };
  const validator: InstanceValidator = new InstanceValidator(registry);
  const missing: ValidationResult = validator.validate(built.graph, data);
  const complete: ValidationResult = validator.validate(built.graph, {
    ...data,
    relations: [{ id: 'placeLink0000001', typeId: RELATION_ID, fromId: 'personInstance01', toId: 'placeInstance001' }],
  });

  assert.ok(missing.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'PLACE_LINK_REQUIRED'));
  assert.deepEqual(complete.diagnostics, []);
});

function registerPlaceLinkRule(registry: ConstraintRegistry, rule: Constraint): void {
  registry.register({
    language: rule.language,
    evaluate(_constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
      const linked: boolean =
        context.graph?.instances.relations.some(
          (item: ModelInstanceGraph['relations'][number]): boolean => item.fromId === context.instanceId,
        ) ?? false;

      return linked ? [] : [Diagnostics.error({ code: 'PLACE_LINK_REQUIRED', message: 'Add a place link.', path: context.path })];
    },
  });
}

void test('data cannot select an ancestor or unknown model to bypass the chosen context', (): void => {
  const base: Modeler = Modeler.create('Documents');
  const project: Modeler = base.createNextLevel('Edition');
  const ramen: RamenModel = RamenModel.create('Correspondence');
  const cases: readonly [Modeler | RamenModel, string][] = [
    [project, base.getModel().id],
    [project, 'missingModel0001'],
    [ramen, RAMEN_MODEL.id],
    [ramen, 'missingModel0001'],
  ];

  for (const [target, modelId] of cases) {
    const result: ValidationResult = target.validateInstances({ modelId, nodes: [], relations: [] });
    assert.equal(result.hasErrors, true);
    assert.equal(result.diagnostics[0]?.code, 'INSTANCE_MODEL_MISMATCH');
    assert.equal(result.diagnostics[0]?.path, '/modelId');
    assert.equal(result.diagnostics[0]?.severity, 'error');
  }
  assert.equal(project.validateInstances({ modelId: project.getModel().id, nodes: [], relations: [] }).hasErrors, false);
});

void test('diagnostic paths escape slashes and tildes in data property names', (): void => {
  const path: DiagnosticPath = DiagnosticPath.root().property('properties').property('a/b~c');
  assert.equal(path.toString(), '/properties/a~1b~0c');
  assert.equal(DiagnosticPath.root().property('nodes').index(2).toString(), '/nodes/2');
});

void test('optional properties named like Object members are absent unless declared in the data', (): void => {
  const project: Modeler = Modeler.create('Documents');
  const document: Node = project.createNode('Document').element;
  project.createAttribute(document, { name: 'toString', typeId: 'String' });
  const input: ModelInstanceGraph = {
    modelId: project.getModel().id,
    nodes: [{ id: 'documentRecord01', typeId: document.id, properties: {} }],
    relations: [],
  };
  assert.equal(project.validateInstances(input).hasErrors, false);
  assert.equal(
    project.validateInstances({ ...input, nodes: [{ ...input.nodes[0], properties: { toString: 4 } }] }).hasErrors,
    true,
  );
});
