import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type {
  Attribute,
  Constraint,
  ConstraintOwner,
  Diagnostic,
  DataType,
  Literal,
  Model,
  ModelChange,
  Node,
  Relation,
} from '@ramen-suite/core/model';

void test('built-in constraint expressions are checked before any recorded value exists', (): void => {
  const cases: readonly (readonly [string, Constraint['expression']])[] = [
    ['regex', '['],
    ['regex', {}],
    ['format', 'unknown-format'],
    ['format', {}],
    ['json-schema', { type: 'bad' }],
  ];
  for (const [language, expression] of cases) {
    const model: Modeller = Modeller.create('Rules');
    const rule: Constraint = { id: 'invalidRule00001', name: 'Invalid', language, expression };
    const dataType: DataType = model.createDataType({ name: 'Code', baseType: DataTypes.String, constraints: [rule] }).element;
    const finding: Diagnostic | undefined = model
      .validate()
      .diagnostics.find((item: Diagnostic): boolean => item.code === 'CONSTRAINT_EXPRESSION_INVALID');
    assert.ok(finding, language);
    assert.equal(finding.ref, rule.id);
    assert.equal(finding.severity, 'error');
    assert.equal(finding.path, `/models/${model.getModel().id}/classifiers/0/constraints/0/expression`);

    model.updateDataType(dataType.id, { constraints: [] });
    assert.equal(model.validate().valid, true);
  }
});

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
