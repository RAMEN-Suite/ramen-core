import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, Diagnostics, Modeler } from '../../dist/model/index.js';
import type {
  Attribute,
  Constraint,
  ConstraintContext,
  CreateBundleResult,
  DataType,
  DataTypeSuggestion,
  Diagnostic,
  Literal,
  Model,
  ModelAdvisor,
  ModelChange,
  ModelInstanceGraph,
  Node,
  NodeSuggestion,
  Relation,
  RelationSuggestion,
} from '../../dist/model/index.js';

interface Transport {
  readonly language: Modeler;
  readonly vehicle: Node;
  readonly project: Modeler;
  readonly bicycle: Node;
}

function transport(): Transport {
  const language: Modeler = Modeler.create('Transport');
  const vehicle: Node = language.createNode('Vehicle').element;
  language.createRelation({ name: 'TOWS', fromNodeId: vehicle, toNodeId: vehicle });
  const project: Modeler = language.createNextLevel('Bicycles');
  const bicycle: Node = project.createNode({ name: 'Bicycle', refines: vehicle }).element;
  return { language, vehicle, project, bicycle };
}

function data(project: Modeler, node: Node, properties: Record<string, unknown>): ModelInstanceGraph {
  return { modelId: project.getModel().id, nodes: [{ id: 'modelerData000001', typeId: node.id, properties }], relations: [] };
}

function snapshot(project: Modeler): readonly Model[] {
  return [...project.getModels()].sort((left: Model, right: Model): number => left.id.localeCompare(right.id));
}

void test('a name is enough to create valid root models and identifiable elements', (): void => {
  const language: Modeler = Modeler.create('Transport');
  const vehicle: Node = language.createNode('Vehicle').element;
  const model: Model = language.getModel();
  assert.equal(language.validate().valid, true);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.$id, `urn:rmf:model:${model.id}`);
  assert.equal(model.id.length, 16);
  assert.equal(vehicle.id.length, 16);
  assert.notEqual(vehicle.id, model.id);
  const explicit: Modeler = Modeler.create({
    name: 'Transport',
    id: 'explicitModel0001',
    uri: 'https://example.org/transport',
    version: '2.1.0',
  });
  assert.equal(explicit.getModel().id, 'explicitModel0001');
  assert.equal(explicit.getModel().$id, 'https://example.org/transport');
  assert.equal(explicit.getModel().version, '2.1.0');
});

void test('suggestions can be passed directly into node, attribute and connection creation', (): void => {
  const fixture: Transport = transport();
  const nodeChoice: NodeSuggestion | undefined = fixture.project.suggestNodes()[0];
  assert.ok(nodeChoice);
  const cargo: Node = fixture.project.createNode({ name: 'CargoBike', refines: nodeChoice }).element;
  const typeChoice: DataTypeSuggestion | undefined = fixture.project
    .suggestDataTypes()
    .find((item: DataTypeSuggestion): boolean => item.ref === 'Integer');
  assert.ok(typeChoice);
  const gears: Attribute = fixture.project.createAttribute(cargo, { name: 'gears', typeId: typeChoice }).element;
  const relationChoice: RelationSuggestion | undefined = fixture.project.suggestRelations(fixture.bicycle, cargo)[0];
  assert.ok(relationChoice);
  const link: Relation = fixture.project.connect(fixture.bicycle, cargo, relationChoice.ref).element;
  assert.deepEqual(gears.bounds, { lowerBound: 0, upperBound: 1 });
  assert.deepEqual(link.superTypes, [relationChoice.ref]);
  assert.equal(fixture.project.validate().valid, true);
});

void test('levels retain their dependencies and bundle round-trips restore editable models', (): void => {
  const fixture: Transport = transport();
  fixture.project.connect(fixture.bicycle, fixture.bicycle);
  const next: Modeler = fixture.project.createNextLevel('Edition');
  const special: Node = next.createNode({ name: 'SpecialBike', refines: fixture.bicycle }).element;
  next.connect(special, special);
  const exported: CreateBundleResult = next.exportBundle();
  assert.ok(exported.ok);
  assert.equal(exported.bundle.models.length, 3);
  const restored: Modeler = Modeler.importBundle(JSON.parse(JSON.stringify(exported.bundle)) as unknown);
  assert.deepEqual(snapshot(restored), snapshot(next));
  assert.deepEqual(next.compareTo(restored).changes, []);
  assert.equal(restored.createAttribute(special, { name: 'label', typeId: 'String' }).validation.valid, true);
  assert.equal(next.suggestAttributes(special).length, 0);
});

void test('an empty intermediate level cannot restore ancestor relations', (): void => {
  const fixture: Transport = transport();
  const next: Modeler = fixture.project.createNextLevel('Edition');
  assert.deepEqual(next.suggestRelations(fixture.bicycle, fixture.bicycle), []);
  assert.throws((): ModelChange<Relation> => next.connect(fixture.bicycle, fixture.bicycle), /found 0/);
  assert.throws(
    (): ModelChange<Relation> =>
      next.createRelation({ name: 'NEW_LINK', fromNodeId: fixture.bicycle, toNodeId: fixture.bicycle }),
    /preceding model level/,
  );
  assert.throws((): ModelChange<Node> => next.createNode('Unrelated'), /Select a node to refine/);
  assert.equal(next.getModel().relations.length, 0);
});

void test('shared element editing includes attributes, data types and literals', (): void => {
  const project: Modeler = Modeler.create('Records');
  const record: Node = project.createNode('Record').element;
  const status: DataType = project.createDataType({ name: 'Status', baseType: 'String' }).element;
  const draft: Literal = project.createLiteral(status.id, { name: 'Draft', literal: 'draft' }).element;
  project.updateLiteral(status.id, draft.id, { name: 'Published', literal: 'published' });
  const attribute: Attribute = project.createAttribute(record, { name: 'status', typeId: status }).element;
  assert.equal(project.validateInstances(data(project, record, { status: 'published' })).hasErrors, false);
  assert.equal(project.validateInstances(data(project, record, { status: 'draft' })).hasErrors, true);
  project.updateAttribute(record.id, attribute.id, { bounds: { lowerBound: 1, upperBound: 1 } });
  assert.equal(project.validateInstances(data(project, record, {})).hasErrors, true);
  project.removeAttribute(record.id, attribute.id);
  project.removeLiteral(status.id, draft.id);
  project.removeDataType(status.id);
  project.removeNode(record.id);
  assert.equal(project.validate().valid, true);
  assert.deepEqual(project.getModel().classifiers, []);
});

void test('custom data types can be selected across levels without qualifying their IDs manually', (): void => {
  const fixture: Transport = transport();
  const date: DataType = fixture.language.createDataType({ name: 'Date', baseType: 'String' }).element;
  fixture.language.updateDataType(date.id, {
    constraints: [{ id: 'modelerDateRule01', name: 'Calendar date', language: 'format', expression: 'date' }],
  });
  const project: Modeler = fixture.language.createNextLevel('Dated Vehicles');
  const record: Node = project.createNode({ name: 'Record', refines: fixture.vehicle }).element;
  const choice: DataTypeSuggestion | undefined = project
    .suggestDataTypes()
    .find((item: DataTypeSuggestion): boolean => item.name === 'Date');
  assert.ok(choice);
  const attribute: Attribute = project.createAttribute(record, { name: 'date', typeId: choice }).element;
  assert.equal(attribute.typeId, `${fixture.language.getModel().id}:${date.id}`);
  assert.equal(project.validateInstances(data(project, record, { date: '2026-09-26' })).hasErrors, false);
  assert.equal(project.validateInstances(data(project, record, { date: '2026-02-30' })).hasErrors, true);
});

void test('generic edits refresh advice while dependencies and returned snapshots stay detached', (): void => {
  const fixture: Transport = transport();
  const before: ModelAdvisor = fixture.project.createAdvisor();
  const snapshot: Model = fixture.project.getModel();
  fixture.language.removeNode(fixture.vehicle.id);
  fixture.project.createAttribute(fixture.bicycle, { name: 'label', typeId: 'String' });
  assert.equal(snapshot.classifiers[0]?.kind, 'Node');
  assert.deepEqual(before.suggestAttributes(snapshot.id, fixture.bicycle.id), []);
  assert.equal(fixture.project.suggestAttributes(fixture.bicycle).length, 1);
  assert.equal(fixture.project.validate().valid, true);
  assert.notEqual(fixture.project.createAdvisor(), before);
  assert.throws(
    (): ModelChange<Attribute> => fixture.project.createAttribute(fixture.vehicle, { name: 'wrongLevel', typeId: 'String' }),
    /Only local nodes/,
  );
});

void test('constraints are accepted in models and evaluated only against data', (): void => {
  const project: Modeler = Modeler.create('Records');
  const record: Node = project.createNode('Record').element;
  project.updateNode(record.id, {
    constraints: [{ id: 'modelerDataRule01', name: 'Check data', language: 'custom', expression: 'check' }],
  });
  assert.equal(project.validate().valid, true);
  const calls: ConstraintContext[] = [];
  const registry: ConstraintRegistry = new ConstraintRegistry([
    {
      language: 'custom',
      evaluate(_rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
        calls.push(context);
        return [Diagnostics.error({ code: 'DATA_RULE_FAILED', message: 'Data violates the modeled rule.', path: context.path })];
      },
    },
  ]);
  assert.equal(project.validateInstances(data(project, record, {}), registry).diagnostics[0]?.code, 'DATA_RULE_FAILED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.instanceId, 'modelerData000001');
  assert.equal(project.validateInstances(data(project, record, {})).diagnostics[0]?.code, 'CONSTRAINT_LANGUAGE_UNSUPPORTED');
});
