import assert from 'node:assert/strict';
import { Modeler } from '../dist/model/index.js';
import type { CreateBundleResult, Node, Relation, RelationSuggestion } from '../dist/model/index.js';

// Define which node types and connections the language permits.
const language: Modeler = Modeler.create('Documents');
const document: Node = language.createNode('Document').element;
const folder: Node = language.createNode('Folder').element;
language.createRelation({ name: 'FILED_IN', fromNodeId: document, toNodeId: folder });

// Refine the types into a project vocabulary. These are types, not captured letters.
const project: Modeler = language.createNextLevel('Correspondence');
const letter: Node = project.createNode({ name: 'Letter', refines: document }).element;
const archive: Node = project.createNode({ name: 'Archive', refines: folder }).element;
project.createAttribute(letter, { name: 'title', typeId: 'String' });

// This array contains permitted relation choices, not connected objects.
const choices: readonly RelationSuggestion[] = project.suggestRelations(letter, archive);
console.log('Relation choices for Letter → Archive:', JSON.stringify(choices, null, 2));
const selected: RelationSuggestion | undefined = choices.find(
  (choice: RelationSuggestion): boolean => choice.name === 'FILED_IN',
);
assert.ok(selected);

// A UI passes its chosen suggestion. With one possible relation, connect(letter, archive) also works.
const connection: Relation = project.connect(letter, archive, selected).element;
assert.equal(connection.from.nodeId, letter.id);
assert.equal(connection.to.nodeId, archive.id);
assert.equal(project.validate().valid, true);

const exported: CreateBundleResult = project.exportBundle();
assert.ok(exported.ok);
const restored: Modeler = Modeler.importBundle(JSON.parse(JSON.stringify(exported.bundle)) as unknown);
assert.deepEqual(restored.compareTo(project).changes, []);
console.log(`Created ${restored.getModel().name}.`);
