import assert from 'node:assert/strict';
import test, { type TestContext, type Mock } from 'node:test';
import {
  ConstraintRegistry,
  DataTypes,
  VALIDATION_ERROR,
  type ModelInstanceGraph,
  type Diagnostic,
  type Node,
  type ValidationResult,
  type ProjectValidationResult,
} from '@ramen-suite/core/model';
import {
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  RAMEN_INSTANCE_ERROR,
  RamenModel,
  RamenValidator,
  RamenValidationProfiles,
  type AnnotationShape,
} from '@ramen-suite/core/ramen';

const uuid: string = '550e8400-e29b-41d4-a716-446655440000';

function data(node: Node, properties: Readonly<Record<string, unknown>> = { uuid, label: 'Letter' }): ModelInstanceGraph {
  return { nodes: [{ id: 'letterRecord0001', typeId: node.id, properties }], relations: [] };
}

void test('instance validation reuses the workspace project result but rechecks recorded values', (context: TestContext): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const letter: Node = model.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const cached: ProjectValidationResult = model.validate();
  const check: Mock<RamenValidator['validateProject']> = context.mock.method(RamenValidator.prototype, 'validateProject');

  assert.equal(model.validateInstances(data(letter)).hasErrors, false);
  assert.equal(model.validateInstances(data(letter, { uuid, label: 7 })).hasErrors, true);
  const invalid: ValidationResult = model.validateInstances(data(letter, { uuid: 'oldIdentifier', label: 'Letter' }));
  assert.equal(invalid.hasErrors, true);
  const relaxed: ValidationResult = model.validateInstances(data(letter, { uuid: 'oldIdentifier', label: 'Letter' }), {
    constraints: ConstraintRegistry.createDefault(),
    profile: RamenValidationProfiles.LEGACY_IDENTIFIERS,
  });
  assert.equal(relaxed.hasErrors, false);
  assert.equal(relaxed.diagnostics[0]?.severity, 'warn');
  assert.equal(check.mock.calls.length, 0);
  assert.equal(model.validate(), cached);
});

void test('a changed parent level refreshes instance validation once for the shared workspace', (context: TestContext): void => {
  const parent: RamenModel = RamenModel.create('Edition');
  const letter: Node = parent.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  const child: RamenModel = parent.createNextLevel('Printed edition');
  const printed: Node = child.createNode({ name: 'PrintedLetter', refines: letter }).element;
  assert.equal(child.validateInstances(data(printed)).hasErrors, false);
  parent.createAttribute(letter, { name: 'source', typeId: DataTypes.String, bounds: { lowerBound: 1, upperBound: 1 } });
  const check: Mock<RamenValidator['validateProject']> = context.mock.method(RamenValidator.prototype, 'validateProject');

  const invalid: ValidationResult = child.validateInstances(data(printed));
  assert.equal(invalid.hasErrors, true);
  assert.equal(invalid.diagnostics[0]?.code, VALIDATION_ERROR.INSTANCE_PROPERTY_REQUIRED);
  assert.equal(invalid.diagnostics[0]?.path, '/nodes/0/properties/source');
  assert.equal(check.mock.calls.length, 1);
  assert.equal(child.validateInstances(data(printed, { uuid, label: 'Letter', source: 'Archive' })).hasErrors, false);
  assert.equal(check.mock.calls.length, 1);
});

void test('cached model errors still block instance validation', (context: TestContext): void => {
  const created: RamenModel = RamenModel.create('Edition');
  const invalid: RamenModel = RamenModel.load({ ...created.getModel(), name: '' });
  const project: ProjectValidationResult = invalid.validate();
  assert.equal(project.valid, false);
  const check: Mock<RamenValidator['validateProject']> = context.mock.method(RamenValidator.prototype, 'validateProject');

  const result: ValidationResult = invalid.validateInstances({ nodes: [], relations: [] });
  assert.equal(result.hasErrors, true);
  assert.deepEqual(result.diagnostics, project.diagnostics);
  assert.equal(check.mock.calls.length, 0);
});

void test('cached validation preserves annotation properties and refreshes edited shapes', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const shape: AnnotationShape = model.createAnnotationShape({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
    properties: [{ name: 'note', typeId: DataTypes.String }],
  }).element;
  const input: ModelInstanceGraph = {
    nodes: [
      {
        id: 'annotationRecord1',
        typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
        properties: { uuid, type: 'comment', note: 'A historical note' },
      },
    ],
    relations: [],
  };
  assert.equal(model.validateInstances(input).hasErrors, false);
  assert.equal(model.validateInstances(input).hasErrors, false);

  model.updateAnnotationShape(shape.id, { properties: [] });
  const result: ValidationResult = model.validateInstances(input);
  assert.equal(result.hasErrors, true);
  const code: string = RAMEN_INSTANCE_ERROR.ANNOTATION_PROPERTY_NOT_ALLOWED;
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === code));
});
