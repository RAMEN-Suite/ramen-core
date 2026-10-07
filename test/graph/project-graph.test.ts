import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectGraph,
  DataTypes,
  EffectiveModel,
  Modeller,
  ModelRef,
  type DataType,
  type Diagnostic,
  type Model,
  type Node,
  type ProjectGraph,
  type ProjectGraphResult,
  type Relation,
  type ResolvedElement,
} from '@ramen-suite/core/model';

void test('the public graph resolves imports, inheritance and effective properties', (): void => {
  const filesystem: Modeller = Modeller.create('File system');
  const file: Node = filesystem.createNode('File').element;
  const folder: Node = filesystem.createNode('Folder').element;
  const status: DataType = filesystem.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  filesystem.createAttribute(file, { name: 'status', type: status });
  const membership: Relation = filesystem.createRelation({
    name: 'IN_FOLDER',
    from: { node: file },
    to: { node: folder },
  }).element;

  const website: Modeller = filesystem.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: file }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const pageMembership: Relation = website.createRelation({
    refines: membership,
    from: { node: page },
    to: { node: section },
  }).element;
  const models: readonly Model[] = website.getModels();
  const built: ProjectGraphResult = buildProjectGraph({ rootModelId: website.getModel().id, models });

  if (!built.ok) throw new Error(JSON.stringify(built.diagnostics));

  const graph: ProjectGraph = built.graph;
  assert.equal(built.ok, true);
  assert.equal(graph.getRootModel().name, 'Website');
  assert.equal(graph.getTransitiveImports(website.getModel().id)[0]?.id, filesystem.getModel().id);
  assert.equal(
    graph.resolveNode(website.getModel().id, ModelRef.qualify(filesystem.getModel().id, file.id))?.element.id,
    file.id,
  );
  assert.equal(graph.getNodeAncestors(website.getModel().id, page.id)[0]?.element.id, file.id);
  assert.equal(graph.getRelationAncestors(website.getModel().id, pageMembership.id)[0]?.element.id, membership.id);
  assert.equal(
    graph.resolveDataType(website.getModel().id, ModelRef.qualify(filesystem.getModel().id, status.id))?.element.id,
    status.id,
  );
  assert.equal(EffectiveModel.resolveNode(graph, website.getModel().id, page.id)?.attributes[0]?.name, 'status');
  assert.equal(Object.isFrozen(graph.getRootModel()), true);
});

void test('the graph builder reports an unavailable root instead of returning a partial graph', (): void => {
  const model: Modeller = Modeller.create('File system');
  const built: ProjectGraphResult = buildProjectGraph({ rootModelId: 'missingModel00001', models: [model.getModel()] });

  assert.equal(built.ok, false);
  assert.ok(built.diagnostics.some((item: Diagnostic): boolean => item.code === 'PROJECT_ROOT_NOT_FOUND'));
});

void test('the public graph queries keep model and element identities distinct', (): void => {
  const model: Modeller = Modeller.create('File system');
  const file: Node = model.createNode('File').element;
  const folder: Node = model.createNode('Folder').element;
  const webPage: Node = model.createNode({ name: 'WebPage', refines: file }).element;
  const status: DataType = model.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const membership: Relation = model.createRelation({ name: 'IN_FOLDER', from: { node: file }, to: { node: folder } }).element;
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: model.getModel().id, models: [model.getModel()] });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));

  const graph: ProjectGraph = result.graph;
  const modelId: string = model.getModel().id;
  const resolvedFile: ResolvedElement<Node> | undefined = graph.resolveNode(modelId, file.id);
  const resolvedPage: ResolvedElement<Node> | undefined = graph.resolveNode(modelId, webPage.id);
  const resolvedRelation: ResolvedElement<Relation> | undefined = graph.resolveRelation(modelId, membership.id);

  assert.ok(resolvedFile && resolvedPage && resolvedRelation);

  assert.equal(graph.hasModel(modelId), true);
  assert.equal(graph.getModel(modelId)?.name, 'File system');
  assert.equal(graph.getModels().length, 1);
  assert.deepEqual(graph.getImportedModels(modelId), []);
  assert.equal(graph.getAvailableNodes(modelId).length, 3);
  assert.equal(graph.getNode(modelId, file.id)?.id, file.id);
  assert.equal(graph.getDataType(modelId, status.id)?.id, status.id);
  assert.equal(graph.getRelation(modelId, membership.id)?.id, membership.id);
  assert.equal(graph.isNodeSameOrSubtype(resolvedPage, resolvedFile), true);
  assert.equal(graph.acceptsNode(modelId, file.id, resolvedPage), true);
  assert.equal(graph.isRelationSameOrSubtype(resolvedRelation, resolvedRelation), true);
  assert.equal(graph.isRelationRefSameOrSubtype(modelId, membership.id, modelId, membership.id), true);
  assert.equal(EffectiveModel.getApplicableRelations(graph, modelId, webPage.id).length, 1);
});
