import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  RamenModel,
  RamenValidator,
  type Attribute,
  type Constraint,
  type DataType,
  type Diagnostic,
  type ModelInstanceGraph,
  type Node,
  type AnnotationShape,
  type RamenModelDocument,
  type ProjectValidationResult,
  type PropertyOption,
} from '@ramen-suite/core';

void test('annotation properties and their constraints share the model declaration ID space', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const note: AnnotationShape = model.createAnnotationShape({
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
  model.updateAnnotationShape(note.id, {
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
  model.updateAnnotationShape(note.id, { properties: [{ name: 'value', typeId: DataTypes.String }] });
  assert.equal(model.validate().valid, true);
});

void test('shape properties are independent declarations with unique identifiers', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const first: AnnotationShape = model.createAnnotationShape({
    node,
    type: 'note',
    properties: [{ id: 'sharedProperty01', name: 'value', typeId: DataTypes.String, bounds: { lowerBound: 0, upperBound: 1 } }],
  }).element;
  const second: AnnotationShape = model.createAnnotationShape({
    node,
    type: 'comment',
    properties: [{ id: 'sharedProperty01', name: 'value', typeId: DataTypes.Integer, bounds: { lowerBound: 0, upperBound: 1 } }],
  }).element;
  assert.ok(model.validate().diagnostics.some((item: Diagnostic): boolean => item.code === 'DUPLICATE_ELEMENT_ID'));
  model.updateAnnotationShape(first.id, { properties: [{ name: 'value', typeId: DataTypes.String }] });
  model.updateAnnotationShape(second.id, { properties: [{ name: 'value', typeId: DataTypes.Integer }] });
  assert.equal(model.validate().valid, true);
  assert.equal(model.validateAnnotationValue(node, 'note', 'value', 'text').hasErrors, false);
  assert.equal(model.validateAnnotationValue(node, 'comment', 'value', 42).hasErrors, false);
  assert.equal(model.validateAnnotationValue(node, 'comment', 'value', 'text').hasErrors, true);
  assert.equal(RamenModel.import(model.export()).validate().valid, true);
});

void test('an annotation declaration cannot reuse its node ID', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  model.createAnnotationShape({ node, type: 'note' });
  const raw: RamenModelDocument = model.getModel();
  raw.annotations = raw.annotations.map((item: AnnotationShape): AnnotationShape => ({ ...item, id: node.id }));
  const result: ProjectValidationResult = new RamenValidator().validateProject(raw.id, [raw, RAMEN_MODEL]);

  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_ID_DUPLICATE'));
});

void test('shape information includes standard, inherited and own properties exactly once', (): void => {
  const base: RamenModel = RamenModel.create('Edition');
  const node: Node = base.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  base.createAttribute(node, { name: 'source', typeId: DataTypes.String });
  base.createAnnotationShape({ node, type: 'note', properties: [{ name: 'note', typeId: DataTypes.String }] });
  const next: RamenModel = base.createNextLevel('Publication');
  const refined: Node = next.createNode({ name: 'PublishedAnnotation', refines: node }).element;
  next.createAttribute(refined, { name: 'page', typeId: DataTypes.Integer });
  const properties: readonly PropertyOption[] = next.getPropertiesForAnnotationShape(refined, 'note');
  const names: readonly string[] = properties.map((item: PropertyOption): string => item.name);

  assert.deepEqual([...names].sort(), ['note', 'page', 'selector', 'source', 'type', 'uuid']);
  assert.equal(new Set(properties.map((item: PropertyOption): string => item.ref)).size, properties.length);
  assert.equal(next.validate().valid, true);
});

void test('node properties apply automatically to every annotation shape', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const source: Attribute = model.createAttribute(node, {
    name: 'source',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
  }).element;
  model.createAnnotationShape({ node, type: 'note' });
  model.createAnnotationShape({ node, type: 'comment' });
  assert.equal(model.validate().valid, true);
  for (const type of ['note', 'comment']) {
    assert.equal(model.validateAnnotationValue(node, type, 'source', 'archive').hasErrors, false);
    assert.equal(model.validateAnnotationValue(node, type, 'source', undefined).hasErrors, true);
    assert.ok(
      model.getPropertiesForAnnotationShape(node, type).some((item: PropertyOption): boolean => item.attributeId === source.id),
    );
  }
  model.removeAttribute(node.id, source.id);
  assert.equal(model.validate().valid, true);
  assert.deepEqual(
    model.getAnnotationShapes().map((item: AnnotationShape): readonly unknown[] => item.properties),
    [[], []],
  );
});

void test('inherited node properties apply automatically without annotation references', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const source: Attribute = model.createAttribute(node, { name: 'source', typeId: DataTypes.String }).element;
  model.createAnnotationShape({ node, type: 'note' });
  const next: RamenModel = model.createNextLevel('Research');
  const refined: Node = next.createNode({ name: 'ResearchAnnotation', refines: node }).element;
  const required: Attribute = next.createAttribute(refined, {
    name: 'certainty',
    typeId: DataTypes.Float,
    bounds: { lowerBound: 1, upperBound: 1 },
  }).element;
  assert.equal(next.validate().valid, true);
  assert.equal(next.validateAnnotationValue(refined, 'note', 'source', 'archive').hasErrors, false);
  assert.equal(next.validateAnnotationValue(refined, 'note', 'certainty', undefined).hasErrors, true);
  assert.equal(next.validateAnnotationValue(refined, 'note', 'certainty', 0.8).hasErrors, false);
  model.removeAttribute(node.id, source.id);
  assert.equal(next.validate().valid, true);
  assert.ok(
    next
      .getPropertiesForAnnotationShape(refined, 'note')
      .some((item: PropertyOption): boolean => item.attributeId === required.id),
  );
});

void test('shapes cannot redeclare shared properties on their node or a refined descendant', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  model.createAttribute(node, { name: 'source', typeId: DataTypes.String });
  const note: AnnotationShape = model.createAnnotationShape({
    node,
    type: 'note',
    properties: [{ name: 'source', typeId: DataTypes.Integer }],
  }).element;
  assert.equal(model.validate().valid, false);
  model.updateAnnotationShape(note.id, { properties: [{ name: 'certainty', typeId: DataTypes.Float }] });
  assert.equal(model.validate().valid, true);
  const next: RamenModel = model.createNextLevel('Research');
  const refined: Node = next.createNode({ name: 'ResearchAnnotation', refines: node }).element;
  next.createAttribute(refined, { name: 'certainty', typeId: DataTypes.String });
  assert.ok(next.validate().diagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_PROPERTY_INVALID'));
});

void test('annotation properties require declarations in project and file schemas', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const node: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const source: Attribute = model.createAttribute(node, { name: 'source', typeId: DataTypes.String }).element;
  const note: AnnotationShape = model.createAnnotationShape({ node, type: 'note' }).element;
  const raw: RamenModelDocument = model.getModel();
  const invalid: unknown = { ...raw, annotations: [{ ...note, properties: [{ attributeId: source.id }] }] };
  assert.equal(new RamenValidator().validateProject(raw.id, [invalid, RAMEN_MODEL]).valid, false);
  const file: ReturnType<RamenModel['export']> = model.export();
  const invalidFile: unknown = {
    ...file,
    annotations: file.annotations.map((item: AnnotationShape): unknown => ({
      ...item,
      properties: [{ attributeId: source.id }],
    })),
  };
  assert.throws((): RamenModel => RamenModel.import(invalidFile));
});

void test('type-owned property constraints use the generic expression checks and retain their diagnostic path', (): void => {
  const model: RamenModel = RamenModel.create('Edition');
  const rule: Constraint = {
    id: 'invalidRule00001',
    name: 'Invalid schema',
    language: 'json-schema',
    expression: { type: 'bad' },
  };
  const note: AnnotationShape = model.createAnnotationShape({
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

  model.updateAnnotationShape(note.id, {
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
  model.createAnnotationShape({
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
