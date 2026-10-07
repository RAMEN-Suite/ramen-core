import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, RAMEN_ELEMENT, RAMEN_MODEL, RamenModel, RamenValidator } from '@ramen-suite/core';
import type {
  Attribute,
  Constraint,
  DataType,
  Diagnostic,
  ModelInstanceGraph,
  Node,
  RamenAnnotation,
  RamenModelDocument,
  ProjectValidationResult,
} from '@ramen-suite/core';

void test('annotation properties and their constraints share the model declaration ID space', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const note: RamenAnnotation = model.createAnnotation({
    node,
    type: 'note',
    properties: [{ id: node.id, name: 'value', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
  }).element;
  const collision: Diagnostic | undefined = model
    .validate()
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'DUPLICATE_ELEMENT_ID');

  assert.ok(collision);
  assert.equal(collision.ref, node.id);
  assert.equal(collision.severity, 'error');
  assert.equal(collision.path, `/models/${model.getModel().id}/annotations/${note.id}/properties/0/id`);
  assert.throws((): unknown => model.export(), /Duplicate element id/);
  model.updateAnnotation(note.id, {
    properties: [
      {
        name: 'value',
        typeId: DataTypes.String,
        constraints: [{ id: node.id, name: 'Length', language: 'json-schema', expression: { minLength: 1 } }],
      },
    ],
  });
  assert.ok(
    model
      .validate()
      .diagnostics.some(
        (item: Diagnostic): boolean => item.code === 'DUPLICATE_ELEMENT_ID' && item.path?.endsWith('/constraints/0/id') === true,
      ),
  );
  model.updateAnnotation(note.id, { properties: [{ name: 'value', typeId: DataTypes.String }] });
  assert.equal(model.validate().valid, true);
});

void test('property declarations cannot reuse IDs across annotation types but references can share an attribute', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const source: Attribute = model.createAttribute(node, { name: 'source', typeId: DataTypes.String }).element;
  const first: RamenAnnotation = model.createAnnotation({
    node,
    type: 'note',
    properties: [{ id: 'sharedProperty01', name: 'value', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
  }).element;
  const second: RamenAnnotation = model.createAnnotation({
    node,
    type: 'comment',
    properties: [{ id: 'sharedProperty01', name: 'value', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
  }).element;

  assert.ok(model.validate().diagnostics.some((item: Diagnostic): boolean => item.code === 'DUPLICATE_ELEMENT_ID'));
  model.updateAnnotation(first.id, { properties: [{ attribute: source }] });
  model.updateAnnotation(second.id, { properties: [{ attribute: source }] });
  assert.equal(model.validate().valid, true);
  assert.equal(RamenModel.import(model.export()).validate().valid, true);
});

void test('an annotation declaration cannot reuse its node ID', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  model.createAnnotation({ node, type: 'note' });
  const raw: RamenModelDocument = model.getModel();
  raw.annotations = raw.annotations.map((item: RamenAnnotation): RamenAnnotation => ({ ...item, id: node.id }));
  const result: ProjectValidationResult = new RamenValidator().validateProject(raw.id, [raw, RAMEN_MODEL]);

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_ID_DUPLICATE'));
});

void test('a closed annotation type must select required node properties and can be repaired', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const source: Attribute = model.createAttribute(node, {
    name: 'source',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
  }).element;
  const note: RamenAnnotation = model.createAnnotation({ node, type: 'note' }).element;
  const result: ProjectValidationResult = model.validate();
  const finding: Diagnostic | undefined = result.diagnostics.find(
    (item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_PROPERTY_INVALID',
  );

  assert.equal(result.valid, false);
  assert.ok(finding);
  assert.equal(finding.severity, 'error');
  assert.equal(finding.ref, note.id);
  assert.match(finding.message, /must select required property 'source'/);
  model.updateAnnotation(note.id, { properties: [{ attribute: source }] });
  assert.equal(model.validate().valid, true);
  assert.equal(model.validateAnnotationValue(node, 'note', 'source', 'archive').hasErrors, false);
});

void test('inherited annotation types cannot exclude a new required property on a refined node', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  model.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'note' });
  const next: RamenModel = model.createNextLevel('Research');
  const node: Node = next.createNode({ name: 'ResearchAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const source: Attribute = next.createAttribute(node, {
    name: 'source',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
  }).element;

  assert.equal(next.validate().valid, false);
  assert.ok(
    next
      .validate()
      .diagnostics.some(
        (item: Diagnostic): boolean =>
          item.code === 'RAMEN_ANNOTATION_PROPERTY_INVALID' && item.message.includes('ResearchAnnotation'),
      ),
  );
  next.updateAttribute(node.id, source.id, { bounds: { lowerBound: 0, upperBound: 1 } });
  assert.equal(next.validate().valid, true);
  assert.equal(model.validate().valid, true);
});

void test('type-owned property constraints use the generic expression checks and retain their diagnostic path', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const rule: Constraint = {
    id: 'invalidRule00001',
    name: 'Invalid schema',
    language: 'json-schema',
    expression: { type: 'bad' },
  };
  const note: RamenAnnotation = model.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    properties: [{ name: 'value', typeId: DataTypes.String, constraints: [rule] }],
  }).element;
  const finding: Diagnostic | undefined = model
    .validate()
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'CONSTRAINT_EXPRESSION_INVALID');
  assert.ok(finding);
  assert.equal(finding.ref, rule.id);
  assert.equal(finding.path, `/models/${model.getModel().id}/annotations/${note.id}/properties/0/constraints/0/expression`);

  model.updateAnnotation(note.id, {
    properties: [{ name: 'value', typeId: DataTypes.String, constraints: [{ ...rule, expression: { minLength: 3 } }] }],
  });
  assert.equal(model.validate().valid, true);
  assert.equal(
    model.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'note', 'value', 'Hi').diagnostics[0]?.code,
    'CONSTRAINT_JSON_SCHEMA_MISMATCH',
  );
});

void test('inherited type-owned properties produce the same value findings in input and graph validation', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const label: DataType = model.createDataType({ name: 'Label', baseType: DataTypes.String }).element;
  const length: Constraint = {
    id: 'labelLengthRule1',
    name: 'Length',
    language: 'json-schema',
    expression: { minLength: 3, maxLength: 6 },
  };
  model.addConstraint(label, length);
  model.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    properties: [{ name: 'value', type: label, bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  const next: RamenModel = model.createNextLevel('Research');
  const node: Node = next.createNode({ name: 'ResearchAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const restored: RamenModel = RamenModel.import(next.export());
  const values: readonly unknown[] = ['valid', 'no', 'too long', 7, undefined];

  for (const value of values) {
    const data: ModelInstanceGraph = {
      nodes: [
        {
          id: 'annotationData01',
          typeId: node.id,
          properties: { uuid: '00000000-0000-4000-8000-000000000001', type: 'note', ...(value === undefined ? {} : { value }) },
        },
      ],
      relations: [],
    };
    const inputCodes: readonly string[] = restored
      .validateAnnotationValue(node, 'note', 'value', value)
      .diagnostics.map((item: Diagnostic): string => item.code);
    const graphCodes: readonly string[] = restored
      .validateInstances(data)
      .diagnostics.map((item: Diagnostic): string => item.code);
    assert.deepEqual(graphCodes, inputCodes);
    assert.equal(inputCodes.length === 0, value === 'valid');
  }
});
