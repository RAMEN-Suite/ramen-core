import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DiagnosticPath,
  RegexEvaluator,
  FormatEvaluator,
  Modeller,
  DataTypes,
  ModelValidator,
  type ElementRef,
  type Literal,
  type Constraint,
  type ConstraintContext,
  type Diagnostic,
  type Node,
  type Relation,
  type Model,
} from '@ramen-suite/core/model';

const context: ConstraintContext = {
  modelId: 'model',
  ownerId: 'owner',
  target: 'attribute',
  value: 'Ärger',
  path: DiagnosticPath.root(),
};
const regex: Constraint = { id: 'unicodeRule00001', name: 'Uppercase', language: 'regex', expression: '^\\p{Lu}' };

void test('regular expressions use Unicode syntax and distinguish invalid values from invalid expressions', (): void => {
  const evaluator: RegexEvaluator = new RegexEvaluator();
  assert.deepEqual(evaluator.evaluate(regex, context), []);
  assert.equal(evaluator.evaluate(regex, { ...context, value: 'ärger' })[0]?.code, 'CONSTRAINT_REGEX_MISMATCH');
  assert.equal(evaluator.evaluate(regex, { ...context, value: 7 })[0]?.code, 'CONSTRAINT_VALUE_TYPE_INVALID');
  assert.ok(evaluator.validateExpression('\\q'));

  const format: Constraint = { ...regex, language: 'format', expression: 'email' };
  const formats: FormatEvaluator = new FormatEvaluator();
  assert.equal(formats.evaluate(format, { ...context, value: 7 })[0]?.code, 'CONSTRAINT_VALUE_TYPE_INVALID');
  assert.equal(formats.evaluate({ ...format, expression: 'unknown' }, context)[0]?.code, 'CONSTRAINT_EXPRESSION_INVALID');
});

void test('relation cardinality identifies each affected record and formats an unlimited maximum', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const relation: Relation = model.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder, bounds: { lowerBound: 1, upperBound: -1 } },
  }).element;
  const diagnostics: readonly Diagnostic[] = model.validateInstances({
    nodes: [
      { id: 'firstDocument001', typeId: document.id, properties: {} },
      { id: 'secondDocument01', typeId: document.id, properties: {} },
    ],
    relations: [],
  }).diagnostics;

  assert.deepEqual(
    diagnostics.map((item: Diagnostic): string | undefined => item.instanceId),
    ['firstDocument001', 'secondDocument01'],
  );
  for (const diagnostic of diagnostics) {
    assert.equal(diagnostic.ref, relation.id);
    assert.match(diagnostic.message, /expected 1\.\.\*/);
    assert.ok(diagnostic.message.includes(diagnostic.instanceId ?? 'missing'));
  }
});

void test('node validation retains relation scope errors on incident definitions', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const relation: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;
  const next: Modeller = Modeller.createLevel(base.getModel(), 'Edition');
  const letter: Node = next.createNode({ name: 'Letter', refines: document }).element;
  const raw: Model = next.getModel();
  const invalid: Relation = {
    ...relation,
    id: 'invalidRelation1',
    superTypes: [],
    from: { ...relation.from, nodeId: letter.id },
    to: { ...relation.to, nodeId: `${base.getModel().id}:${folder.id}` },
  };
  const loaded: Modeller = Modeller.load({ ...raw, relations: [invalid] }, [base.getModel()]);

  const findings: readonly Diagnostic[] = loaded.validateNode(letter).diagnostics;
  assert.equal(loaded.validateNode(letter).hasErrors, true);
  assert.ok(
    findings.some(
      (item: Diagnostic): boolean => item.code === 'RELATION_SCOPE_INVALID' && item.path?.endsWith('/relations/0') === true,
    ),
  );
});

void test('schema failures retain individual input paths and validators refresh after edits', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const raw: Model = model.getModel();
  const diagnostics: readonly Diagnostic[] = new ModelValidator().validateProject(raw.id, [
    { ...raw, name: 7, version: 9 },
  ]).diagnostics;
  assert.ok(diagnostics.some((item: Diagnostic): boolean => item.path === '/models/0/name'));
  assert.ok(diagnostics.some((item: Diagnostic): boolean => item.path === '/models/0/version'));

  const type: string = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element.id;
  for (const name of ['Draft', 'Final', 'Archived']) model.createLiteral(type, { name });
  assert.deepEqual(
    Modeller.import(model.export())
      .getDataType(type)
      ?.literals?.map((item: Literal): string => item.name),
    ['Draft', 'Final', 'Archived'],
  );
  assert.equal(model.validate().valid, true);
  model.createNode('Document');
  assert.equal(model.validate().valid, true);
});

void test('retained validators refresh expressions after failed and successful edits', (): void => {
  const model: Modeller = Modeller.create('Edition');
  const rule: Constraint = { ...regex, language: 'json-schema', expression: { minLength: 3 } };
  const type: string = model.createDataType({ name: 'Code', baseType: DataTypes.String, constraints: [rule] }).element.id;
  const owner: ElementRef = { modelId: model.getModel().id, elementId: type };
  assert.equal(model.validateValue(type, 'Hi').hasErrors, true);
  assert.equal(model.validateValue(type, 'Hello').hasErrors, false);

  model.updateConstraint(owner, rule.id, { expression: { minLength: 6 } });
  assert.equal(model.validateValue(type, 'Hello').hasErrors, true);
  model.updateConstraint(owner, rule.id, { expression: { minLength: 2 } });
  assert.equal(model.validateValue(type, 'Hi').hasErrors, false);

  model.updateConstraint(owner, rule.id, { language: 'regex', expression: '[' });
  assert.equal(model.validate().valid, false);
  model.updateConstraint(owner, rule.id, { expression: '^H' });
  assert.equal(model.validate().valid, true);
  assert.equal(model.validateValue(type, 'Hello').hasErrors, false);
});
