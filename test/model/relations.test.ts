import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Modeller,
  type Constraint,
  type Diagnostic,
  type Model,
  type ModelChange,
  type Node,
  type Relation,
  type RelationRemovalPreview,
  type RelationSelection,
  type RelationSuggestion,
  type WorkspaceElement,
} from '@ramen-suite/core/model';

void test('a refined relation accepts a local name and constraint at creation', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;

  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const rule: Constraint = { id: 'appliedRule000001', name: 'Link rule', language: 'example:link', expression: 'check link' };
  const applied: Relation = website.createRelation({
    refines: filedIn,
    name: 'PAGE_FILED_IN',
    from: { node: page },
    to: { node: section },
    constraints: [rule],
  }).element;

  assert.equal(applied.name, 'PAGE_FILED_IN');
  assert.deepEqual(applied.constraints, [rule]);
  assert.equal(website.validate().valid, true);
});

void test('relation bounds can narrow but cannot widen a preceding level', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder, bounds: { lowerBound: 0, upperBound: 2 } },
  }).element;
  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const section: Node = next.createNode({ name: 'Section', refines: folder }).element;
  const narrowed: Relation = next.createRelation({
    refines: filedIn,
    from: { node: page },
    to: { node: section, bounds: { lowerBound: 0, upperBound: 1 } },
  }).element;

  assert.equal(narrowed.name, 'FILED_IN');

  assert.equal(next.validate().valid, true);

  const widened: ModelChange<Relation> = next.updateRelation(narrowed.id, {
    to: { ...narrowed.to, bounds: { lowerBound: 0, upperBound: 3 } },
  });

  assert.equal(widened.validation.valid, false);
  assert.ok(widened.validation.diagnostics.some((item: Diagnostic): boolean => item.code === 'RELATION_BOUNDS_WIDENED'));

  next.updateRelation(narrowed.id, { to: narrowed.to });
  assert.equal(next.validate().valid, true);
});

void test('relation removal previews and rejects dependencies, then cascades across levels', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;
  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const pageFiledIn: Relation = website.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } }).element;
  const edition: Modeller = base.createNextLevel('Edition');
  const letter: Node = edition.createNode({ name: 'Letter', refines: document }).element;
  const series: Node = edition.createNode({ name: 'Series', refines: folder }).element;
  const letterFiledIn: Relation = edition.createRelation({
    refines: filedIn,
    from: { node: letter },
    to: { node: series },
  }).element;
  const publication: Modeller = website.createNextLevel('Publication');
  const post: Node = publication.createNode({ name: 'Post', refines: page }).element;
  const part: Node = publication.createNode({ name: 'Part', refines: section }).element;
  const postFiledIn: Relation = publication.createRelation({
    refines: pageFiledIn,
    from: { node: post },
    to: { node: part },
  }).element;
  const before: readonly Model[] = base.getModels();

  const preview: RelationRemovalPreview = base.previewRelationRemoval(filedIn.id);

  assert.deepEqual(
    preview.relations.map((item: WorkspaceElement): string => item.elementId),
    [filedIn.id, pageFiledIn.id, letterFiledIn.id, postFiledIn.id],
  );
  assert.throws((): ModelChange<Relation> => base.removeRelation(filedIn.id), /still used by/);
  assert.deepEqual(base.getModels(), before);

  base.removeRelation(filedIn.id, { cascade: true });
  assert.deepEqual(base.getModel().relations, []);
  assert.deepEqual(website.getModel().relations, []);
  assert.deepEqual(edition.getModel().relations, []);
  assert.deepEqual(publication.getModel().relations, []);
  assert.deepEqual([publication.validate().valid, edition.validate().valid], [true, true]);
});

void test('removing a leaf relation keeps its parent available', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;
  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const applied: Relation = website.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } }).element;

  assert.equal(website.previewRelationRemoval(applied.id).relations.length, 1);
  website.removeRelation(applied.id);
  assert.equal(base.getModel().relations.length, 1);
  assert.equal(website.getModel().relations.length, 0);
  assert.equal(website.validate().valid, true);
});

void test('parallel relationships require an explicit modelling choice', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } });
  const copiedTo: Relation = base.createRelation({ name: 'COPIED_TO', from: { node: document }, to: { node: folder } }).element;

  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const section: Node = next.createNode({ name: 'Section', refines: folder }).element;
  const choices: readonly RelationSuggestion[] = next.suggestRelations(page, section);
  const before: Model = next.getModel();

  assert.equal(choices.length, 2);
  assert.throws((): ModelChange<Relation> => next.createRelation({ from: { node: page }, to: { node: section } }), /found 2/);
  assert.deepEqual(next.getModel(), before);

  const selected: Relation = next.createRelation({ refines: copiedTo, from: { node: page }, to: { node: section } }).element;
  const existing: readonly RelationSelection[] = next.getRelations(page, section);

  assert.equal(selected.name, 'COPIED_TO');
  assert.ok(existing.some((item: RelationSelection): boolean => item.ref === `${next.getModel().id}:${selected.id}`));
});
