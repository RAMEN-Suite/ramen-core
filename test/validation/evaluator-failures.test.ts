import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConstraintRegistry,
  DataTypes,
  Modeller,
  type Constraint,
  type ConstraintContext,
  type DataType,
  type Diagnostic,
  type ModelInstanceGraph,
  type Node,
  type ValidationResult,
} from '@ramen-suite/core/model';

function failEvaluation(_rule: Constraint, _context: ConstraintContext): readonly Diagnostic[] {
  throw new Error('Service unavailable');
}

const failure: Constraint = {
  id: 'failingRule00001',
  name: 'External check',
  language: 'external',
  expression: '',
  severity: 'warn',
};
const length: Constraint = {
  id: 'lengthRule000001',
  name: 'Length',
  language: 'json-schema',
  expression: { minLength: 3 },
};

void test('evaluator failures become errors without skipping the remaining value and record rules', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const title: DataType = model.createDataType({
    name: 'Title',
    baseType: DataTypes.String,
    constraints: [failure, length],
  }).element;
  const document: Node = model.createNode('Document').element;
  model.createAttribute(document, { name: 'title', type: title });

  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  registry.register({ language: 'external', evaluate: failEvaluation });

  const input: ValidationResult = model.validateValue(title, 'Hi', registry);
  const records: ModelInstanceGraph = {
    nodes: [{ id: 'documentRecord01', typeId: document.id, properties: { title: 'Hi' } }],
    relations: [],
  };
  const recorded: ValidationResult = model.validateInstances(records, registry);

  const checks: readonly (readonly [ValidationResult, string])[] = [
    [input, '/value'],
    [recorded, '/nodes/0/properties/title'],
  ];

  for (const [result, path] of checks) {
    assert.equal(result.hasErrors, true);
    assert.deepEqual(
      result.diagnostics.map((item: Diagnostic): string => item.code),
      ['CONSTRAINT_EVALUATION_FAILED', 'CONSTRAINT_JSON_SCHEMA_MISMATCH'],
    );
    assert.equal(result.diagnostics[0]?.severity, 'error');
    assert.equal(result.diagnostics[0]?.ref, failure.id);
    assert.equal(result.diagnostics[0]?.path, path);
    assert.match(result.diagnostics[0]?.message ?? '', /Service unavailable/);
  }
});
