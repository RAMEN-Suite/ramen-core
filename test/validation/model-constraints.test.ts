import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConstraintRegistry,
  Diagnostics,
  ModelValidator,
  InstanceValidator,
  ModelSchemaValidator,
  createModelBundle,
  parseModelBundle,
} from '../../dist/index.js';
import type {
  Constraint,
  ConstraintContext,
  ConstraintTarget,
  Diagnostic,
  Model,
  Node,
  Attribute,
  DataType,
  Relation,
  ModelInstanceGraph,
  ProjectValidationResult,
  CreateBundleResult,
} from '../../dist/index.js';
import { model, node, attribute, relation } from '../models.ts';

function rule(id: string, scope: Constraint['scope'] = 'model'): Constraint {
  return { id, name: 'Check declaration', language: 'declaration', expression: {}, scope };
}

function recorder(seen: ConstraintContext[], severity?: 'warn' | 'error'): ConstraintRegistry {
  return new ConstraintRegistry([
    {
      language: 'declaration',
      evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
        seen.push(context);
        if (!severity) return [];
        return [
          Diagnostics[severity]({
            code: 'DECLARATION_CHECK',
            message: 'Review declaration.',
            path: context.path,
            ref: constraint.id,
          }),
        ];
      },
    },
  ]);
}

function constrainedModel(): Model {
  const project: Model = model('constraintModel01');
  const item: Node = node('constraintNode001', 'Document');
  const label: Attribute = attribute('constraintAttr001', 'label', 'String');
  const scalar: DataType = {
    kind: 'DataType',
    id: 'constraintType001',
    name: 'Status',
    baseType: 'String',
    literals: [{ id: 'constraintLit0001', name: 'draft', constraints: [rule('constraintRule04')] }],
    constraints: [rule('constraintRule03')],
  };
  const link: Relation = relation('constraintRel001', 'LINK', item.id, item.id);
  item.constraints = [rule('constraintRule01')];
  label.constraints = [rule('constraintRule02')];
  item.attributes = [label];
  link.constraints = [rule('constraintRule05')];
  link.from.constraints = [rule('constraintRule06')];
  link.to.constraints = [rule('constraintRule07')];
  project.classifiers = [item, scalar];
  project.relations = [link];
  return project;
}

void test('model rules receive every declaration kind, owner and stable path', (): void => {
  const project: Model = constrainedModel();
  const seen: ConstraintContext[] = [];
  const result: ProjectValidationResult = new ModelValidator(recorder(seen)).validateProject(project.id, [project]);
  const targets: ConstraintTarget[] = seen.map((context: ConstraintContext): ConstraintTarget => context.target);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(targets, ['node', 'attribute', 'dataType', 'literal', 'relation', 'relationEnd', 'relationEnd']);
  assert.equal(seen[1]?.path.toString(), `/models/${project.id}/classifiers/0/attributes/0`);
  for (const context of seen) {
    assert.equal(context.scope, 'model');
    if (context.scope !== 'model') throw new Error('Expected model context.');
    assert.equal(context.value.id, context.ownerId);
    assert.equal(context.graph.project.getRootModel().id, project.id);
    assert.equal(Object.isFrozen(context.value), true);
  }
});

void test('model errors block validation while warnings preserve a usable graph', (): void => {
  const project: Model = constrainedModel();
  const errors: ProjectValidationResult = new ModelValidator(recorder([], 'error')).validateProject(project.id, [project]);
  const warnings: ProjectValidationResult = new ModelValidator(recorder([], 'warn')).validateProject(project.id, [project]);
  assert.equal(errors.valid, false);
  assert.equal(errors.diagnostics[0]?.ref, 'constraintRule01');
  assert.equal(warnings.valid, true);
  assert.equal(warnings.hasErrors, false);
  assert.equal(warnings.diagnostics[0]?.severity, 'warn');
});

void test('unsupported model languages fail, but data languages are deferred to data validation', (): void => {
  const project: Model = model('constraintModel01');
  const item: Node = node('constraintNode001', 'Document');
  item.constraints = [rule('constraintRule01')];
  project.classifiers = [item];
  const validator: ModelValidator = new ModelValidator();
  assert.equal(validator.validateProject(project.id, [project]).diagnostics[0]?.code, 'CONSTRAINT_LANGUAGE_UNSUPPORTED');
  item.constraints = [rule('constraintRule01', 'data')];
  assert.equal(validator.validateProject(project.id, [project]).valid, true);
  item.constraints = [{ ...rule('constraintRule01'), scope: undefined }];
  assert.equal(validator.validateProject(project.id, [project]).valid, true);
});

void test('scope rejects unknown values and accepts explicit or omitted data scope', (): void => {
  const project: Model = constrainedModel();
  assert.equal(ModelSchemaValidator.isValid(project), true);
  const item: Node = node('constraintNode001', 'Document');
  project.classifiers = [item];
  item.constraints = [rule('constraintRule01', 'data')];
  assert.equal(ModelSchemaValidator.isValid(project), true);
  const invalid: unknown = {
    ...project,
    classifiers: [{ ...item, constraints: [{ ...rule('constraintRule01'), scope: 'other' }] }],
  };
  assert.equal(ModelSchemaValidator.isValid(invalid), false);
});

void test('each declaration is inspected once across imports; refinements are available as graph queries', (): void => {
  const base: Model = constrainedModel();
  const child: Model = model('constraintChild01', [base]);
  child.classifiers = [node('constraintChildNode', 'Letter', [`${base.id}:constraintNode001`])];
  const seen: ConstraintContext[] = [];
  const result: ProjectValidationResult = new ModelValidator(recorder(seen)).validateProject(child.id, [base, child]);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  assert.equal(seen.length, 7);
  assert.equal(seen[0]?.modelId, base.id);
  assert.equal(seen[0]?.graph?.project.getNodeAncestors(child.id, 'constraintChildNode')[0]?.element.id, 'constraintNode001');
});

void test('invalid structure or references stop model evaluators', (): void => {
  const project: Model = constrainedModel();
  const seen: ConstraintContext[] = [];
  const validator: ModelValidator = new ModelValidator(recorder(seen));
  assert.equal(validator.validateProject(project.id, [{ ...project, kind: 'invalid' }]).valid, false);
  const link: Relation | undefined = project.relations[0];
  if (!link) throw new Error('Expected relation fixture.');
  link.from.nodeId = 'missingNode000001';
  assert.equal(validator.validateProject(project.id, [project]).valid, false);
  assert.equal(seen.length, 0);
});

void test('data validation skips model rules and executes default and explicit data rules', (): void => {
  const project: Model = model('constraintModel01');
  const item: Node = node('constraintNode001', 'Document');
  item.constraints = [
    rule('constraintRule01'),
    rule('constraintRule02', 'data'),
    { ...rule('constraintRule03'), scope: undefined },
  ];
  project.classifiers = [item];
  const seen: ConstraintContext[] = [];
  const registry: ConstraintRegistry = recorder(seen);
  const result: ProjectValidationResult = new ModelValidator(registry).validateProject(project.id, [project]);
  assert.equal(result.valid, true);
  if (!result.valid) throw new Error('Expected valid graph.');
  seen.length = 0;
  const data: ModelInstanceGraph = {
    modelId: project.id,
    nodes: [{ id: 'constraintData001', typeId: item.id, properties: {} }],
    relations: [],
  };
  assert.equal(new InstanceValidator(registry).validate(result.graph, data).hasErrors, false);
  assert.equal(seen.length, 2);
  assert.equal(seen[0]?.instanceId, 'constraintData001');
});

void test('generic bundles preserve scopes and use caller languages on both sides', (): void => {
  const project: Model = constrainedModel();
  const registry: ConstraintRegistry = recorder([]);
  const bundle: CreateBundleResult = createModelBundle(project.id, [project], registry);
  assert.equal(bundle.ok, true);
  if (!bundle.ok) throw new Error('Expected bundle.');
  assert.deepEqual(parseModelBundle(JSON.parse(JSON.stringify(bundle.bundle)) as unknown, registry).models, [project]);
  assert.throws((): void => {
    parseModelBundle(bundle.bundle);
  }, /not registered/);
});
