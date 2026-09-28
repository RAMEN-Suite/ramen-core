import assert from 'node:assert/strict';
import test from 'node:test';
import { Modeler, ModelFiles } from '../../dist/ramen-core/model/index.js';
import type { Attribute, Classifier, Model, ModelFile, Node, Owned } from '../../dist/ramen-core/model/index.js';
import { model, node } from '../models.ts';

void test('generic graph export stores inherited declarations once and resolves them after import', (): void => {
  const base: Modeler = Modeler.create('Documents');
  const document: Node = base.createNode('Document').element;
  const title: Attribute = base.createAttribute(document, { name: 'title', typeId: 'String' }).element;
  const project: Modeler = base.createNextLevel('Letters');
  const letter: Node = project.createNode({ name: 'Letter', refines: document }).element;
  const file: ModelFile = project.export();
  const restored: Modeler = Modeler.import(JSON.parse(JSON.stringify(file)) as unknown);
  const declaration: Owned<Classifier> | undefined = file.classifiers.find(
    (item: Owned<Classifier>): boolean => item.id === letter.id,
  );
  assert.ok(declaration?.kind === 'Node');
  assert.deepEqual(declaration.attributes, []);
  assert.deepEqual(declaration.superTypes, letter.superTypes);
  assert.equal(restored.getAttributes(letter)[0]?.attributeId, title.id);
  assert.deepEqual(restored.export(), file);
});

void test('equal local identifiers in different models stay distinct during merge and split', (): void => {
  const base: Model = model('fileBase000000001');
  base.classifiers.push(node('sharedNode0000001', 'Document'));
  const project: Model = model('fileProject000001', [base]);
  project.classifiers.push(node('sharedNode0000001', 'Letter', [`${base.id}:sharedNode0000001`]));
  const file: ModelFile = ModelFiles.write(project.id, [base, project]);
  const restored: readonly Model[] = ModelFiles.read(file);
  assert.equal(file.classifiers.length, 2);
  assert.deepEqual(
    restored.find((item: Model): boolean => item.id === project.id),
    project,
  );
  assert.deepEqual(
    restored.find((item: Model): boolean => item.id === base.id),
    base,
  );
});

void test('import rejects unknown owners, duplicate headers and identities, absent context and extra models', (): void => {
  const project: Modeler = Modeler.create('Documents');
  project.createNode('Document');
  const file: ModelFile = project.export();
  const first: Owned<Classifier> | undefined = file.classifiers[0];
  const header: ModelFile['models'][number] | undefined = file.models[0];
  assert.ok(first && header);
  const cases: readonly unknown[] = [
    { ...file, classifiers: [{ ...first, modelId: 'unknownOwner00001' }] },
    { ...file, models: [...file.models, header] },
    { ...file, classifiers: [first, first] },
    { ...file, id: 'unknownProject01' },
    { ...file, models: [...file.models, { ...header, id: 'unreachable000001', $id: 'urn:unreachable' }] },
    { ...file, origin: {} },
    { ...file, classifiers: [{ ...first, modelId: 1 }] },
  ];
  for (const input of cases) assert.throws((): Modeler => Modeler.import(input));
});

void test('graph import checks inheritance cycles, dependency versions and detached snapshots', (): void => {
  const base: Modeler = Modeler.create('Documents');
  const document: Node = base.createNode('Document').element;
  const project: Modeler = base.createNextLevel('Letters');
  project.createNode({ name: 'Letter', refines: document });
  const file: ModelFile = project.export();
  const broken: ModelFile = {
    ...file,
    classifiers: file.classifiers.map((item: Owned<Classifier>): Owned<Classifier> =>
      item.kind === 'Node' ? { ...item, superTypes: [item.id] } : item,
    ),
  };
  assert.throws((): Modeler => Modeler.import(broken), /Invalid model file/);
  const changed: ModelFile = {
    ...file,
    models: file.models.map((item: ModelFile['models'][number]): ModelFile['models'][number] =>
      item.id === base.getModel().id ? { ...item, version: '9.0.0' } : item,
    ),
  };
  assert.throws((): Modeler => Modeler.import(changed), /Invalid model file/);
  const restored: Modeler = Modeler.import(file);
  assert.throws((): unknown => restored.createAttribute(document.id, { name: 'invalid', typeId: 'String' }));
  assert.deepEqual(project.export(), file);
});
