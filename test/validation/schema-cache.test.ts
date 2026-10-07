import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagnosticPath, JsonSchemaEvaluator, type Constraint, type ConstraintContext } from '@ramen-suite/core/model';

void test('schema retention stays bounded and evicted expressions still validate correctly', (): void => {
  const evaluator: JsonSchemaEvaluator = new JsonSchemaEvaluator();
  // Inspect retention directly: successful validation alone cannot detect an unbounded cache.
  const cache: Map<string, unknown> = Reflect.get(evaluator, 'schemas') as Map<string, unknown>;
  const expression: Record<string, unknown> = { minLength: 3 };
  const key: string = JSON.stringify(expression);
  assert.equal(evaluator.validateExpression(expression), undefined);
  const compiled: unknown = cache.get(key);
  assert.ok(compiled);
  assert.equal(evaluator.validateExpression({ minLength: 3 }), undefined);
  assert.equal(cache.get(key), compiled);

  for (let index: number = 0; index < 256; index++) {
    assert.equal(evaluator.validateExpression({ const: index }), undefined);
    assert.ok(cache.size <= 128);
  }
  assert.equal(cache.has(key), false);

  const constraint: Constraint = { id: 'lengthRule000001', name: 'Length', language: 'json-schema', expression };
  const context: ConstraintContext = {
    modelId: 'model',
    ownerId: 'owner',
    target: 'dataType',
    value: 'Hi',
    path: DiagnosticPath.root(),
  };
  assert.equal(evaluator.evaluate(constraint, context)[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.deepEqual(evaluator.evaluate(constraint, { ...context, value: 'Hello' }), []);
  assert.equal(cache.size, 128);
  assert.notEqual(cache.get(key), compiled);
});
