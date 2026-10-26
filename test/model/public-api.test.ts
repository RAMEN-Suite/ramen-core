import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  ModelAdvisor,
  ModelFactory,
  Modeller,
  type Attribute,
  type AttributeNameResult,
  type Constraint,
  type ConnectedNode,
  type DataType,
  type DataTypeSuggestion,
  type Model,
  type ModelFile,
  type Node,
  type NodeSuggestion,
  type Relation,
} from '@ramen-suite/core/model';

void test('editing inputs, returned definitions and exported files cannot mutate the draft indirectly', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;

  const expression: Record<string, unknown> = { minLength: 3 };
  const rule: Constraint = { id: 'titleLength00001', name: 'Title length', language: 'json-schema', expression };
  const title: Attribute = model.createAttribute(document, {
    name: 'title',
    typeId: DataTypes.String,
    constraints: [rule],
  }).element;
  const original: Model = model.getModel();

  expression['minLength'] = 100;
  title.name = 'changed';
  title.constraints?.splice(0);

  const read: Node | undefined = model.getNode(document.id);
  assert.ok(read);
  read.attributes.splice(0);

  const exported: ModelFile = model.export();
  const entry: ModelFile['classifiers'][number] | undefined = exported.classifiers[0];
  assert.ok(entry?.kind === 'Node');
  entry.attributes.splice(0);
  entry.name = 'Changed';

  assert.deepEqual(model.getModel(), original);
  assert.equal(model.validateAttributeValue(document, 'title', 'Hello').hasErrors, false);
  assert.equal(model.validateAttributeValue(document, 'title', 'Hi').hasErrors, true);
  assert.equal(model.validate().valid, true);
});

void test('the generic editor suggests available types and rejects inherited property names', (): void => {
  const base: Modeller = Modeller.create('File system');
  const file: Node = base.createNode('File').element;
  const folder: Node = base.createNode('Folder').element;
  const status: DataType = base.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  base.createAttribute(file, { name: 'name', typeId: DataTypes.String });

  const website: Modeller = Modeller.createLevel(base.getModel(), 'Website');
  const page: Node = website.createNode({ name: 'Page', refines: file }).element;

  const nodes: readonly NodeSuggestion[] = website.suggestNodes();
  const types: readonly DataTypeSuggestion[] = website.suggestDataTypes();

  const usedName: AttributeNameResult = website.validateAttributeName(page, 'name');
  const freshName: AttributeNameResult = website.validateAttributeName(page, 'slug');

  assert.ok(nodes.some((item: NodeSuggestion): boolean => item.nodeId === folder.id));
  assert.ok(types.some((item: DataTypeSuggestion): boolean => item.dataTypeId === status.id));
  assert.ok(types.some((item: DataTypeSuggestion): boolean => item.dataTypeId === DataTypes.String));

  assert.deepEqual(usedName, { allowed: false, conflicts: ['attribute'] });
  assert.deepEqual(freshName, { allowed: true, conflicts: [] });
  assert.ok(website.getAdvisor() instanceof ModelAdvisor);
  assert.equal(website.validate().valid, true);
});

void test('the lower-level factory duplicates owned identifiers without editing the source model', (): void => {
  const model: Modeller = Modeller.create('File system');
  const file: Node = model.createNode('File').element;
  const folder: Node = model.createNode('Folder').element;
  model.createAttribute(file, { name: 'name', typeId: DataTypes.String });
  const relation: Relation = model.createRelation({ name: 'IN_FOLDER', from: { node: file }, to: { node: folder } }).element;

  const source: Model = model.getModel();
  const copy: ConnectedNode = ModelFactory.duplicateConnectedNode(source, file.id);
  const original: Node | undefined = model.getNode(file.id);

  assert.notEqual(copy.node.id, file.id);
  assert.notEqual(copy.node.attributes[0]?.id, original?.attributes[0]?.id);
  assert.equal(copy.node.name, 'File (copy)');

  assert.equal(copy.relations.length, 1);
  assert.notEqual(copy.relations[0]?.id, relation.id);
  assert.equal(copy.relations[0]?.from.nodeId, copy.node.id);
  assert.equal(copy.relations[0]?.to.nodeId, folder.id);
  assert.deepEqual(model.getModel(), source);
});
