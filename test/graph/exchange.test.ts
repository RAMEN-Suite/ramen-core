import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  type Attribute,
  type Classifier,
  type Diagnostic,
  type Model,
  type ModelFile,
  type Node,
  type Relation,
} from '@ramen-suite/core/model';
import fileSchema from '@ramen-suite/core/schemas/model-file.schema.json' with { type: 'json' };

void test('the consumer entry point and packaged schema describe the same RMF file', (): void => {
  const model: Modeller = Modeller.create('Filing');
  model.createNode('Document');

  const file: ModelFile = model.export();
  assert.equal(file.$schema, fileSchema.$id);
});

void test('one file preserves ownership and inheritance across three editable levels', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const title: Attribute = base.createAttribute(document, { name: 'title', typeId: DataTypes.String }).element;
  const filedIn: Relation = base.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder },
  }).element;

  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const pageFiledIn: Relation = website.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } }).element;

  const publication: Modeller = website.createNextLevel('Publication');
  const article: Node = publication.createNode({ name: 'Article', refines: page }).element;
  publication.createRelation({ refines: pageFiledIn, from: { node: article }, to: { node: section } });

  const file: ModelFile = publication.export();
  const restored: Modeller = Modeller.import(JSON.parse(JSON.stringify(file)) as unknown);

  assert.equal(file.models.length, 3);
  assert.equal(file.classifiers.filter((item: ModelFile['classifiers'][number]): boolean => item.id === document.id).length, 1);
  assert.equal(restored.validate().valid, true);
  assert.equal(restored.getAttributes(article)[0]?.attributeId, title.id);
  assert.deepEqual(restored.export(), file);
});

void test('each level must apply a permitted relationship again', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } });

  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  assert.equal(website.suggestRelations(page, section).length, 1);

  const publication: Modeller = website.createNextLevel('Publication');
  const article: Node = publication.createNode({ name: 'Article', refines: page }).element;
  assert.deepEqual(publication.suggestRelations(article, section), []);
});

void test('missing references produce stable diagnostics and block export', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const raw: Model = base.getModel();
  const broken: Model = {
    ...raw,
    classifiers: raw.classifiers.map((item: Classifier): Classifier => {
      if (item.id !== document.id || item.kind !== 'Node') return item;
      return {
        ...item,
        attributes: [
          { id: 'missingTypeAttr1', name: 'status', typeId: 'missingType00001', bounds: { lowerBound: 0, upperBound: 1 } },
        ],
      };
    }),
  };

  const loaded: Modeller = Modeller.load(broken);
  const finding: Diagnostic | undefined = loaded
    .validate()
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'ELEMENT_REFERENCE_NOT_FOUND');

  assert.ok(finding);
  assert.equal(finding.severity, 'error');
  assert.match(finding.path ?? '', /\/classifiers\/0\/attributes\/0\/typeId$/);
  assert.throws((): ModelFile => loaded.export(), /Invalid model/);
});

void test('invalid exchanged files are rejected before creating an editor', (): void => {
  const model: Modeller = Modeller.create('Filing');
  model.createNode('Document');
  const file: ModelFile = model.export();
  const first: ModelFile['classifiers'][number] | undefined = file.classifiers[0];
  assert.ok(first);

  const duplicate: ModelFile = { ...file, classifiers: [first, first] };
  assert.throws((): Modeller => Modeller.import(duplicate), /Invalid model file/);
});

void test('removed relation-end flags are rejected by the model file schema', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  model.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } });

  const file: ModelFile = model.export();

  for (const field of ['isNavigable', 'isComposite'] as const) {
    const legacy: ModelFile = {
      ...file,
      relations: file.relations.map((relation: ModelFile['relations'][number]): ModelFile['relations'][number] => ({
        ...relation,
        to: { ...relation.to, [field]: true },
      })),
    };

    assert.throws((): Modeller => Modeller.import(legacy), /Invalid model file/);
  }
});
