import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, DiagnosticPath } from '../../dist/index.js';
import type { ConstraintContext, Diagnostic, GConstraint } from '../../dist/index.js';

function constraint(expression: GConstraint['expression'], language: string = 'regex'): GConstraint {
  return {
    id: 'constraintTest01',
    name: 'starts with a letter',
    language: language,
    expression: expression,
    severity: 'error',
  };
}

void test('evaluates regex constraints with structured diagnostics', () => {
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

void test('reports invalid expressions and unregistered languages', () => {
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

void test('validates standard date and date-time formats', () => {
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
