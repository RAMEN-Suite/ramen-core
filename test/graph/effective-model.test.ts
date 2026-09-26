import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjectGraph, EffectiveModel, ModelValidator, ModelAdvisor, InstanceValidator } from '../../dist/index.js';
import type {
  ApplicableRelation,
  ModelInstanceGraph,
  ProjectValidationResult,
  Diagnostic,
  Attribute,
  EffectiveNode,
  Model,
  Node,
  Relation,
  ProjectGraphResult,
  ResolvedElement,
} from '../../dist/index.js';
import { attribute, model, node, relation } from '../models.ts';

const BASE_ID: string = 'baseModelForView';
const PROJECT_ID: string = 'projectModelView';
const BASE_NODE_ID: string = 'baseNodeForView1';
const CHILD_NODE_ID: string = 'childNodeForView';

void test('builds effective attributes across a refinement chain', (): void => {
  const base: Model = model(BASE_ID);
  const baseNode: Node = node(BASE_NODE_ID, 'Entity');

  baseNode.attributes.push(attribute('baseAttribute001', 'label', 'String', { lowerBound: 1, upperBound: 1 }));
  base.classifiers.push(baseNode);

  const project: Model = model(PROJECT_ID, [base]);
  const child: Node = node(CHILD_NODE_ID, 'Person', [`${BASE_ID}:${BASE_NODE_ID}`]);

  child.attributes.push(attribute('childAttribute01', 'birthYear', 'Integer'));
  project.classifiers.push(child);

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: PROJECT_ID, models: [project, base] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const effective: EffectiveNode | undefined = EffectiveModel.resolveNode(result.graph, PROJECT_ID, CHILD_NODE_ID);
  assert.deepEqual(
    effective?.attributes.map((item: Attribute): string => item.name),
    ['label', 'birthYear'],
  );
  assert.deepEqual(
    effective?.lineage.map((item: ResolvedElement<Node>): string => item.element.id),
    [BASE_NODE_ID, CHILD_NODE_ID],
  );
});

void test('treats relations to an imported node as direct reuse', (): void => {
  const base: Model = model(BASE_ID);
  base.classifiers.push(node(BASE_NODE_ID, 'Entity'));
  const project: Model = model(PROJECT_ID, [base]);
  project.classifiers.push(node(CHILD_NODE_ID, 'Document'));
  project.relations.push(relation('reuseRelation001', 'REFERENCES', CHILD_NODE_ID, `${BASE_ID}:${BASE_NODE_ID}`));

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: PROJECT_ID, models: [project, base] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const applicable: readonly ApplicableRelation[] = EffectiveModel.getApplicableRelations(result.graph, BASE_ID, BASE_NODE_ID);
  assert.deepEqual(
    applicable.map((item: ApplicableRelation): string => item.relation.id),
    ['reuseRelation001'],
  );
});

void test('resolves relation refinement ancestors across model boundaries', (): void => {
  const base: Model = model(BASE_ID);
  base.classifiers.push(node('baseSourceNode01', 'Source'), node('baseTargetNode01', 'Target'));
  base.relations.push(relation('baseRelation0001', 'LINKS', 'baseSourceNode01', 'baseTargetNode01'));

  const project: Model = model(PROJECT_ID, [base]);
  project.classifiers.push(
    node('childSourceNode1', 'ChildSource', [`${BASE_ID}:baseSourceNode01`]),
    node('childTargetNode1', 'ChildTarget', [`${BASE_ID}:baseTargetNode01`]),
  );

  const refined: Relation = relation('childRelation001', 'LINKS', 'childSourceNode1', 'childTargetNode1');
  refined.superTypes = [`${BASE_ID}:baseRelation0001`];
  project.relations.push(refined);

  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: PROJECT_ID, models: [project, base] });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.graph.getRelationAncestors(PROJECT_ID, refined.id).map((item: ResolvedElement<Relation>): string => item.element.id),
    ['baseRelation0001'],
  );
});

void test('inherited custom datatypes keep their declaring model in advice and data validation', (): void => {
  const base: Model = model('datatypeBase00001');
  const owner: Node = node('datatypeOwner0001', 'Record');
  owner.attributes.push(attribute('datatypeField0001', 'count', 'datatypeInteger01', { lowerBound: 1, upperBound: 1 }));
  base.classifiers.push(owner, { kind: 'DataType', id: 'datatypeInteger01', name: 'Count', baseType: 'Integer' });
  const child: Model = model('datatypeChild0001', [base]);
  child.classifiers.push(node('datatypeRefined01', 'Letter', [`${base.id}:${owner.id}`]));
  const result: ProjectValidationResult = new ModelValidator().validateProject(child.id, [child, base]);
  assert.ok(result.valid);
  const advisor: ModelAdvisor = new ModelAdvisor(result);
  const data: ModelInstanceGraph = {
    modelId: child.id,
    nodes: [{ id: 'datatypeRecord001', typeId: 'datatypeRefined01', properties: { count: 'wrong' } }],
    relations: [],
  };

  assert.equal(advisor.suggestAttributes(child.id, 'datatypeRefined01')[0]?.typeId, `${base.id}:datatypeInteger01`);
  assert.ok(
    new InstanceValidator()
      .validate(result.graph, data)
      .diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_PROPERTY_TYPE_INVALID'),
  );
});
