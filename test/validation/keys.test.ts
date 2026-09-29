import assert from 'node:assert/strict';
import test from 'node:test';
import { Modeller, ModelFactory, RAMEN_ELEMENT, RamenModel } from '../../dist/ramen-core/index.js';
import type {
  Attribute,
  Diagnostic,
  ModelInstanceGraph,
  ModelInstanceNode,
  Node,
  ProjectValidationResult,
  ValidationResult,
} from '../../dist/ramen-core/index.js';

function addKey(project: Modeller, owner: Node, name: string): ProjectValidationResult {
  return project.createAttribute(owner, { name, typeId: 'String', bounds: { lowerBound: 1, upperBound: 1 }, isKey: true })
    .validation;
}

function data(project: Modeller, nodes: readonly ModelInstanceNode[]): ModelInstanceGraph {
  return { modelId: project.getModel().id, nodes, relations: [] };
}

void test('nodes may have zero or one key but cannot declare two keys', (): void => {
  const project: Modeller = Modeller.create('People');
  const person: Node = project.createNode('Person').element;
  assert.equal(project.validate().valid, true);
  assert.equal(addKey(project, person, 'identifier').valid, true);
  const result: ProjectValidationResult = addKey(project, person, 'email');
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.code, 'ATTRIBUTE_MULTIPLE_KEYS');
  assert.equal(result.diagnostics[0]?.ref, person.id);
});

void test('an inherited key prevents a second key even several levels below its declaration', (): void => {
  const base: Modeller = Modeller.create('People');
  const person: Node = base.createNode('Person').element;
  addKey(base, person, 'identifier');
  const project: Modeller = base.createNextLevel('Edition');
  const author: Node = project.createNode({ name: 'Author', refines: person }).element;
  const next: Modeller = project.createNextLevel('Letters');
  const writer: Node = next.createNode({ name: 'Writer', refines: author }).element;
  assert.equal(next.validate().valid, true);

  const result: ProjectValidationResult = addKey(next, writer, 'email');
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.code, 'ATTRIBUTE_MULTIPLE_KEYS');
  assert.equal(result.diagnostics[0]?.ref, writer.id);
});

void test('key duplicates are checked across the declaring node and sibling refinements after exchange', (): void => {
  const base: Modeller = Modeller.create('People');
  const person: Node = base.createNode('Person').element;
  addKey(base, person, 'identifier');
  const project: Modeller = base.createNextLevel('Edition');
  const author: Node = project.createNode({ name: 'Author', refines: person }).element;
  const editor: Node = project.createNode({ name: 'Editor', refines: person }).element;
  const nodes: ModelInstanceNode[] = [
    { id: 'personRecord0001', typeId: `${base.getModel().id}:${person.id}`, properties: { identifier: 'P001' } },
    { id: 'authorRecord0001', typeId: author.id, properties: { identifier: 'P001' } },
    { id: 'editorRecord0001', typeId: editor.id, properties: { identifier: 'P001' } },
  ];
  const restored: Modeller = Modeller.import(project.export());
  const result: ValidationResult = restored.validateInstances(data(restored, nodes));
  const duplicates: readonly Diagnostic[] = result.diagnostics;
  assert.equal(result.hasErrors, true);
  assert.equal(duplicates.length, 2);
  assert.equal(duplicates[0]?.code, 'INSTANCE_KEY_DUPLICATE');
  assert.equal(duplicates[0]?.path, '/nodes/1/properties/identifier');
  assert.equal(duplicates[0]?.ref, 'authorRecord0001');
  assert.equal(duplicates[1]?.path, '/nodes/2/properties/identifier');

  const distinct: ModelInstanceNode[] = nodes.map((node: ModelInstanceNode, index: number): ModelInstanceNode => ({
    ...node,
    properties: { identifier: `P00${index}` },
  }));
  assert.equal(restored.validateInstances(data(restored, distinct)).hasErrors, false);
});

void test('independent keys have separate scopes and each validation starts with an empty value index', (): void => {
  const project: Modeller = Modeller.create('People and places');
  const person: Node = project.createNode('Person').element;
  const place: Node = project.createNode('Place').element;
  addKey(project, person, 'identifier');
  addKey(project, place, 'identifier');
  const nodes: ModelInstanceNode[] = [
    { id: 'personRecord0001', typeId: person.id, properties: { identifier: '001' } },
    { id: 'placeRecord00001', typeId: place.id, properties: { identifier: '001' } },
  ];
  const input: ModelInstanceGraph = data(project, nodes);
  assert.equal(project.validateInstances(input).hasErrors, false);
  assert.equal(project.validateInstances(input).hasErrors, false);
  assert.equal(Modeller.import(project.export()).validateInstances(input).hasErrors, false);
});

void test('missing and wrongly typed keys report value errors rather than duplicate key errors', (): void => {
  const project: Modeller = Modeller.create('People');
  const person: Node = project.createNode('Person').element;
  addKey(project, person, 'identifier');
  const nodes: ModelInstanceNode[] = [
    { id: 'personRecord0001', typeId: person.id, properties: {} },
    { id: 'personRecord0002', typeId: person.id, properties: {} },
    { id: 'personRecord0003', typeId: person.id, properties: { identifier: 1 } },
    { id: 'personRecord0004', typeId: person.id, properties: { identifier: 1 } },
  ];
  const result: ValidationResult = project.validateInstances(data(project, nodes));
  assert.equal(result.diagnostics.length, 4);
  assert.ok(result.diagnostics.every((item: Diagnostic): boolean => item.code !== 'INSTANCE_KEY_DUPLICATE'));
});

void test('RAMEN annotation definitions cannot add a key alongside the inherited uuid', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const key: Attribute = ModelFactory.createAttribute({
    name: 'identifier',
    typeId: 'String',
    bounds: { lowerBound: 1, upperBound: 1 },
    isKey: true,
  });
  const result: ProjectValidationResult = project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    properties: [key],
  }).validation;
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'ATTRIBUTE_MULTIPLE_KEYS'));
});
