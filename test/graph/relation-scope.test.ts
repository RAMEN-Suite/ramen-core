import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelAdvisor, ModelRelationScope, ModelValidator, Modeler } from '../../dist/model/index.js';
import type {
  Attribute,
  AttributeSuggestion,
  Node,
  Diagnostic,
  RelationSuggestion,
  Model,
  ProjectValidationResult,
  Relation,
  ResolvedElement,
} from '../../dist/model/index.js';
import { model, node, relation } from '../models.ts';

function baseModel(): Model {
  const base: Model = model('genericScopeBase001');
  base.classifiers.push(node('genericDocument001', 'Document'), node('genericFolder00001', 'Folder'));
  base.relations.push(relation('genericContains001', 'IN_FOLDER', 'genericDocument001', 'genericFolder00001'));
  return base;
}

function refinedRelation(base: Model): Relation {
  const child: Relation = relation(
    'genericRefined001',
    'IN_FOLDER',
    `${base.id}:genericDocument001`,
    `${base.id}:genericFolder00001`,
  );
  child.superTypes = [`${base.id}:genericContains001`];
  return child;
}

void test('generic models allow only explicitly selected predecessor relations', (): void => {
  const base: Model = baseModel();
  const child: Model = model('genericScopeChild01', [base]);
  const result: ProjectValidationResult = new ModelValidator().validateProject(child.id, [child, base]);
  assert.ok(result.valid);
  const scope: ModelRelationScope = new ModelRelationScope(result.graph);
  const advisor: ModelAdvisor = new ModelAdvisor(result);
  const choices: readonly RelationSuggestion[] = advisor.suggestRelations(
    child.id,
    `${base.id}:genericDocument001`,
    `${base.id}:genericFolder00001`,
  );
  assert.deepEqual(
    choices.map((item: RelationSuggestion): string => item.relationId),
    ['genericContains001'],
  );

  assert.deepEqual(scope.available(child.id), []);
  assert.deepEqual(
    scope.bases(child.id).map((item: ResolvedElement<Relation>): string => item.element.id),
    ['genericContains001'],
  );
  child.relations.push(refinedRelation(base));
  assert.equal(new ModelValidator().validateProject(child.id, [child, base]).valid, true);
  assert.deepEqual(scope.available(child.id), []);
});

void test('generic validation rejects an invented relation and a skipped intermediate level', (): void => {
  const base: Model = baseModel();
  const middle: Model = model('genericScopeMiddle', [base]);
  const child: Model = model('genericScopeChild01', [middle, base]);
  child.relations.push(refinedRelation(base));
  const validator: ModelValidator = new ModelValidator();
  const skipped: ProjectValidationResult = validator.validateProject(child.id, [child, middle, base]);

  assert.ok(skipped.diagnostics.some((item: Diagnostic): boolean => item.code === 'RELATION_SCOPE_INVALID'));
  const invented: Relation = relation(
    'genericInvented001',
    'NEW_LINK',
    `${base.id}:genericDocument001`,
    `${base.id}:genericDocument001`,
  );
  middle.relations.push(invented);
  assert.ok(
    validator
      .validateProject(middle.id, [middle, base])
      .diagnostics.some((item: Diagnostic): boolean => item.ref === invented.id),
  );
});

void test('five refinement levels retain attributes and relation limits after shared graph exchange', (): void => {
  const base: Modeler = Modeler.create('Documents');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const title: Attribute = base.createAttribute(document, { name: 'title', typeId: 'String' }).element;
  base.createRelation({ name: 'IN_FOLDER', fromNodeId: document, toNodeId: folder, toBounds: { lowerBound: 0, upperBound: 1 } });

  let current: Modeler = base;
  let refined: Node = document;
  for (let level: number = 1; level <= 5; level += 1) {
    const next: Modeler = current.createNextLevel(`Edition${level}`);
    refined = next.createNode({ name: `Letter${level}`, refines: refined }).element;
    const connected: Relation = next.connect(refined, folder).element;
    assert.deepEqual(connected.to.bounds, { lowerBound: 0, upperBound: 1 });
    assert.equal(next.validate().valid, true);
    current = next;
  }

  const restored: Modeler = Modeler.import(JSON.parse(JSON.stringify(current.export())) as unknown);
  assert.equal(restored.getModels().length, 6);
  assert.equal(
    restored.suggestAttributes(refined).some((item: AttributeSuggestion): boolean => item.attributeId === title.id),
    true,
  );
  assert.deepEqual(restored.export(), current.export());
  assert.deepEqual(refined.attributes, []);
  assert.equal(base.getModel().classifiers.length, 2);

  const empty: Modeler = restored.createNextLevel('NoConnections');
  const later: Modeler = empty.createNextLevel('Later');
  assert.deepEqual(later.suggestRelations(refined, folder), []);
  assert.throws((): void => {
    later.connect(refined, folder);
  }, /Expected one relation/);
});
