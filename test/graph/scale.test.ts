import assert from 'node:assert/strict';
import test from 'node:test';
import { Modeler, ModelValidator, InstanceValidator } from '../../dist/model/index.js';
import type {
  AttributeSuggestion,
  Bounds,
  Diagnostic,
  Model,
  ModelInstanceGraph,
  ModelInstanceNode,
  ModelInstanceRelation,
  Node,
  ProjectValidationResult,
  Relation,
} from '../../dist/model/index.js';
import { attribute, model, node, relation } from '../models.ts';

function id(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(16, '0')}`;
}

function broadModel(size: number): Model {
  const result: Model = model('largeGraphModel01');
  for (let index: number = 0; index < size; index += 1) {
    result.classifiers.push(node(id('node', index), `Document${index}`));
    result.relations.push(
      relation(id('relation', index), 'NEXT', id('node', index), id('node', (index + 1) % size), {
        lowerBound: 1,
        upperBound: 1,
      }),
    );
  }
  return result;
}

function broadData(owner: Model, size: number): ModelInstanceGraph {
  const nodes: ModelInstanceNode[] = [];
  const relations: ModelInstanceRelation[] = [];
  for (let index: number = 0; index < size; index += 1) {
    nodes.push({ id: id('record', index), typeId: id('node', index), properties: {} });
    relations.push({
      id: id('edge', index),
      typeId: id('relation', index),
      fromId: id('record', index),
      toId: id('record', (index + 1) % size),
    });
  }
  return { modelId: owner.id, nodes, relations };
}

void test('a graph with 1000 node types and 1000 relation types validates data and detects a missing edge', (): void => {
  const source: Model = broadModel(1000);
  const result: ProjectValidationResult = new ModelValidator().validateProject(source.id, [source]);
  assert.ok(result.valid, JSON.stringify(result.diagnostics));
  const data: ModelInstanceGraph = broadData(source, 1000);
  const validator: InstanceValidator = new InstanceValidator();
  assert.equal(validator.validate(result.graph, data).hasErrors, false);

  const missing: ModelInstanceGraph = { ...data, relations: data.relations.slice(1) };
  const diagnostics: readonly Diagnostic[] = validator.validate(result.graph, missing).diagnostics;
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, 'INSTANCE_CARDINALITY_INVALID');
  assert.equal(diagnostics[0]?.ref, id('relation', 0));
  const restored: Modeler = Modeler.import(Modeler.load(source).export());
  assert.deepEqual(restored.getModel(), source);
});

function modelChain(depth: number): readonly Model[] {
  const models: Model[] = [];
  let previous: Model | undefined;
  for (let level: number = 0; level < depth; level += 1) {
    const current: Model = model(id('level', level), previous ? [previous] : []);
    const owner: Node = node(id('type', level), `Document${level}`, previous ? [`${previous.id}:${id('type', level - 1)}`] : []);
    const link: Relation = relation(id('link', level), 'RELATED', owner.id, owner.id);
    if (previous) link.superTypes = [`${previous.id}:${id('link', level - 1)}`];
    else owner.attributes.push(attribute('inheritedTitle01', 'title', 'String'));
    current.classifiers.push(owner);
    current.relations.push(link);
    models.push(current);
    previous = current;
  }
  return models;
}

void test('120 model levels preserve ancestry, inherited attributes and exchange without copied declarations', (): void => {
  const models: readonly Model[] = modelChain(120);
  const root: Model | undefined = models.at(-1);
  assert.ok(root);
  const project: Modeler = Modeler.load(root, models.slice(0, -1));
  const result: ProjectValidationResult = project.validate();
  assert.ok(result.valid, JSON.stringify(result.diagnostics));
  assert.equal(result.graph.getNodeAncestors(root.id, id('type', 119)).length, 119);
  assert.equal(result.graph.getTransitiveImports(root.id).length, 119);

  const restored: Modeler = Modeler.import(JSON.parse(JSON.stringify(project.export())) as unknown);
  const properties: readonly AttributeSuggestion[] = restored.suggestAttributes(id('type', 119));
  assert.deepEqual(
    properties.map((item: AttributeSuggestion): string => item.name),
    ['title'],
  );
  assert.equal(properties[0]?.inherited, true);
  assert.deepEqual(restored.export(), project.export());
  assert.equal(project.getModel().classifiers[0]?.kind, 'Node');
});

void test('combined endpoint reuse and cardinality refinement agree with validation', (): void => {
  const intervals: readonly Bounds[] = [
    { lowerBound: 0, upperBound: 1 },
    { lowerBound: 1, upperBound: 1 },
    { lowerBound: 0, upperBound: -1 },
    { lowerBound: 2, upperBound: 3 },
  ];
  for (const bounds of intervals) {
    for (const refineFrom of [false, true]) {
      for (const refineTo of [false, true]) checkCombination(bounds, refineFrom, refineTo);
    }
  }
});

function checkCombination(bounds: Bounds, refineFrom: boolean, refineTo: boolean): void {
  const base: Modeler = Modeler.create('Documents');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  base.createRelation({ name: 'IN_FOLDER', fromNodeId: document, toNodeId: folder, toBounds: { lowerBound: 0, upperBound: 1 } });
  const child: Modeler = base.createNextLevel('Edition');
  const from: Node = refineFrom ? child.createNode({ name: 'Letter', refines: document }).element : document;
  const to: Node = refineTo ? child.createNode({ name: 'Archive', refines: folder }).element : folder;
  const connection: Relation = child.connect(from, to).element;

  const result: ProjectValidationResult = child.updateRelation(connection.id, { to: { ...connection.to, bounds } }).validation;
  const allowed: boolean = bounds.upperBound === 1;
  assert.equal(result.valid, allowed, JSON.stringify({ bounds, refineFrom, refineTo }));
  if (allowed) assert.equal(Modeler.import(child.export()).validate().valid, true);
  else assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'RELATION_BOUNDS_WIDENED'));
}
