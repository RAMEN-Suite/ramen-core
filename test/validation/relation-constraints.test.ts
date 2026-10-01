import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, Diagnostics, InstanceValidator, ModelValidator } from '../../dist/ramen-core/model/index.js';
import type {
  Constraint,
  ConstraintContext,
  Diagnostic,
  Model,
  ModelInstanceGraph,
  ProjectValidationResult,
  Relation,
  ValidationResult,
} from '../../dist/ramen-core/model/index.js';
import { model, node, relation } from '../models.ts';

function rule(id: string): Constraint {
  return { id, name: 'Check link', language: 'links', expression: 'check' };
}

function base(): Model {
  const root: Model = model('relationRulesRoot1');
  const link: Relation = relation('relationRulesLink1', 'LINK', 'relationRulesNode1', 'relationRulesNode1');
  link.constraints = [rule('relationRule00001')];
  link.from.constraints = [rule('relationRule00002')];
  link.to.constraints = [rule('relationRule00003')];
  root.classifiers = [node('relationRulesNode1', 'Record')];
  root.relations = [link];
  return root;
}

function level(parent: Model, root: Model, id: string): Model {
  const child: Model = model(id, [parent]);
  const parentLink: Relation | undefined = parent.relations[0];
  assert.ok(parentLink);
  const link: Relation = relation(`${id}Link`, 'LINK', `${root.id}:relationRulesNode1`, `${root.id}:relationRulesNode1`);
  link.superTypes = [`${parent.id}:${parentLink.id}`];
  child.relations = [link];
  return child;
}

function language(seen: ConstraintContext[]): ConstraintRegistry {
  return new ConstraintRegistry([
    {
      language: 'links',
      evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
        seen.push(context);
        return [
          Diagnostics.error({
            code: 'LINK_RULE_FAILED',
            message: 'Ancestor rule still applies.',
            ref: constraint.id,
            path: context.path,
          }),
        ];
      },
    },
  ]);
}

void test('data validates relation and endpoint constraints from all ancestor levels once', (): void => {
  const root: Model = base();
  const middle: Model = level(root, root, 'relationRulesMid1');
  const leaf: Model = level(middle, root, 'relationRulesLeaf');
  const project: ProjectValidationResult = new ModelValidator().validateProject(leaf.id, [leaf, middle, root]);
  assert.ok(project.valid);
  const seen: ConstraintContext[] = [];
  const registry: ConstraintRegistry = language(seen);
  const data: ModelInstanceGraph = {
    nodes: [{ id: 'relationRulesData', typeId: `${root.id}:relationRulesNode1`, properties: {} }],
    relations: [
      { id: 'relationRulesEdge', typeId: 'relationRulesLeafLink', fromId: 'relationRulesData', toId: 'relationRulesData' },
    ],
  };
  const result: ValidationResult = new InstanceValidator(registry).validate(project.graph, data);
  assert.equal(result.hasErrors, true);
  assert.deepEqual(
    result.diagnostics.map((item: Diagnostic): string | undefined => item.ref),
    ['relationRule00001', 'relationRule00002', 'relationRule00003'],
  );
  assert.deepEqual(
    seen.map((context: ConstraintContext): string => context.modelId),
    [root.id, root.id, root.id],
  );
  assert.deepEqual(
    seen.map((context: ConstraintContext): string => context.path.toString()),
    ['/relations/0', '/relations/0/fromId', '/relations/0/toId'],
  );
});
