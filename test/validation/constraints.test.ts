import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, DiagnosticPath } from '../../dist/index.js';
import type { GConstraint } from '../../dist/index.js';

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
  const registry = ConstraintRegistry.createDefault();
  const diagnostics = registry.evaluate(constraint('^[A-Z]'), {
    modelId: 'constraintModel1',
    ownerId: 'constraintOwner1',
    value: 'lowercase',
    path: DiagnosticPath.root().property('name'),
  });
  assert.equal(diagnostics[0]?.code, 'CONSTRAINT_REGEX_MISMATCH');
  assert.equal(diagnostics[0]?.path, '/name');
});

void test('reports invalid expressions and unregistered languages', () => {
  const registry = ConstraintRegistry.createDefault();
  const context = {
    modelId: 'constraintModel1',
    ownerId: 'constraintOwner1',
    value: 'value',
    path: DiagnosticPath.root(),
  };
  assert.equal(registry.evaluate(constraint('['), context)[0]?.code, 'CONSTRAINT_EXPRESSION_INVALID');
  assert.equal(registry.evaluate(constraint('x', 'unknown'), context)[0]?.code, 'CONSTRAINT_LANGUAGE_UNSUPPORTED');
});
