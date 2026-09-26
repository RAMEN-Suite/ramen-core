import assert from 'node:assert/strict';
import { Modeler } from '../dist/model/index.js';
import type { CreateBundleResult, ModelInstanceGraph, Node } from '../dist/model/index.js';

// Define a small modeling language once. IDs and default metadata are generated.
const transport: Modeler = Modeler.create('Transport');
const vehicle: Node = transport.createNode('Vehicle').element;
transport.createRelation({ name: 'TOWS', fromNodeId: vehicle, toNodeId: vehicle });

// Each new level remembers its base models and offers their permitted choices.
const project: Modeler = transport.createNextLevel('Bicycle Project');
const bicycle: Node = project.createNode({ name: 'Bicycle', refines: vehicle }).element;
project.createAttribute(bicycle, { name: 'gears', typeId: 'Integer' });
project.connect(bicycle, bicycle);

assert.equal(project.validate().valid, true);
assert.equal(project.suggestNodes()[0]?.name, 'Vehicle');

const data: ModelInstanceGraph = {
  modelId: project.getModel().id,
  nodes: [{ id: 'bicycleObject001', typeId: bicycle.id, properties: { gears: 7 } }],
  relations: [],
};
assert.equal(project.validateInstances(data).hasErrors, false);

const exported: CreateBundleResult = project.exportBundle();
assert.ok(exported.ok);
const restored: Modeler = Modeler.importBundle(JSON.parse(JSON.stringify(exported.bundle)) as unknown);
assert.deepEqual(restored.compareTo(project).changes, []);
console.log(`Created ${restored.getModel().name}.`);
