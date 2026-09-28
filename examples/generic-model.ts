import assert from 'node:assert/strict';
import { DataTypes, Modeler } from '../dist/ramen-core/model/index.js';
import type { AttributeInfo, DataType, ModelFile, Node, Relation, RelationSelection } from '../dist/ramen-core/model/index.js';

// Create the model and its node types.
const model: Modeler = Modeler.create('Filing');
const document: Node = model.createNode('Document').element;
const folder: Node = model.createNode('Folder').element;
model.createAttribute(document, { name: 'title', typeId: DataTypes.String, bounds: { lowerBound: 1, upperBound: 1 } });
model.createAttribute(folder, { name: 'description', typeId: DataTypes.String });

// Declare a custom string type with two permitted values.
const visibility: DataType = model.createDataType({ name: 'Visibility', baseType: DataTypes.String }).element;
model.createLiteral(visibility.id, { name: 'Public', literal: 'public' });
model.createLiteral(visibility.id, { name: 'Private', literal: 'private' });
model.createAttribute(folder, { name: 'visibility', typeId: visibility });

// Allow at most one Folder per Document, with any number of Documents per Folder.
model.createRelation({
  name: 'FILED_IN',
  fromNode: document,
  toNode: folder,
  toBounds: { lowerBound: 0, upperBound: 1 },
});
assert.equal(model.validate().valid, true);

// Refine the vocabulary. Page inherits title; do not declare it again.
const project: Modeler = model.createNextLevel('Website');
const page: Node = project.createNode({ name: 'Page', refines: document }).element;
const section: Node = project.createNode({ name: 'Section', refines: folder }).element;
const attributes: readonly AttributeInfo[] = project.getAttributes(page);
assert.equal(attributes[0]?.name, 'title');
assert.equal(attributes[0]?.inherited, true);
assert.deepEqual(attributes[0]?.bounds, { lowerBound: 1, upperBound: 1 });
assert.deepEqual(page.attributes, []);

// Select the only permitted relation directly.
const connection: Relation = project.connect(page, section).element;
const stored: readonly RelationSelection[] = project.getRelations(page, section);
assert.equal(connection.name, 'FILED_IN');
assert.equal(stored.length, 1);
assert.equal(connection.from.nodeId, page.id);
assert.equal(connection.to.nodeId, section.id);
assert.deepEqual(connection.to.bounds, { lowerBound: 0, upperBound: 1 });
assert.deepEqual(connection.from.bounds, { lowerBound: 0, upperBound: -1 });
const folderAttributes: readonly AttributeInfo[] = project.getAttributes(section);
assert.equal(folderAttributes[0]?.name, 'description');
assert.deepEqual(folderAttributes[0]?.bounds, { lowerBound: 0, upperBound: 1 });
assert.equal(folderAttributes[1]?.name, 'visibility');
assert.equal(folderAttributes[1]?.inherited, true);
assert.equal(project.validate().valid, true);
assert.throws((): unknown => project.connect(section, page), /found 0/);

const exported: ModelFile = project.export();
const restored: Modeler = Modeler.import(JSON.parse(JSON.stringify(exported)) as unknown);
assert.deepEqual(restored.compareTo(project).changes, []);
assert.equal(restored.getRelations(page, section).length, 1);
assert.equal(restored.getAttributes(page)[0]?.inherited, true);
console.log(`Created ${restored.getModel().name}.`);
