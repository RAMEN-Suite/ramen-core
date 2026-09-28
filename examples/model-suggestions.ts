import assert from 'node:assert/strict';
import { DataTypes, Modeler } from '../dist/ramen-core/model/index.js';
import type {
  AttributeInfo,
  AttributeNameResult,
  DataTypeSuggestion,
  Model,
  Node,
  NodeInfo,
  NodeSuggestion,
  RelationSuggestion,
} from '../dist/ramen-core/model/index.js';

const model: Modeler = Modeler.create('Filing');
const document: Node = model.createNode('Document').element;
const folder: Node = model.createNode('Folder').element;
model.createAttribute(document, { name: 'title', typeId: DataTypes.String });
model.createRelation({ name: 'FILED_IN', fromNode: document, toNode: folder });

const project: Modeler = model.createNextLevel('Website');
const page: Node = project.createNode({ name: 'Page', refines: document }).element;
const section: Node = project.createNode({ name: 'Section', refines: folder }).element;
const before: readonly Model[] = project.getModels();
const nodes: readonly NodeSuggestion[] = project.suggestNodes();
const types: readonly DataTypeSuggestion[] = project.suggestDataTypes();
const choices: readonly RelationSuggestion[] = project.suggestRelations(page, section);
assert.deepEqual(
  nodes.map((node: NodeSuggestion): string => node.name),
  ['Document', 'Folder'],
);
assert.deepEqual(
  types.map((type: DataTypeSuggestion): string => type.name),
  ['Boolean', 'Float', 'Integer', 'String'],
);
assert.deepEqual(
  choices.map((choice: RelationSuggestion): string => choice.name),
  ['FILED_IN'],
);
assert.deepEqual(project.getRelations(page, section), []);
assert.deepEqual(project.suggestRelations(section, page), []);
assert.deepEqual(project.getModels(), before);

function addDescription(selected: DataTypeSuggestion): void {
  project.createAttribute(page, { name: 'description', typeId: selected });
}

function connectTypes(selected: RelationSuggestion): void {
  project.connect(page, section, selected);
}

const selectedType: DataTypeSuggestion | undefined = types.find(
  (type: DataTypeSuggestion): boolean => type.ref === DataTypes.String,
);
const selectedRelation: RelationSuggestion | undefined = choices.find(
  (choice: RelationSuggestion): boolean => choice.name === 'FILED_IN',
);
assert.ok(selectedType && selectedRelation);
addDescription(selectedType);
connectTypes(selectedRelation);

const attributes: readonly AttributeInfo[] = project.getAttributes(page);
const info: NodeInfo | undefined = project.getNodeInfo(page);
const result: AttributeNameResult = project.validateAttributeName(page, 'title');
assert.deepEqual(
  attributes.map((attribute: AttributeInfo): string => attribute.name),
  ['title', 'description'],
);
assert.ok(info);
assert.deepEqual(info.attributes, attributes);
assert.deepEqual(result, { allowed: false, conflicts: ['attribute'] });
assert.equal(project.getRelations(page, section).length, 1);
assert.equal(project.validate().valid, true);
