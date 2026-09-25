import assert from 'node:assert/strict';
import {
  InstanceValidator,
  ModelEditor,
  ModelFactory,
  ModelValidator,
  createModelBundle,
  splitModelBundle,
} from '../dist/model/index.js';
import type {
  Attribute,
  CreateBundleResult,
  Model,
  ModelInstanceGraph,
  Node,
  ProjectValidationResult,
  ValidationResult,
} from '../dist/model/index.js';

// A domain outside RAMEN starts with its own base model.
const vehicle: Node = {
  kind: 'Node',
  id: 'vehicleType00001',
  name: 'Vehicle',
  superTypes: [],
  attributes: [],
};

const emptyTransport: Model = ModelFactory.createRootModel({
  id: 'transportBase0001',
  uri: 'https://example.org/models/transport',
  name: 'Transport',
  version: '1.0.0',
});
const transport: Model = ModelEditor.addClassifier(emptyTransport, vehicle);

const emptyProject: Model = ModelFactory.createModel(transport, {
  id: 'bicycleProject001',
  uri: 'https://example.org/models/bicycle-project',
  name: 'Bicycle Project',
  version: '1.0.0',
});

const bicycle: Node = ModelFactory.createNode(transport.id, { name: 'Bicycle', baseNodeId: vehicle.id });
const withBicycle: Model = ModelEditor.addClassifier(emptyProject, bicycle);

const gears: Attribute = ModelFactory.createAttribute({
  name: 'gears',
  typeId: 'Integer',
  bounds: { lowerBound: 1, upperBound: 1 },
});

const project: Model = ModelEditor.addAttribute(withBicycle, bicycle.id, gears);
const validation: ProjectValidationResult = new ModelValidator().validateProject(project.id, [transport, project]);

if (!validation.valid) throw new Error(JSON.stringify(validation.diagnostics));
assert.equal(validation.valid, true);

const data: ModelInstanceGraph = {
  modelId: project.id,
  nodes: [{ id: 'bicycleObject001', typeId: bicycle.id, properties: { gears: 7 } }],
  relations: [],
};

const instanceResult: ValidationResult = new InstanceValidator().validate(validation.graph, data);
assert.equal(instanceResult.hasErrors, false);

const exported: CreateBundleResult = createModelBundle(project.id, [transport, project]);
if (!exported.ok) throw new Error(JSON.stringify(exported.diagnostics));
assert.equal(exported.ok, true);

const parsed: unknown = JSON.parse(JSON.stringify(exported.bundle));
const restored: readonly Model[] = splitModelBundle(parsed);
assert.equal(restored.length, 2);

console.log(`Created ${project.name} with ${project.classifiers.length} node type.`);
