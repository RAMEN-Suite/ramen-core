import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  type Constraint,
  type Diagnostic,
  type ModelInstanceGraph,
  type Node,
  type Relation,
  type ValidationResult,
} from '@ramen-suite/core/model';

interface Website {
  readonly model: Modeller;
  readonly data: ModelInstanceGraph;
}

const baseRule: Constraint = {
  id: 'baseLinkRule0001',
  name: 'Link prefix',
  language: 'json-schema',
  expression: { properties: { id: { pattern: '^link' } } },
};
const sourceSchema: Record<string, unknown> = { properties: { properties: { properties: { title: { minLength: 3 } } } } };
const endpointRule: Constraint = {
  id: 'sourceTitleRule1',
  name: 'Source title',
  language: 'json-schema',
  expression: sourceSchema,
};
const localRule: Constraint = {
  id: 'localLinkRule001',
  name: 'Link length',
  language: 'json-schema',
  expression: { properties: { id: { maxLength: 16 } } },
};

function website(): Website {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  base.createAttribute(document, { name: 'title', typeId: DataTypes.String });
  const filedIn: Relation = base.createRelation({
    name: 'FILED_IN',
    from: { node: document, constraints: [endpointRule] },
    to: { node: folder },
    constraints: [baseRule],
  }).element;

  const model: Modeller = base.createNextLevel('Website');
  const page: Node = model.createNode({ name: 'Page', refines: document }).element;
  const section: Node = model.createNode({ name: 'Section', refines: folder }).element;
  const relation: Relation = model.createRelation({
    refines: filedIn,
    from: { node: page },
    to: { node: section },
    constraints: [localRule],
  }).element;
  const data: ModelInstanceGraph = {
    nodes: [
      { id: 'pageRecord000001', typeId: page.id, properties: { title: 'Home' } },
      { id: 'sectionRecord001', typeId: section.id, properties: {} },
    ],
    relations: [{ id: 'linkRecord000001', typeId: relation.id, fromId: 'pageRecord000001', toId: 'sectionRecord001' }],
  };
  return { model, data };
}

void test('refined relations retain inherited rules and add local rules without duplicate evaluation', (): void => {
  const fixture: Website = website();
  assert.equal(fixture.model.validateInstances(fixture.data).hasErrors, false);
  const cases: readonly (readonly [string, string])[] = [
    ['wrongRecord00001', 'baseLinkRule0001'],
    ['linkRecord0000011', 'localLinkRule001'],
  ];

  for (const [id, ruleId] of cases) {
    const data: ModelInstanceGraph = {
      ...fixture.data,
      relations: fixture.data.relations.map(
        (item: ModelInstanceGraph['relations'][number]): ModelInstanceGraph['relations'][number] => ({ ...item, id }),
      ),
    };
    const result: ValidationResult = fixture.model.validateInstances(data);

    assert.equal(result.hasErrors, true);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.ref, ruleId);
    assert.equal(result.diagnostics[0]?.path, '/relations/0/id');
  }
});

void test('refined relations still evaluate inherited source endpoint rules', (): void => {
  const fixture: Website = website();
  const data: ModelInstanceGraph = {
    ...fixture.data,
    nodes: fixture.data.nodes.map((node: ModelInstanceGraph['nodes'][number]): ModelInstanceGraph['nodes'][number] =>
      node.id === 'pageRecord000001' ? { ...node, properties: { title: 'no' } } : node,
    ),
  };

  const result: ValidationResult = fixture.model.validateInstances(data);
  const finding: Diagnostic | undefined = result.diagnostics.find((item: Diagnostic): boolean => item.ref === 'sourceTitleRule1');

  assert.equal(result.hasErrors, true);
  assert.equal(result.diagnostics.length, 1);
  assert.ok(finding);
  assert.equal(finding.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.equal(finding.path, '/relations/0/fromId/properties/title');
});
