import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  ModelValidator,
  Modeller,
  type DataType,
  type Diagnostic,
  type Model,
  type Node,
  type ProjectValidationResult,
} from '@ramen-suite/core/model';

function expectInvalid(rootId: string, models: readonly Model[], code: string): void {
  const result: ProjectValidationResult = new ModelValidator().validateProject(rootId, models);
  const finding: Diagnostic | undefined = result.diagnostics.find((item: Diagnostic): boolean => item.code === code);

  assert.equal(result.valid, false);
  assert.equal('graph' in result, false);
  assert.ok(finding, JSON.stringify(result.diagnostics));
  assert.equal(finding.severity, 'error');
  assert.ok(finding.path?.startsWith('/'));
}

void test('imports reject missing models, duplicate identities and cyclic dependencies', (): void => {
  const base: Modeller = Modeller.create('Files');
  const next: Modeller = base.createNextLevel('Website');
  const root: Model = next.getModel();
  const predecessor: Model = base.getModel();

  expectInvalid(root.id, [root], 'IMPORTED_MODEL_NOT_FOUND');
  expectInvalid(root.id, [root, root, predecessor], 'DUPLICATE_MODEL_ID');

  predecessor.imports.push({ modelId: root.id, modelUri: root.$id, version: root.version, name: root.name });
  expectInvalid(root.id, [root, predecessor], 'IMPORT_CYCLE');
});

void test('references reject unreachable models and incompatible declaration kinds', (): void => {
  const model: Modeller = Modeller.create('Files');
  const file: Node = model.createNode('File').element;
  const dataType: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;

  const foreign: Modeller = Modeller.create('Other');
  const foreignNode: Node = foreign.createNode('OtherFile').element;

  model.updateNode(file.id, { superTypes: [`${foreign.getModel().id}:${foreignNode.id}`] });
  expectInvalid(model.getModel().id, [model.getModel(), foreign.getModel()], 'REFERENCE_MODEL_NOT_REACHABLE');

  model.updateNode(file.id, { superTypes: [dataType.id] });
  expectInvalid(model.getModel().id, [model.getModel()], 'ELEMENT_REFERENCE_KIND_MISMATCH');
});

void test('raw model inputs cannot bypass node refinement and inherited property rules', (): void => {
  const base: Modeller = Modeller.create('Files');
  const file: Node = base.createNode('File').element;
  base.createAttribute(file, { name: 'title', typeId: DataTypes.String });

  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: file }).element;
  const raw: Model = next.getModel();
  const independent: Node = { ...page, superTypes: [] };

  raw.classifiers = [independent];

  expectInvalid(raw.id, [raw, base.getModel()], 'NODE_REFINEMENT_REQUIRED');
  next.createAttribute(page, { name: 'title', typeId: DataTypes.String });
  expectInvalid(raw.id, next.getModels(), 'ATTRIBUTE_NAME_SHADOWS_SUPERTYPE');
});
