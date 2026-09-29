import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, DataTypes, Diagnostics, Modeller } from '../../dist/ramen-core/model/index.js';
import type {
  Attribute,
  AttributeInfo,
  AttributeNameResult,
  BuiltinType,
  Constraint,
  ConstraintContext,
  ModelFile,
  DataType,
  DataTypeSuggestion,
  Diagnostic,
  Literal,
  Model,
  ModelAdvisor,
  ModelChange,
  ModelInstanceGraph,
  Node,
  NodeInfo,
  NodeLineageItem,
  NodeRelationSuggestion,
  NodeSuggestion,
  Relation,
  RelationInput,
  RelationSuggestion,
} from '../../dist/ramen-core/model/index.js';

interface TypeCase {
  readonly type: BuiltinType;
  readonly value: unknown;
  readonly invalid: unknown;
}

interface Transport {
  readonly language: Modeller;
  readonly vehicle: Node;
  readonly project: Modeller;
  readonly bicycle: Node;
}

function transport(): Transport {
  const language: Modeller = Modeller.create('Transport');
  const vehicle: Node = language.createNode('Vehicle').element;
  language.createRelation({ name: 'TOWS', fromNode: vehicle, toNode: vehicle });
  const project: Modeller = language.createNextLevel('Bicycles');
  const bicycle: Node = project.createNode({ name: 'Bicycle', refines: vehicle }).element;
  return { language, vehicle, project, bicycle };
}

function data(project: Modeller, node: Node, properties: Record<string, unknown>): ModelInstanceGraph {
  return { modelId: project.getModel().id, nodes: [{ id: 'modellerData000001', typeId: node.id, properties }], relations: [] };
}

function snapshot(project: Modeller): readonly Model[] {
  return [...project.getModels()].sort((left: Model, right: Model): number => left.id.localeCompare(right.id));
}

void test('a name is enough to create valid root models and identifiable elements', (): void => {
  const language: Modeller = Modeller.create('Transport');
  const vehicle: Node = language.createNode('Vehicle').element;
  const model: Model = language.getModel();
  assert.equal(language.validate().valid, true);
  assert.equal(model.version, '1.0.0');
  assert.equal(model.$id, `urn:rmf:model:${model.id}`);
  assert.equal(model.id.length, 16);
  assert.equal(vehicle.id.length, 16);
  assert.notEqual(vehicle.id, model.id);
  const explicit: Modeller = Modeller.create({
    name: 'Transport',
    id: 'explicitModel0001',
    uri: 'https://example.org/transport',
    version: '2.1.0',
  });
  assert.equal(explicit.getModel().id, 'explicitModel0001');
  assert.equal(explicit.getModel().$id, 'https://example.org/transport');
  assert.equal(explicit.getModel().version, '2.1.0');
});

void test('built-in constants create attributes with validated values and survive export', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const cases: readonly TypeCase[] = [
    { type: DataTypes.String, value: 'Title', invalid: 42 },
    { type: DataTypes.Boolean, value: true, invalid: 'true' },
    { type: DataTypes.Integer, value: 42, invalid: 1.5 },
    { type: DataTypes.Float, value: 1.5, invalid: '1.5' },
  ];
  for (const entry of cases) {
    const attribute: Attribute = model.createAttribute(document, { name: entry.type, typeId: entry.type }).element;
    const choice: DataTypeSuggestion | undefined = model
      .suggestDataTypes()
      .find((item: DataTypeSuggestion): boolean => item.ref === entry.type);
    assert.equal(attribute.typeId, entry.type);
    assert.ok(choice);
    assert.equal(choice.baseType, entry.type);
    assert.equal(model.validateInstances(data(model, document, { [entry.type]: entry.value })).hasErrors, false);
    assert.equal(model.validateInstances(data(model, document, { [entry.type]: entry.invalid })).hasErrors, true);
  }

  const restored: Modeller = Modeller.import(model.export());
  const attributes: readonly AttributeInfo[] = restored.getAttributes(document);
  assert.deepEqual(
    attributes.map((attribute: AttributeInfo): string => attribute.typeId),
    cases.map((entry: TypeCase): string => entry.type),
  );
  assert.equal(restored.validate().valid, true);
});

void test('suggestions can be passed directly into node, attribute and connection creation', (): void => {
  const fixture: Transport = transport();
  const nodeChoice: NodeSuggestion | undefined = fixture.project.suggestNodes()[0];
  assert.ok(nodeChoice);
  const cargo: Node = fixture.project.createNode({ name: 'CargoBike', refines: nodeChoice }).element;
  const typeChoice: DataTypeSuggestion | undefined = fixture.project
    .suggestDataTypes()
    .find((item: DataTypeSuggestion): boolean => item.ref === DataTypes.Integer);
  assert.ok(typeChoice);
  const gears: Attribute = fixture.project.createAttribute(cargo, { name: 'gears', typeId: typeChoice }).element;
  const relationChoice: RelationSuggestion | undefined = fixture.project.suggestRelations(fixture.bicycle, cargo)[0];
  assert.ok(relationChoice);
  const link: Relation = fixture.project.connect(fixture.bicycle, cargo, relationChoice.ref).element;
  assert.deepEqual(gears.bounds, { lowerBound: 0, upperBound: 1 });
  assert.deepEqual(link.superTypes, [relationChoice.ref]);
  assert.equal(fixture.project.validate().valid, true);
});

void test('levels retain their dependencies and file round-trips restore editable models', (): void => {
  const fixture: Transport = transport();
  fixture.project.connect(fixture.bicycle, fixture.bicycle);
  const next: Modeller = fixture.project.createNextLevel('Edition');
  const special: Node = next.createNode({ name: 'SpecialBike', refines: fixture.bicycle }).element;
  next.connect(special, special);
  const exported: ModelFile = next.export();
  assert.equal(exported.models.length, 3);
  const restored: Modeller = Modeller.import(JSON.parse(JSON.stringify(exported)) as unknown);
  assert.deepEqual(snapshot(restored), snapshot(next));
  assert.deepEqual(next.compareTo(restored).changes, []);
  assert.equal(restored.createAttribute(special, { name: 'label', typeId: 'String' }).validation.valid, true);
  assert.equal(next.getAttributes(special).length, 0);
});

void test('an empty intermediate level cannot restore ancestor relations', (): void => {
  const fixture: Transport = transport();
  const next: Modeller = fixture.project.createNextLevel('Edition');
  assert.deepEqual(next.suggestRelations(fixture.bicycle, fixture.bicycle), []);
  assert.throws((): ModelChange<Relation> => next.connect(fixture.bicycle, fixture.bicycle), /found 0/);
  assert.throws(
    (): ModelChange<Relation> => next.createRelation({ name: 'NEW_LINK', fromNode: fixture.bicycle, toNode: fixture.bicycle }),
    /preceding model level/,
  );
  assert.throws((): ModelChange<Node> => next.createNode('Unrelated'), /Select a node to refine/);
  assert.equal(next.getModel().relations.length, 0);
});

void test('shared element editing includes attributes, data types and literals', (): void => {
  const project: Modeller = Modeller.create('Records');
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
    constraints: [{ id: 'modellerDateRule01', name: 'Calendar date', language: 'format', expression: 'date' }],
  });
  const project: Modeller = fixture.language.createNextLevel('Dated Vehicles');
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

void test('generic edits refresh options while dependencies and returned snapshots stay detached', (): void => {
  const fixture: Transport = transport();
  const before: ModelAdvisor = fixture.project.getAdvisor();
  const snapshot: Model = fixture.project.getModel();
  fixture.language.removeNode(fixture.vehicle.id);
  fixture.project.createAttribute(fixture.bicycle, { name: 'label', typeId: 'String' });
  assert.equal(snapshot.classifiers[0]?.kind, 'Node');
  assert.deepEqual(before.getAttributes(snapshot.id, fixture.bicycle.id), []);
  assert.equal(fixture.project.getAttributes(fixture.bicycle).length, 1);
  assert.equal(fixture.project.validate().valid, true);
  assert.notEqual(fixture.project.getAdvisor(), before);
  assert.throws(
    (): ModelChange<Attribute> => fixture.project.createAttribute(fixture.vehicle, { name: 'wrongLevel', typeId: 'String' }),
    /Only local nodes/,
  );
});

void test('constraints are accepted in models and evaluated only against data', (): void => {
  const project: Modeller = Modeller.create('Records');
  const record: Node = project.createNode('Record').element;
  project.updateNode(record.id, {
    constraints: [{ id: 'modellerDataRule01', name: 'Check data', language: 'custom', expression: 'check' }],
  });
  assert.equal(project.validate().valid, true);
  const calls: ConstraintContext[] = [];
  const registry: ConstraintRegistry = new ConstraintRegistry([
    {
      language: 'custom',
      evaluate(_rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
        calls.push(context);
        return [Diagnostics.error({ code: 'DATA_RULE_FAILED', message: 'Data violates the modelled rule.', path: context.path })];
      },
    },
  ]);
  assert.equal(project.validateInstances(data(project, record, {}), registry).diagnostics[0]?.code, 'DATA_RULE_FAILED');
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.instanceId, 'modellerData000001');
  assert.equal(project.validateInstances(data(project, record, {})).diagnostics[0]?.code, 'CONSTRAINT_LANGUAGE_UNSUPPORTED');
});

void test('generic editing rejects absent targets before changing the draft', (): void => {
  const project: Modeller = Modeller.create('Documents');
  const document: Node = project.createNode('Document').element;
  const type: DataType = project.createDataType({ name: 'Status', baseType: 'String' }).element;
  const missing: string = 'missingElement01';
  const operations: readonly (() => unknown)[] = [
    (): unknown => project.updateNode(missing, { name: 'Letter' }),
    (): unknown => project.removeNode(missing),
    (): unknown => project.createAttribute(missing, { name: 'title', typeId: 'String' }),
    (): unknown => project.updateAttribute(document.id, missing, { name: 'title' }),
    (): unknown => project.removeAttribute(document.id, missing),
    (): unknown => project.updateDataType(missing, { name: 'State' }),
    (): unknown => project.removeDataType(missing),
    (): unknown => project.createLiteral(missing, { name: 'Draft' }),
    (): unknown => project.updateLiteral(type.id, missing, { name: 'Draft' }),
    (): unknown => project.removeLiteral(type.id, missing),
    (): unknown => project.updateRelation(missing, { name: 'FILED_IN' }),
    (): unknown => project.removeRelation(missing),
  ];
  const before: Model = project.getModel();
  for (const operation of operations) {
    assert.throws(operation);
    assert.deepEqual(project.getModel(), before);
  }
});

void test('generic reads distinguish empty collections from absent individual results', (): void => {
  const project: Modeller = Modeller.create('Documents');
  const document: Node = project.createNode('Document').element;
  const folder: Node = project.createNode('Folder').element;
  const advisor: ModelAdvisor = project.getAdvisor();
  const context: string = project.getModel().id;
  const validation: ReturnType<Modeller['validate']> = project.validate();
  assert.ok(validation.valid);
  assert.deepEqual(project.suggestNodes(), []);
  assert.deepEqual(project.getAttributes(document), []);
  assert.deepEqual(project.suggestRelations(document, folder), []);
  assert.deepEqual(project.getRelations(document, folder), []);
  assert.deepEqual(advisor.suggestConnections(context, document.id), []);
  assert.equal(advisor.getNodeInfo(context, 'missingNode00001'), undefined);
  assert.equal(validation.graph.getModel('missingModel001'), undefined);
  assert.equal(validation.graph.getNode(context, 'missingNode00001'), undefined);
  assert.equal(validation.graph.getDataType(context, 'missingType00001'), undefined);
  assert.equal(validation.graph.getRelation(context, 'missingLink00001'), undefined);
});

void test('model queries read inherited definitions, suggest connections and validate names without editing', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
  model.createRelation({ name: 'FILED_IN', fromNode: document, toNode: folder });

  const project: Modeller = model.createNextLevel('Correspondence');
  const letter: Node = project.createNode({ name: 'Letter', refines: document }).element;
  const archive: Node = project.createNode({ name: 'Archive', refines: folder }).element;
  project.connect(letter, archive);
  const before: readonly Model[] = project.getModels();
  const info: NodeInfo | undefined = project.getNodeInfo(letter);
  const attributes: readonly AttributeInfo[] = project.getAttributes(letter);
  const connections: readonly NodeRelationSuggestion[] = project.suggestConnections(letter);
  const conflict: AttributeNameResult = project.validateAttributeName(letter, 'title');
  const available: AttributeNameResult = project.validateAttributeName(letter, 'description');
  assert.ok(info);
  assert.deepEqual(
    info.lineage.map((item: NodeLineageItem): string => item.name),
    ['Document', 'Letter'],
  );
  assert.deepEqual(info.attributes, attributes);
  assert.deepEqual(info.relations, connections);
  assert.equal(attributes[0]?.inherited, true);
  assert.equal(connections[0]?.name, 'FILED_IN');
  assert.ok(connections[0]?.compatibleTargetNodeIds.includes(archive.id));
  assert.deepEqual(conflict, { allowed: false, conflicts: ['attribute'] });
  assert.deepEqual(available, { allowed: true, conflicts: [] });
  assert.deepEqual(project.getModels(), before);
  assert.equal(project.getAdvisor(), project.getAdvisor());

  const missing: string = 'missingNode00001';
  assert.throws((): NodeInfo | undefined => project.getNodeInfo(missing), /found 0/);
  assert.throws((): readonly NodeRelationSuggestion[] => project.suggestConnections(missing), /found 0/);
  assert.throws((): AttributeNameResult => project.validateAttributeName(missing, 'title'), /found 0/);
  assert.deepEqual(project.getModels(), before);
});

void test('relation endpoints accept objects, IDs and mixed inputs with object precedence', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const other: Node = model.createNode('Other').element;
  const cases: readonly RelationInput[] = [
    { name: 'OBJECTS', fromNode: document, toNode: folder },
    { name: 'IDS', fromNodeId: document.id, toNodeId: folder.id },
    { name: 'SOURCE_OBJECT', fromNode: document, toNodeId: folder.id },
    { name: 'TARGET_OBJECT', fromNodeId: document.id, toNode: folder },
    { name: 'CONFLICTING_IDS', fromNode: document, fromNodeId: other.id, toNode: folder, toNodeId: other.id },
    { name: 'IGNORED_IDS', fromNode: document, fromNodeId: 'missingSource001', toNode: folder, toNodeId: 'missingTarget001' },
  ];
  for (const input of cases) {
    const result: ModelChange<Relation> = model.createRelation(input);
    assert.equal(result.element.from.nodeId, document.id);
    assert.equal(result.element.to.nodeId, folder.id);
    assert.equal(result.validation.valid, true);
  }

  const restored: Modeller = Modeller.import(model.export());
  assert.equal(restored.getRelations(document, folder).length, cases.length);
  assert.equal(restored.validate().valid, true);
});

void test('missing endpoints and unknown object selections reject the edit without falling back to IDs', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const before: readonly Model[] = model.getModels();
  const missingInputs: readonly unknown[] = [
    { name: 'NO_ENDPOINTS' },
    { name: 'NO_SOURCE', toNode: folder },
    { name: 'NO_TARGET', fromNode: document },
  ];
  for (const input of missingInputs) {
    assert.throws((): ModelChange<Relation> => model.createRelation(input as RelationInput), /requires source and target/);
    assert.deepEqual(model.getModels(), before);
  }

  const invalidInputs: readonly RelationInput[] = [
    { name: 'UNKNOWN_SOURCE', fromNode: { id: 'missingSource001' }, fromNodeId: document.id, toNode: folder },
    { name: 'UNKNOWN_TARGET', fromNode: document, toNode: { id: 'missingTarget001' }, toNodeId: folder.id },
  ];
  for (const input of invalidInputs) {
    assert.throws((): ModelChange<Relation> => model.createRelation(input), /found 0/);
    assert.deepEqual(model.getModels(), before);
  }
});

void test('object endpoints take precedence over qualified ancestor IDs during relation refinement', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const base: Relation = model.createRelation({ name: 'FILED_IN', fromNode: document, toNode: folder }).element;
  const project: Modeller = model.createNextLevel('Website');
  const page: Node = project.createNode({ name: 'Page', refines: document }).element;
  const section: Node = project.createNode({ name: 'Section', refines: folder }).element;
  const result: ModelChange<Relation> = project.createRelation({
    refines: base,
    fromNode: page,
    fromNodeId: `${model.getModel().id}:${document.id}`,
    toNode: section,
    toNodeId: `${model.getModel().id}:${folder.id}`,
  });
  assert.equal(result.element.from.nodeId, page.id);
  assert.equal(result.element.to.nodeId, section.id);
  assert.equal(result.validation.valid, true);
});
