import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  type Attribute,
  type DataType,
  type Literal,
  type Model,
  type ModelChange,
  type ModelInstanceGraph,
  type Node,
  type NodeRelationSuggestion,
  type NodeSuggestion,
  type Relation,
  type RelationSuggestion,
} from '@ramen-suite/core/model';

void test('properties, data types and literals remain editable by stable ID', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;

  const status: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const draft: Literal = model.createLiteral(status.id, { name: 'Draft', literal: 'draft' }).element;
  const property: Attribute = model.createAttribute(document, { name: 'status', type: status }).element;

  const recorded: ModelInstanceGraph = {
    nodes: [{ id: 'documentRecord01', typeId: document.id, properties: { status: 'draft' } }],
    relations: [],
  };

  assert.equal(model.validateInstances(recorded).hasErrors, false);
  model.updateLiteral(status.id, draft.id, { literal: 'published' });
  assert.equal(model.validateInstances(recorded).hasErrors, true);

  model.updateAttribute(document.id, property.id, { name: 'publicationStatus' });
  model.removeLiteral(status.id, draft.id);
  model.removeAttribute(document.id, property.id);
  model.removeDataType(status.id);

  assert.equal(model.validate().valid, true);
  assert.deepEqual(model.getAttributes(document), []);
});

void test('removing the last literal restores the unrestricted base type, not other value types', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const status: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const draft: Literal = model.createLiteral(status.id, { name: 'Draft' }).element;

  assert.equal(model.validateValue(status, 'Draft').hasErrors, false);
  assert.equal(model.validateValue(status, 'Published').hasErrors, true);
  model.removeLiteral(status.id, draft.id);

  assert.equal(model.validateValue(status, 'Published').hasErrors, false);
  assert.equal(model.validateValue(status, 1).hasErrors, true);
  assert.equal(Modeller.import(model.export()).validateValue(status.id, 'Published').hasErrors, false);
});

void test('editing a literal retains its position, identity and previous snapshot', (): void => {
  const model: Modeller = Modeller.create('Publication');
  const status: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const draft: Literal = model.createLiteral(status.id, { name: 'Draft' }).element;
  const published: Literal = model.createLiteral(status.id, { name: 'Published' }).element;
  const before: Modeller = model.snapshot();
  model.updateLiteral(status.id, draft.id, { name: 'In progress', literal: 'in-progress' });

  const literals: readonly Literal[] = model.getDataType(status.id)?.literals ?? [];
  assert.deepEqual(
    literals.map((item: Literal): string => item.id),
    [draft.id, published.id],
  );
  assert.equal(literals[0]?.name, 'In progress');
  assert.equal(before.getDataType(status.id)?.literals?.[0]?.name, 'Draft');

  model.removeLiteral(status.id, published.id);
  assert.deepEqual(model.getDataType(status.id)?.literals, [literals[0]]);
  assert.equal(Modeller.import(model.export()).validateValue(status.id, 'in-progress').hasErrors, false);
});

void test('property flags survive inheritance and exchange without imposing history or sorting checks', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const tags: Attribute = base.createAttribute(document, {
    name: 'tags',
    typeId: DataTypes.String,
    bounds: { lowerBound: 0, upperBound: -1 },
    isReadOnly: true,
    isOrdered: false,
    isUnique: false,
  }).element;

  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const restored: Modeller = Modeller.import(next.export());
  const owner: Node | undefined = restored.getNode(document.id);
  const property: Attribute | undefined = owner?.attributes.find((item: Attribute): boolean => item.id === tags.id);

  assert.equal(property?.isReadOnly, true);
  assert.equal(property?.isOrdered, false);
  assert.equal(property?.isUnique, false);

  assert.equal(restored.validateAttributeValue(page, 'tags', ['published', 'draft', 'draft']).hasErrors, false);
  assert.equal(restored.validateAttributeValue(page, 'tags', ['changed']).hasErrors, false);

  base.updateAttribute(document.id, tags.id, { isUnique: true });
  assert.equal(next.validateAttributeValue(page, 'tags', ['draft', 'draft']).hasErrors, true);
  assert.equal(restored.validateAttributeValue(page, 'tags', ['draft', 'draft']).hasErrors, false);
});

void test('invalid element selections fail before changing the draft', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const before: Model = model.getModel();

  assert.throws((): ModelChange<Attribute> => model.createAttribute(document, { name: 'status', typeId: 'missingType00001' }));
  assert.deepEqual(model.getModel(), before);

  assert.throws((): ModelChange<Node> => model.updateNode('missingNode00001', { name: 'Unknown' }), /not found/);
  assert.deepEqual(model.getModel(), before);
});

void test('a long refinement chain can be previewed and removed without recursion', (): void => {
  const initial: Modeller = Modeller.create('Long Chain');
  const root: Node = initial.createNode('Root').element;
  const raw: Model = initial.getModel();
  let parent: string = root.id;

  for (let index: number = 0; index < 1000; index += 1) {
    const id: string = `chainNode${String(index).padStart(7, '0')}`;
    raw.classifiers.push({ kind: 'Node', id, name: `Node${index}`, superTypes: [parent], attributes: [] });
    parent = id;
  }
  const model: Modeller = Modeller.load(raw);

  assert.equal(model.validate().valid, true);
  assert.equal(model.previewNodeRemoval(root.id).nodes.length, 1001);

  model.removeNode(root.id, { cascade: true });
  assert.equal(model.getModel().classifiers.length, 0);
  assert.equal(model.validate().valid, true);
});

void test('suggestions include same-level refinements and permitted connections', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const filedIn: Relation = model.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder },
  }).element;

  const candidates: readonly NodeSuggestion[] = model.suggestNodes();
  const documentChoice: NodeSuggestion | undefined = candidates.find(
    (item: NodeSuggestion): boolean => item.nodeId === document.id,
  );
  assert.ok(documentChoice);

  const letter: Node = model.createNode({ name: 'Letter', refines: documentChoice }).element;
  const relations: readonly RelationSuggestion[] = model.suggestRelations(letter, folder);
  const connections: readonly NodeRelationSuggestion[] = model.suggestConnections(letter);

  assert.equal(relations[0]?.relationId, filedIn.id);
  assert.ok(connections.some((item: NodeRelationSuggestion): boolean => item.relationId === filedIn.id));

  const next: Modeller = model.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;

  assert.ok(next.suggestNodes().some((item: NodeSuggestion): boolean => item.nodeId === page.id));
  assert.ok(next.suggestNodes().some((item: NodeSuggestion): boolean => item.nodeId === document.id));
});
