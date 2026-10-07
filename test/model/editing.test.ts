import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type {
  Attribute,
  DataType,
  Literal,
  Model,
  ModelChange,
  ModelInstanceGraph,
  Node,
  NodeRelationSuggestion,
  NodeSuggestion,
  Relation,
  RelationSuggestion,
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
