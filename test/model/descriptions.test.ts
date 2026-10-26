import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESCRIPTION_MAX_LENGTH,
  DataTypes,
  ModelFactory,
  ModelEditor,
  ModelSchemaValidator,
  ModelFiles,
  EffectiveModel,
  type DescribedDefinition,
  Modeller,
  type Model,
  type ModelFile,
  type Node,
  type Attribute,
  type DataType,
  type Literal,
  type Relation,
  type Constraint,
} from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RamenModel, RamenFiles, type AnnotationShape, type RamenFile } from '@ramen-suite/core/ramen';

function rule(description: string): Constraint {
  return {
    id: ModelFactory.createIdentifier(),
    name: 'Rule',
    language: 'json-schema',
    expression: {},
    description,
    message: 'Invalid value',
  };
}

interface DocumentedModel {
  readonly model: Modeller;
  readonly node: Node;
  readonly type: DataType;
  readonly literal: Literal;
  readonly attribute: Attribute;
  readonly relation: Relation;
  readonly constraint: Constraint;
}

function documentedModel(): DocumentedModel {
  const model: Modeller = Modeller.create({ name: 'Catalog', description: 'Model documentation' });
  const node: Node = model.createNode({ name: 'Document', description: 'Document definition' }).element;
  const type: DataType = model.createDataType({
    name: 'Status',
    baseType: DataTypes.String,
    description: 'Status domain',
  }).element;
  const literal: Literal = model.createLiteral(type.id, {
    name: 'Draft',
    literal: 'draft',
    description: 'Not published',
  }).element;
  const attribute: Attribute = model.createAttribute(node, {
    name: 'description',
    typeId: DataTypes.String,
    description: 'User-authored text',
  }).element;
  const relation: Relation = model.createRelation({
    name: 'LINKS_TO',
    description: 'Related document',
    from: { node },
    to: { node },
  }).element;
  const constraint: Constraint = model.addConstraint(attribute, rule('Why this rule exists')).element;
  return { model, node, type, literal, attribute, relation, constraint };
}

void test('all RMF definition descriptions survive edits, duplication and exchange without becoming data fields', (): void => {
  const { model, node, type, literal, attribute, relation, constraint }: DocumentedModel = documentedModel();
  model.updateNode(node.id, { name: 'Record' });
  model.updateAttribute(node.id, attribute.id, { description: 'Line one\nLine two' });
  model.updateDataType(type.id, { description: 'Updated domain' });
  model.updateLiteral(type.id, literal.id, { description: 'Updated draft' });
  model.updateRelation(relation.id, { description: 'Updated link' });
  model.updateConstraint(attribute, constraint.id, { description: 'Updated explanation' });
  model.updateModel({ description: 'Updated model' });
  const restored: Modeller = Modeller.import(JSON.parse(JSON.stringify(model.export())));
  assert.deepEqual(restored.getModel(), JSON.parse(JSON.stringify(model.getModel())));
  assert.equal(restored.getModel().description, 'Updated model');
  assert.equal(restored.getNode(node.id)?.description, 'Document definition');
  assert.equal(restored.getNode(node.id)?.attributes[0]?.description, 'Line one\nLine two');
  assert.equal(restored.getNode(node.id)?.attributes[0]?.constraints?.[0]?.description, 'Updated explanation');
  assert.equal(restored.getConstraints(attribute)[0]?.message, 'Invalid value');
  assert.equal(ModelFactory.duplicateNode(restored.getNode(node.id) ?? node).description, 'Document definition');
  assert.equal(
    restored.validateInstances({
      nodes: [{ id: 'documentRecord01', typeId: node.id, properties: { description: 'x'.repeat(3000) } }],
      relations: [],
    }).hasErrors,
    false,
  );
});

void test('empty descriptions clear metadata while omitted patches and opaque payloads preserve their content', (): void => {
  const model: Modeller = Modeller.create({ name: 'Catalog', description: '  \n' });
  const node: Node = model.createNode({ name: 'Document', description: 'Original' }).element;
  const updated: Node = model.updateNode(node.id, { description: ' \t\n' }).element;
  assert.equal('description' in model.getModel(), false);
  assert.equal('description' in updated, false);
  model.updateNode(node.id, { description: ' Preserved\ntext ' });
  model.updateNode(node.id, { name: 'Record', ext: { description: 'x'.repeat(3000) } });
  assert.equal(model.getNode(node.id)?.description, ' Preserved\ntext ');
  assert.equal(model.getNode(node.id)?.ext?.['description'], 'x'.repeat(3000));
  const constraint: Constraint = { ...rule('Explanation'), expression: { description: 'x'.repeat(3000) } };
  model.addConstraint(node, constraint);
  assert.equal(model.updateConstraint(node, constraint.id, { description: '' }).element.description, undefined);
  assert.deepEqual(model.getConstraints(node)[0]?.expression, constraint.expression);
  assert.equal(ModelEditor.updateNode(model.getModel(), node.id, { description: '' }).classifiers[0]?.description, undefined);
});

void test('description limits use Unicode code points and reject changes before mutating the workspace', (): void => {
  const model: Modeller = Modeller.create('Catalog');
  const node: Node = model.createNode({ name: 'Document', description: '😀'.repeat(DESCRIPTION_MAX_LENGTH) }).element;
  assert.equal(model.validate().valid, true);
  const before: Model = model.getModel();
  const oversized: string = 'x'.repeat(DESCRIPTION_MAX_LENGTH + 1);
  const attempts: readonly (() => unknown)[] = [
    (): unknown => model.updateNode(node.id, { description: oversized }),
    (): unknown => model.createNode({ name: 'Invalid', description: oversized }),
    (): unknown => model.createAttribute(node, { name: 'title', typeId: DataTypes.String, description: oversized }),
    (): unknown => model.createDataType({ name: 'Invalid', baseType: DataTypes.String, description: oversized }),
    (): unknown => model.createRelation({ name: 'LINK', description: oversized, from: { node }, to: { node } }),
    (): unknown => model.updateModel({ description: oversized }),
    (): unknown => model.addConstraint(node, rule(oversized)),
  ];
  for (const attempt of attempts) {
    assert.throws(attempt, /description.*2000/i);
    assert.deepEqual(model.getModel(), before);
  }
  const restored: Modeller = Modeller.import(model.export());
  assert.equal(restored.getNode(node.id)?.description, node.description);
  const invalid: Model = { ...before, description: oversized };
  assert.equal(ModelSchemaValidator.isValid(invalid), false);
  const file: ModelFile = model.export();
  assert.throws((): void => {
    Modeller.import({
      ...file,
      models: file.models.map((header: ModelFile['models'][number]): ModelFile['models'][number] => ({
        ...header,
        description: oversized,
      })),
    });
  }, /2000|length/i);
});

void test('literal creation and updates enforce the same limit and clearing rules', (): void => {
  const model: Modeller = Modeller.create('Catalog');
  const type: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const literal: Literal = model.createLiteral(type.id, { name: 'Draft', description: 'Draft state' }).element;
  const before: Model = model.getModel();
  assert.throws((): void => {
    model.updateLiteral(type.id, literal.id, { description: 'x'.repeat(2001) });
  }, /2000/);
  assert.deepEqual(model.getModel(), before);
  assert.equal(model.updateLiteral(type.id, literal.id, { description: '' }).element.description, undefined);
});

void test('annotation shapes and their properties retain descriptions through RAMEN exchange and clearing', (): void => {
  const model: RamenModel = RamenModel.create({ name: 'Edition', description: 'Edition model' });
  const shape: AnnotationShape = model.createAnnotationShape({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'head',
    description: 'Section heading',
    properties: [
      { name: 'level', typeId: DataTypes.Integer, description: 'Heading depth', constraints: [rule('Explain heading levels')] },
    ],
  }).element;
  const restored: RamenModel = RamenModel.import(JSON.parse(JSON.stringify(model.export({ name: 'Project', description: '' }))));
  assert.deepEqual(restored.getAnnotationShapes(), model.getAnnotationShapes());
  assert.equal(restored.getAnnotationShapes()[0]?.properties[0]?.description, 'Heading depth');
  assert.equal(restored.getProjectMetadata()?.description, '');
  assert.equal(restored.updateAnnotationShape(shape.id, { type: 'heading' }).element.description, 'Section heading');
  assert.equal(restored.updateAnnotationShape(shape.id, { description: '' }).element.description, undefined);
  const before: RamenFile = restored.export();
  assert.throws((): void => {
    restored.updateAnnotationShape(shape.id, { description: 'x'.repeat(2001) });
  }, /2000/);
  assert.deepEqual(restored.export(), before);
  const invalid: RamenFile = {
    ...before,
    annotations: before.annotations.map((annotation: RamenFile['annotations'][number]): RamenFile['annotations'][number] => ({
      ...annotation,
      description: 'x'.repeat(2001),
    })),
  };
  assert.throws((): void => {
    RamenFiles.read(invalid);
  }, /2000|length/i);
});

function definitions(model: Model): readonly DescribedDefinition[] {
  return [
    model,
    ...model.classifiers,
    ...model.relations,
    ...model.classifiers.flatMap((classifier: Model['classifiers'][number]): DescribedDefinition[] => {
      if (classifier.kind !== 'Node') return [...(classifier.literals ?? [])];
      const constraints: Constraint[] = classifier.attributes.flatMap(
        (attribute: Attribute): Constraint[] => attribute.constraints ?? [],
      );
      return [...classifier.attributes, ...constraints];
    }),
  ];
}

void test('every definition schema enforces the length limit, including nested properties, literals and constraints', (): void => {
  const { model }: DocumentedModel = documentedModel();
  const source: Model = model.getModel();
  const count: number = definitions(source).length;
  for (let index: number = 0; index < count; index += 1) {
    const invalid: Model = structuredClone(source);
    const definition: DescribedDefinition | undefined = definitions(invalid)[index];
    assert.ok(definition);
    definition.description = 'x'.repeat(2001);
    assert.equal(ModelSchemaValidator.isValid(invalid), false, `Definition ${index} accepted an oversized description`);
    assert.throws((): void => {
      ModelFiles.write(invalid.id, [invalid]);
    });
  }
  assert.equal(ModelSchemaValidator.isValid({ ...source, description: 42 }), false);
});

void test('direct exchange omits empty definition descriptions while preserving separate project metadata', (): void => {
  const { model, node }: DocumentedModel = documentedModel();
  const raw: Model = model.getModel();
  raw.description = ' \n';
  const classifier: Node | undefined = raw.classifiers.find(
    (item: Model['classifiers'][number]): item is Node => item.kind === 'Node' && item.id === node.id,
  );
  assert.ok(classifier);
  classifier.description = '';
  const file: ModelFile = ModelFiles.write(raw.id, [raw], { name: 'Project', description: 'x'.repeat(3000) });
  assert.equal(file.models[0]?.description, undefined);
  assert.equal(file.classifiers[0]?.description, undefined);
  assert.equal(file.project?.description.length, 3000);
  assert.equal(ModelFiles.read(file)[0]?.description, undefined);
});

void test('inherited properties retain documentation from their declaring model level', (): void => {
  const { model, node, attribute }: DocumentedModel = documentedModel();
  const next: Modeller = model.createNextLevel({ name: 'Edition', description: 'An independent level description' });
  const refined: Node = next.createNode({ name: 'Article', refines: node }).element;
  const result: ReturnType<Modeller['validate']> = next.validate();
  assert.ok(result.valid);
  const effective: ReturnType<typeof EffectiveModel.resolveNode> = EffectiveModel.resolveNode(
    result.graph,
    next.getModel().id,
    refined.id,
  );
  assert.equal(
    effective?.attributes.find((item: Attribute): boolean => item.id === attribute.id)?.description,
    attribute.description,
  );
  assert.equal(next.getModel().description, 'An independent level description');
  assert.equal(refined.description, undefined);
});
