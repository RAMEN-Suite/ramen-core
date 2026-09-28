import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelConnections, ModelEditor, ModelValidator, Modeler } from '../../dist/ramen-core/model/index.js';
import type {
  Model,
  ModelAdvisor,
  Node,
  Relation,
  RelationSelection,
  RelationSuggestion,
  ProjectValidationResult,
} from '../../dist/ramen-core/model/index.js';
import { model, node, relation } from '../models.ts';

interface Fixture {
  readonly base: Model;
  readonly project: Model;
  readonly document: Node;
  readonly folder: Node;
  readonly link: Relation;
}

function fixture(): Fixture {
  const base: Model = model('connectionBase001');
  const document: Node = node('connectionDoc0001', 'Document');
  const folder: Node = node('connectionFolder1', 'Folder');
  const link: Relation = relation('connectionLink001', 'IN_FOLDER', document.id, folder.id);
  base.classifiers = [document, folder];
  base.relations = [link];
  const project: Model = model('connectionModel01', [base]);
  project.classifiers = [
    node('connectionLetter1', 'Letter', [`${base.id}:${document.id}`]),
    node('connectionArchive', 'Archive', [`${base.id}:${folder.id}`]),
  ];
  return { base, project, document, folder, link };
}

function connections(project: Model, dependencies: readonly Model[]): ModelConnections {
  const result: ProjectValidationResult = new ModelValidator().validateProject(project.id, [project, ...dependencies]);
  assert.equal(result.valid, true, JSON.stringify(result.diagnostics));
  if (!result.valid) throw new Error('Expected a valid model.');
  return new ModelConnections(result);
}

void test('generic connection uses a suggestion or infers a unique relation without changing its snapshot', (): void => {
  const input: Fixture = fixture();
  const api: ModelConnections = connections(input.project, [input.base]);
  const choices: readonly RelationSuggestion[] = api.suggestRelations('connectionLetter1', 'connectionArchive');
  const choice: RelationSuggestion | undefined = choices[0];
  assert.ok(choice);
  const selected: Relation = api.connect('connectionLetter1', 'connectionArchive', choice);
  const inferred: Relation = api.connect('connectionLetter1', 'connectionArchive');
  assert.deepEqual(selected.superTypes, [choice.ref]);
  assert.deepEqual(inferred.superTypes, selected.superTypes);
  assert.equal(input.project.relations.length, 0);
  const edited: Model = ModelEditor.addRelation(input.project, selected);
  assert.equal(new ModelValidator().validateProject(edited.id, [edited, input.base]).valid, true);
});

void test('ambiguous connections require a choice and incompatible choices are rejected', (): void => {
  const input: Fixture = fixture();
  input.base.relations.push(relation('connectionLink002', 'FILED_UNDER', input.document.id, input.folder.id));
  const api: ModelConnections = connections(input.project, [input.base]);
  const ref: string = `${input.base.id}:${input.link.id}`;
  assert.throws((): Relation => api.connect('connectionLetter1', 'connectionArchive'), /found 2/);
  assert.deepEqual(api.connect('connectionLetter1', 'connectionArchive', ref).superTypes, [ref]);
  assert.throws((): Relation => api.connect('connectionArchive', 'connectionLetter1', ref), /does not connect/);
  assert.throws((): Relation => api.connect('connectionLetter1', 'connectionArchive', 'unknownRelation01'), /does not connect/);
});

void test('generic connections cannot skip a level that did not select a relation', (): void => {
  const input: Fixture = fixture();
  const child: Model = model('connectionChild01', [input.project, input.base]);
  const api: ModelConnections = connections(child, [input.project, input.base]);
  const from: string = `${input.base.id}:${input.document.id}`;
  const to: string = `${input.base.id}:${input.folder.id}`;
  assert.deepEqual(api.suggestRelations(from, to), []);
  assert.throws((): Relation => api.connect(from, to), /found 0/);
});

void test('relation refinement preserves composition and navigation while keeping new identities', (): void => {
  const input: Fixture = fixture();
  input.link.to.isComposite = true;
  input.link.to.isNavigable = false;
  input.link.from.isNavigable = true;
  const api: ModelConnections = connections(input.project, [input.base]);
  const refined: Relation = api.connect('connectionLetter1', 'connectionArchive');
  assert.equal(refined.to.isComposite, true);
  assert.equal(refined.to.isNavigable, false);
  assert.equal(refined.from.isNavigable, true);
  assert.notEqual(refined.to.id, input.link.to.id);
  const edited: Model = ModelEditor.addRelation(input.project, refined);
  assert.equal(new ModelValidator().validateProject(edited.id, [edited, input.base]).valid, true);
});

void test('adding a relation detaches its nested values from the caller', (): void => {
  const input: Fixture = fixture();
  const api: ModelConnections = connections(input.project, [input.base]);
  const link: Relation = api.connect('connectionLetter1', 'connectionArchive');
  const edited: Model = ModelEditor.addRelation(input.project, link);
  link.to.bounds.lowerBound = 9;
  assert.equal(edited.relations[0]?.to.bounds.lowerBound, 0);
  assert.equal(input.project.relations.length, 0);
});

void test('getRelations is read-only, retains endpoint identities and does not create missing refinements', (): void => {
  const base: Modeler = Modeler.create('Documents');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const relation: Relation = base.createRelation({ name: 'IN_FOLDER', fromNode: document, toNode: folder }).element;
  const child: Modeler = base.createNextLevel('Edition');
  const letter: Node = child.createNode({ name: 'Letter', refines: document }).element;
  const before: Model = child.getModel();
  const matches: readonly RelationSelection[] = child.getRelations(document, folder);
  const selected: RelationSelection | undefined = matches[0];
  assert.ok(selected);
  assert.equal(matches.length, 1);
  assert.equal(selected.ref, `${base.getModel().id}:${relation.id}`);
  assert.equal(selected.from, `${base.getModel().id}:${document.id}`);
  assert.equal(selected.to, `${base.getModel().id}:${folder.id}`);
  assert.deepEqual(child.getModel(), before);

  assert.deepEqual(child.getRelations(letter, folder), []);
  assert.deepEqual(child.getModel(), before);
  const refined: Relation = child.connect(letter, folder).element;
  assert.equal(child.getRelations(letter, folder)[0]?.ref, `${child.getModel().id}:${refined.id}`);
});

void test('getRelations returns all parallel relationships and an empty list for reversed endpoints', (): void => {
  const project: Modeler = Modeler.create('Documents');
  const document: Node = project.createNode('Document').element;
  const folder: Node = project.createNode('Folder').element;
  const first: Relation = project.createRelation({ name: 'IN_FOLDER', fromNode: document, toNode: folder }).element;
  const second: Relation = project.createRelation({ name: 'ARCHIVED_IN', fromNode: document, toNode: folder }).element;
  const before: Model = project.getModel();
  const matches: readonly RelationSelection[] = project.getRelations(document, folder);
  const refs: readonly string[] = matches.map((item: RelationSelection): string => item.ref);
  assert.deepEqual(refs, [`${before.id}:${first.id}`, `${before.id}:${second.id}`]);
  assert.deepEqual(project.getRelations(folder, document), []);
  assert.deepEqual(project.getModel(), before);
});

void test('getRelations cannot recover a relation omitted by an intermediate level', (): void => {
  const base: Modeler = Modeler.create('Documents');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  base.createRelation({ name: 'IN_FOLDER', fromNode: document, toNode: folder });
  const intermediate: Modeler = base.createNextLevel('Edition');
  const next: Modeler = intermediate.createNextLevel('Letters');
  assert.deepEqual(next.getRelations(document, folder), []);
  assert.equal(next.getModel().relations.length, 0);
});

void test('getRelations includes both predecessor and local definitions and rejects unknown nodes', (): void => {
  const base: Modeler = Modeler.create('Documents');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const original: Relation = base.createRelation({ name: 'IN_FOLDER', fromNode: document, toNode: folder }).element;
  const child: Modeler = base.createNextLevel('Edition');
  const refined: Relation = child.connect(document, folder).element;
  const matches: readonly RelationSelection[] = child.getRelations(document, folder);
  const refs: readonly string[] = matches.map((item: RelationSelection): string => item.ref);
  assert.deepEqual(refs, [`${child.getModel().id}:${refined.id}`, `${base.getModel().id}:${original.id}`]);
  assert.throws((): readonly RelationSelection[] => child.getRelations('unknownNode00001', folder), /Expected one node/);
});

void test('getRelations rejects an invalid model instead of presenting it as an empty valid graph', (): void => {
  const project: Modeler = Modeler.create('Documents');
  const document: Node = project.createNode('Document').element;
  const folder: Node = project.createNode('Folder').element;
  project.createRelation({
    name: 'IN_FOLDER',
    fromNode: document,
    toNode: folder,
    toBounds: { lowerBound: 2, upperBound: 1 },
  });
  const before: Model = project.getModel();
  assert.equal(project.validate().valid, false);
  assert.throws((): readonly RelationSelection[] => project.getRelations(document, folder), /invalid model/);
  assert.deepEqual(project.getModel(), before);
});

void test('generic query entry points return the same empty, single and parallel results', (): void => {
  const project: Modeler = Modeler.create('Documents');
  const document: Node = project.createNode('Document').element;
  const folder: Node = project.createNode('Folder').element;
  for (let count: number = 0; count < 3; count += 1) {
    const advisor: ModelAdvisor = project.getAdvisor();
    const api: ModelConnections = connections(project.getModel(), []);
    const expected: readonly RelationSelection[] = project.getRelations(document, folder);
    assert.equal(expected.length, count);
    assert.deepEqual(advisor.getRelations(project.getModel().id, document.id, folder.id), expected);
    assert.deepEqual(api.getRelations(document.id, folder.id), expected);
    assert.deepEqual(api.getRelations(document, folder), expected);
    assert.deepEqual(api.getRelations(folder.id, document.id), []);
    project.createRelation({ name: `FILED_IN_${count}`, fromNode: document, toNode: folder });
  }
});
