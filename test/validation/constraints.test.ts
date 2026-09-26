import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, DiagnosticPath, RegexEvaluator } from '../../dist/index.js';
import type { ConstraintContext, Diagnostic, Constraint } from '../../dist/index.js';

function constraint(expression: Constraint['expression'], language: string = 'regex'): Constraint {
  return {
    id: 'constraintTest01',
    name: 'starts with a letter',
    language: language,
    expression: expression,
    severity: 'error',
  };
}

void test('evaluates regex constraints with structured diagnostics', (): void => {
  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  const diagnostics: readonly Diagnostic[] = registry.evaluate(constraint('^[A-Z]'), {
    modelId: 'constraintModel1',
    ownerId: 'constraintOwner1',
    target: 'attribute',
    value: 'lowercase',
    path: DiagnosticPath.root().property('name'),
  });

  assert.equal(diagnostics[0]?.code, 'CONSTRAINT_REGEX_MISMATCH');
  assert.equal(diagnostics[0]?.path, '/name');
});

void test('reports invalid expressions and unregistered languages', (): void => {
  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  const context: ConstraintContext = {
    modelId: 'constraintModel1',
    ownerId: 'constraintOwner1',
    target: 'attribute',
    value: 'value',
    path: DiagnosticPath.root(),
  };

  assert.equal(registry.evaluate(constraint('['), context)[0]?.code, 'CONSTRAINT_EXPRESSION_INVALID');
  assert.equal(registry.evaluate(constraint('x', 'unknown'), context)[0]?.code, 'CONSTRAINT_LANGUAGE_UNSUPPORTED');
});

void test('validates standard date and date-time formats', (): void => {
  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  const context: ConstraintContext = {
    modelId: 'constraintModel1',
    ownerId: 'constraintOwner1',
    target: 'dataType',
    value: '2026-09-22',
    path: DiagnosticPath.root(),
  };

  assert.deepEqual(registry.evaluate(constraint('date', 'format'), context), []);
  assert.equal(
    registry.evaluate(constraint('date', 'format'), { ...context, value: '2026-02-30' })[0]?.code,
    'CONSTRAINT_FORMAT_MISMATCH',
  );
  assert.deepEqual(registry.evaluate(constraint('date-time', 'format'), { ...context, value: '2026-09-22T10:30:00Z' }), []);
  assert.deepEqual(registry.evaluate(constraint('email', 'format'), { ...context, value: 'name@example.org' }), []);
  assert.equal(
    registry.evaluate(constraint('email', 'format'), { ...context, value: 'invalid' })[0]?.code,
    'CONSTRAINT_FORMAT_MISMATCH',
  );
});

void test('constraint languages reject bad inputs and preserve requested diagnostic severity', (): void => {
  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  const context: ConstraintContext = {
    modelId: 'constraintModel1',
    ownerId: 'constraintOwner1',
    target: 'attribute',
    value: 'bad',
    path: DiagnosticPath.root(),
  };
  for (const rule of [constraint({}, 'regex'), constraint({}, 'format'), constraint('unsupported', 'format')]) {
    assert.equal(registry.evaluate(rule, context)[0]?.code, 'CONSTRAINT_EXPRESSION_INVALID');
  }
  assert.equal(
    registry.evaluate(constraint('date', 'format'), { ...context, value: 7 })[0]?.code,
    'CONSTRAINT_EXPRESSION_INVALID',
  );
  assert.equal(registry.evaluate(constraint('.*'), { ...context, value: 7 })[0]?.code, 'CONSTRAINT_EXPRESSION_INVALID');
  assert.throws((): void => {
    registry.register(new RegexEvaluator());
  }, /already registered/);

  for (const severity of ['warn', 'info'] as const) {
    for (const rule of [constraint('^A'), constraint('date', 'format')]) {
      const result: readonly Diagnostic[] = registry.evaluate(
        { ...rule, severity, code: 'CUSTOM', message: 'Explain this' },
        context,
      );
      assert.equal(result[0]?.severity, severity);
      assert.equal(result[0]?.code, 'CUSTOM');
      assert.equal(result[0]?.message, 'Explain this');
    }
  }
});
