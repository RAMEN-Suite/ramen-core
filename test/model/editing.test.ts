import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type {
  Attribute,
  Constraint,
  ConstraintOwner,
  DataType,
  Diagnostic,
  Literal,
  Model,
  ModelChange,
  ModelInstanceGraph,
  Node,
  NodeRelationSuggestion,
  NodeSuggestion,
  Relation,
  RelationRemovalPreview,
  RelationSelection,
  RelationSuggestion,
  WorkspaceElement,
} from '@ramen-suite/core/model';

void test('relations accept constraints on creation and update', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
  const linkRule: Constraint = {
    id: 'linkRule00000001',
    name: 'No self-link',
    language: 'example:no-self-link',
    expression: 'fromId != toId',
  };
  const endRule: Constraint = {
    id: 'endRule000000001',
    name: 'Named source',
    language: 'json-schema',
    expression: { properties: { properties: { required: ['title'] } } },
  };
  const filedIn: Relation = model.createRelation({
    name: 'FILED_IN',
    from: { node: document, constraints: [endRule] },
    to: { node: folder },
    constraints: [linkRule],
  }).element;
  assert.deepEqual(filedIn.constraints, [linkRule]);
  assert.deepEqual(filedIn.from.constraints, [endRule]);

  const edited: Relation = model.updateRelation(filedIn.id, {
    constraints: [],
    from: { ...filedIn.from, constraints: [] },
  }).element;
  assert.deepEqual(edited.constraints, []);
  assert.deepEqual(edited.from.constraints, []);
  assert.equal(model.validate().valid, true);
});

void test('one constraint can be read, changed and removed on each kind of owner', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const status: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const draft: Literal = model.createLiteral(status.id, { name: 'Draft', literal: 'draft' }).element;
  const title: Attribute = model.createAttribute(document, { name: 'title', typeId: DataTypes.String }).element;
  const filedIn: Relation = model.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder },
  }).element;
  const owners: readonly ConstraintOwner[] = [document, title, status, draft, filedIn, filedIn.from, filedIn.to];

  owners.forEach((owner: ConstraintOwner, index: number): void => {
    const first: Constraint = {
      id: `firstRule${String(index).padStart(8, '0')}`,
      name: 'First rule',
      language: 'json-schema',
      expression: {},
    };
    const second: Constraint = {
      id: `secondRule${String(index).padStart(8, '0')}`,
      name: 'Second rule',
      language: 'json-schema',
      expression: {},
    };

    model.addConstraint(owner, first);
    model.addConstraint(owner, second);
    assert.deepEqual(model.getConstraints(owner), [first, second]);
    assert.throws((): ModelChange<Constraint> => model.addConstraint(owner, first), /already exists/);

    const changed: Constraint = model.updateConstraint(owner, first.id, { name: 'Changed rule' }).element;
    assert.deepEqual(model.getConstraints(owner), [changed, second]);
    assert.deepEqual(model.removeConstraint(owner, first.id).element, changed);
    assert.deepEqual(model.getConstraints(owner), [second]);
    assert.throws((): ModelChange<Constraint> => model.removeConstraint(owner, first.id), /not found/);
  });

  assert.equal(model.validate().valid, true);
});

void test('constraint edits keep the declaring model as their owner', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const rule: Constraint = { id: 'titleRule00000001', name: 'Title rule', language: 'json-schema', expression: {} };
  base.addConstraint(document, rule);

  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;

  assert.deepEqual(website.getConstraints(document), [rule]);
  assert.deepEqual(website.getConstraints(page), []);
  assert.throws((): ModelChange<Constraint> => website.removeConstraint(document, rule.id), /another model/);

  const changed: Constraint = base.updateConstraint(document, rule.id, { name: 'Updated title rule' }).element;
  assert.deepEqual(website.getConstraints(document), [changed]);
  assert.equal(website.validate().valid, true);
});

void test('constraint owners with the same local ID require a model identity', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const baseRule: Constraint = { id: 'baseRule00000001', name: 'Base rule', language: 'json-schema', expression: {} };
  base.addConstraint(document, baseRule);

  const website: Modeller = base.createNextLevel('Website');
  const localRule: Constraint = { id: 'localRule0000001', name: 'Local rule', language: 'json-schema', expression: {} };
  website.createNode({ name: 'Page', refines: document, constraints: [localRule] });
  const raw: Model = website.getModel();
  const page: Model['classifiers'][number] | undefined = raw.classifiers.find(
    (item: Model['classifiers'][number]): boolean => item.kind === 'Node',
  );
  assert.ok(page?.kind === 'Node');
  page.id = document.id;

  const restored: Modeller = Modeller.load(raw, [base.getModel()]);
  assert.equal(restored.validate().valid, true);
  assert.throws((): readonly Constraint[] => restored.getConstraints(page), /ambiguous/);
  assert.deepEqual(restored.getConstraints({ modelId: raw.id, elementId: page.id }), [localRule]);
  assert.deepEqual(restored.getConstraints({ modelId: base.getModel().id, elementId: document.id }), [baseRule]);

  const added: Constraint = { id: 'addedRule0000001', name: 'Added rule', language: 'json-schema', expression: {} };
  assert.throws((): ModelChange<Constraint> => restored.addConstraint(page, added), /ambiguous/);
  restored.addConstraint({ modelId: raw.id, elementId: page.id }, added);
  assert.deepEqual(restored.getConstraints({ modelId: raw.id, elementId: page.id }), [localRule, added]);
});

void test('a refined relation accepts a local name and constraint at creation', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;

  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const rule: Constraint = { id: 'appliedRule000001', name: 'Link rule', language: 'example:link', expression: 'check link' };
  const applied: Relation = website.createRelation({
    refines: filedIn,
    name: 'PAGE_FILED_IN',
    from: { node: page },
    to: { node: section },
    constraints: [rule],
  }).element;

  assert.equal(applied.name, 'PAGE_FILED_IN');
  assert.deepEqual(applied.constraints, [rule]);
  assert.equal(website.validate().valid, true);
});

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

void test('relation bounds can narrow but cannot widen a preceding level', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder, bounds: { lowerBound: 0, upperBound: 2 } },
  }).element;
  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const section: Node = next.createNode({ name: 'Section', refines: folder }).element;
  const narrowed: Relation = next.createRelation({
    refines: filedIn,
    from: { node: page },
    to: { node: section, bounds: { lowerBound: 0, upperBound: 1 } },
  }).element;
  assert.equal(narrowed.name, 'FILED_IN');

  assert.equal(next.validate().valid, true);
  const widened: ModelChange<Relation> = next.updateRelation(narrowed.id, {
    to: { ...narrowed.to, bounds: { lowerBound: 0, upperBound: 3 } },
  });
  assert.equal(widened.validation.valid, false);
  assert.ok(widened.validation.diagnostics.some((item: Diagnostic): boolean => item.code === 'RELATION_BOUNDS_WIDENED'));

  next.updateRelation(narrowed.id, { to: narrowed.to });
  assert.equal(next.validate().valid, true);
});

void test('relation removal previews and rejects dependencies, then cascades across levels', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;
  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const pageFiledIn: Relation = website.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } }).element;
  const edition: Modeller = base.createNextLevel('Edition');
  const letter: Node = edition.createNode({ name: 'Letter', refines: document }).element;
  const series: Node = edition.createNode({ name: 'Series', refines: folder }).element;
  const letterFiledIn: Relation = edition.createRelation({
    refines: filedIn,
    from: { node: letter },
    to: { node: series },
  }).element;
  const publication: Modeller = website.createNextLevel('Publication');
  const post: Node = publication.createNode({ name: 'Post', refines: page }).element;
  const part: Node = publication.createNode({ name: 'Part', refines: section }).element;
  const postFiledIn: Relation = publication.createRelation({
    refines: pageFiledIn,
    from: { node: post },
    to: { node: part },
  }).element;
  const before: readonly Model[] = base.getModels();

  const preview: RelationRemovalPreview = base.previewRelationRemoval(filedIn.id);
  assert.deepEqual(
    preview.relations.map((item: WorkspaceElement): string => item.elementId),
    [filedIn.id, pageFiledIn.id, letterFiledIn.id, postFiledIn.id],
  );
  assert.throws((): ModelChange<Relation> => base.removeRelation(filedIn.id), /still used by/);
  assert.deepEqual(base.getModels(), before);

  base.removeRelation(filedIn.id, { cascade: true });
  assert.deepEqual(base.getModel().relations, []);
  assert.deepEqual(website.getModel().relations, []);
  assert.deepEqual(edition.getModel().relations, []);
  assert.deepEqual(publication.getModel().relations, []);
  assert.deepEqual([publication.validate().valid, edition.validate().valid], [true, true]);
});

void test('removing a leaf relation keeps its parent available', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;
  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const applied: Relation = website.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } }).element;

  assert.equal(website.previewRelationRemoval(applied.id).relations.length, 1);
  website.removeRelation(applied.id);
  assert.equal(base.getModel().relations.length, 1);
  assert.equal(website.getModel().relations.length, 0);
  assert.equal(website.validate().valid, true);
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

void test('parallel relationships require an explicit modelling choice', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } });
  const copiedTo: Relation = base.createRelation({ name: 'COPIED_TO', from: { node: document }, to: { node: folder } }).element;

  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const section: Node = next.createNode({ name: 'Section', refines: folder }).element;
  const choices: readonly RelationSuggestion[] = next.suggestRelations(page, section);
  const before: Model = next.getModel();

  assert.equal(choices.length, 2);
  assert.throws((): ModelChange<Relation> => next.createRelation({ from: { node: page }, to: { node: section } }), /found 2/);
  assert.deepEqual(next.getModel(), before);

  const selected: Relation = next.createRelation({ refines: copiedTo, from: { node: page }, to: { node: section } }).element;
  const existing: readonly RelationSelection[] = next.getRelations(page, section);
  assert.equal(selected.name, 'COPIED_TO');
  assert.ok(existing.some((item: RelationSelection): boolean => item.ref === `${next.getModel().id}:${selected.id}`));
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
