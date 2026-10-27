import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosticPath, JsonSchemaEvaluator, type Constraint, type ConstraintContext } from '@ramen-suite/core/model';

void test('schemas remain evaluable after repeated use and many intervening expressions', (): void => {
  const evaluator: JsonSchemaEvaluator = new JsonSchemaEvaluator();
  const expression: Record<string, unknown> = { minLength: 3 };
  const constraint: Constraint = { id: 'lengthRule000001', name: 'Length', language: 'json-schema', expression };
  const context: ConstraintContext = {
    modelId: 'model',
    ownerId: 'owner',
    target: 'dataType',
    value: 'Hi',
    path: DiagnosticPath.root(),
  };

  assert.equal(evaluator.validateExpression(expression), undefined);
  assert.equal(evaluator.evaluate(constraint, context)[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.deepEqual(evaluator.evaluate(constraint, { ...context, value: 'Hello' }), []);

  for (let index: number = 0; index < 256; index++) {
    const rule: Constraint = { ...constraint, expression: { const: index } };
    assert.equal(evaluator.validateExpression(rule.expression), undefined);
    assert.deepEqual(evaluator.evaluate(rule, { ...context, value: index }), []);
    assert.equal(evaluator.evaluate(rule, { ...context, value: index + 1 })[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  }

  assert.equal(evaluator.validateExpression({ minLength: 3 }), undefined);
  assert.equal(evaluator.evaluate(constraint, context)[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.deepEqual(evaluator.evaluate(constraint, { ...context, value: 'Hello' }), []);
});
