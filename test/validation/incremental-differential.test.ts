import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  ModelValidator,
  ModelSchemaValidator,
  type Attribute,
  type Classifier,
  type DataType,
  type Model,
  type Node,
  type Relation,
  type ProjectValidationResult,
  type UpdateDataTypeInput,
} from '@ramen-suite/core/model';
import {
  RAMEN_ELEMENT,
  RamenModel,
  RamenValidator,
  RamenProjectSchemaValidator,
  type AnnotationShape,
} from '@ramen-suite/core/ramen';

interface Fixture {
  readonly model: Modeller | RamenModel;
  readonly letter: Node;
  readonly folder: Node;
  readonly relation: Relation;
}

class Random {
  private state: number;

  public constructor(seed: number) {
    this.state = seed;
  }

  public index(length: number): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state % length;
  }

  public pick<T>(values: readonly T[]): T {
    assert.ok(values.length > 0);
    return values[this.index(values.length)] as T;
  }
}

function fixture(ramen: boolean): Fixture {
  const model: Modeller | RamenModel = ramen ? RamenModel.create('Edition') : Modeller.create('Edition');
  const refines: string | undefined = ramen ? RAMEN_ELEMENT.COLLECTION : undefined;
  const letter: Node = model.createNode({ name: 'Letter', refines }).element;
  const folder: Node = model.createNode({ name: 'Folder', refines }).element;
  const relation: Relation =
    model instanceof RamenModel
      ? model.partOf(letter, folder).element
      : model.createRelation({ name: 'FILED_IN', from: { node: letter }, to: { node: folder } }).element;
  return { model, letter, folder, relation };
}

function compare(model: Modeller | RamenModel, step: string): boolean {
  const cached: ProjectValidationResult = model.validate();
  const models: readonly Model[] = model.getModels();
  const full: ProjectValidationResult =
    model instanceof RamenModel
      ? new RamenValidator().validateProject(model.getModel().id, models)
      : new ModelValidator().validateProject(model.getModel().id, models);

  assert.equal(cached.valid, full.valid, step);
  assert.deepEqual(cached.diagnostics, full.diagnostics, step);
  if (cached.valid && full.valid) assert.deepEqual(cached.graph.getModels(), full.graph.getModels(), step);
  return cached.valid;
}

function changeType(model: Modeller | RamenModel, random: Random, step: number): void {
  const types: readonly DataType[] = model
    .getModel()
    .classifiers.filter((item: Classifier): item is DataType => item.kind === 'DataType');
  if (types.length === 0) {
    model.createDataType({ name: `Status${step}`, baseType: DataTypes.String });
    return;
  }
  const patch: UpdateDataTypeInput = { name: random.pick([`Status${step}`, 'String', 'bad name', 'x'.repeat(41)]) };
  Reflect.set(patch, 'baseType', random.pick([DataTypes.String, DataTypes.Integer, 'Foo']));
  model.updateDataType(random.pick(types).id, patch);
}

function changeProperty(model: Modeller | RamenModel, node: Node, random: Random, step: number): void {
  const current: Node | undefined = model.getNode(node.id);
  assert.ok(current);
  if (current.attributes.length === 0 || random.index(3) === 0) {
    model.createAttribute(node, { name: `field${step}`, typeId: DataTypes.String });
    return;
  }
  const attribute: Attribute = random.pick(current.attributes);
  model.updateAttribute(node.id, attribute.id, {
    typeId: random.pick([DataTypes.String, DataTypes.Integer, 'missingType00001']),
    bounds: random.pick([
      { lowerBound: 0, upperBound: 1 },
      { lowerBound: 2, upperBound: 1 },
    ]),
  });
}

function changeShape(model: RamenModel, random: Random, step: number): void {
  const shapes: readonly AnnotationShape[] = model.getAnnotationShapes();
  if (shapes.length === 0 || random.index(3) === 0) {
    model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: `note${step}` });
    return;
  }
  const shape: AnnotationShape = random.pick(shapes);
  if (random.index(2) === 0) {
    model.removeAnnotationShape(shape.id);
    return;
  }
  model.updateAnnotationShape(shape.id, { properties: [{ name: 'note', typeId: DataTypes.String }] });
}

function removeDeclaration(model: Modeller | RamenModel, random: Random): void {
  const nodes: readonly Node[] = model
    .getModel()
    .classifiers.filter((item: Classifier): item is Node => item.kind === 'Node')
    .slice(2);
  if (nodes.length > 0) model.removeNode(random.pick(nodes).id, { cascade: true });
  const types: readonly DataType[] = model
    .getModel()
    .classifiers.filter((item: Classifier): item is DataType => item.kind === 'DataType');
  if (types.length > 0 && random.index(2) === 0) model.removeDataType(random.pick(types).id);
}

function changeRelation(model: Modeller | RamenModel, relation: Relation, random: Random): void {
  model.updateRelation(relation.id, {
    to: {
      ...relation.to,
      bounds: random.pick([
        { lowerBound: 0, upperBound: -1 },
        { lowerBound: -1, upperBound: 1 },
      ]),
    },
  });
}

function changeSecondary(model: Modeller | RamenModel, random: Random, step: number): void {
  if (model instanceof RamenModel) changeShape(model, random, step);
  else compare(model.snapshot(), `snapshot at ${step}`);
}

function change(fixture: Fixture, random: Random, step: number): void {
  const { model, letter, folder, relation }: Fixture = fixture;
  switch (step % 10) {
    case 0:
      model.updateModel({ version: random.pick(['1.0.0', 'not a version', '2.0.0']) });
      break;
    case 1:
      model.createNode({ name: `Item${step}`, refines: model instanceof RamenModel ? RAMEN_ELEMENT.COLLECTION : undefined });
      break;
    case 2:
      model.updateNode(random.pick([letter, folder]).id, { name: random.pick(['Letter', 'bad name', `Item${step}`]) });
      break;
    case 3:
      changeProperty(model, random.pick([letter, folder]), random, step);
      break;
    case 4:
      changeType(model, random, step);
      break;
    case 5:
      changeRelation(model, relation, random);
      break;
    case 6:
      model.updateNode(letter.id, { name: 'Letter', superTypes: letter.superTypes });
      break;
    case 7:
      removeDeclaration(model, random);
      break;
    case 8:
      model.updateModel({ name: 'Edition', version: '1.0.0' });
      break;
    case 9:
      changeSecondary(model, random, step);
      break;
  }
}

void test('seeded RMF and RAMEN edit sequences agree with complete validation after every change', (): void => {
  for (const ramen of [false, true]) {
    const current: Fixture = fixture(ramen);
    const random: Random = new Random(0x52414d45);
    assert.equal(compare(current.model, 'initial model'), true);
    let failures: number = 0;

    for (let step: number = 0; step < 80; step += 1) {
      change(current, random, step);
      const valid: boolean = compare(current.model, `${ramen ? 'RAMEN' : 'RMF'} step ${step}`);
      if (!valid) failures += 1;
    }
    assert.ok(failures > 0, 'The sequence must exercise invalid states as well as the valid initial state.');
  }
});

const CONTEXT_KEYWORDS: ReadonlySet<string> = new Set<string>([
  '$dynamicRef',
  '$dynamicAnchor',
  '$recursiveRef',
  '$recursiveAnchor',
  'unevaluatedItems',
  'unevaluatedProperties',
  'prefixItems',
]);
const ROOT_APPLICATORS: readonly string[] = ['allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentSchemas'];

function checkSchema(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(CONTEXT_KEYWORDS.has(key), false, `Review incremental validation before using ${key}.`);
    checkSchema(child);
  }
}

void test('partitioned model schemas retain the assumptions needed for independent declaration checks', (): void => {
  for (const schema of [ModelSchemaValidator.getSchemaNode(), RamenProjectSchemaValidator.getSchemaNode()]) {
    checkSchema(schema.schema);
    for (const key of ROOT_APPLICATORS) {
      assert.equal(Object.hasOwn(schema.schema, key), false, `Review incremental validation before adding root ${key}.`);
    }
  }
});
