import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelConnections, ModelEditor, ModelValidator } from '../../dist/model/index.js';
import type { Model, Node, Relation, RelationSuggestion, ProjectValidationResult } from '../../dist/model/index.js';
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
  const choices: readonly RelationSuggestion[] = api.suggest('connectionLetter1', 'connectionArchive');
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
  assert.deepEqual(api.suggest(from, to), []);
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
