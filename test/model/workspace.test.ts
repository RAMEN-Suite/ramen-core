import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type {
  Attribute,
  AttributeInfo,
  Classifier,
  Constraint,
  DataType,
  Diagnostic,
  EvolutionChange,
  EvolutionReport,
  Model,
  ModelChange,
  ModelRemovalPreview,
  Node,
  NodeRemovalPreview,
  NodeLineageItem,
  Relation,
  WorkspaceElement,
} from '@ramen-suite/core/model';

void test('levels share edits while an explicit snapshot keeps the earlier state', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const before: Modeller = next.snapshot();

  base.createAttribute(document, { name: 'title', typeId: DataTypes.String });

  assert.deepEqual(
    next.getAttributes(page).map((item: AttributeInfo): string => item.name),
    ['title'],
  );
  assert.deepEqual(before.getAttributes(page), []);
  assert.equal(next.validate().valid, true);
  assert.equal(before.compareTo(next).changes.length > 0, true);
});

void test('model identity edits update exact imports and preserve declarations', (): void => {
  const filing: Modeller = Modeller.create('Filing');
  const document: Node = filing.createNode('Document').element;
  const website: Modeller = filing.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const publication: Modeller = website.createNextLevel('Publication');
  const article: Node = publication.createNode({ name: 'Article', refines: page }).element;

  assert.throws(
    (): Model => filing.updateNextLevel(publication.getModel().id, { name: 'Wrong Parent' }),
    /does not directly import/,
  );

  filing.updateNextLevel(website.getModel().id, {
    name: 'Public Website',
    uri: 'https://example.org/models/website',
    version: '2.0.0',
  });

  const updated: Model = website.getModel();
  const imported: Model['imports'][number] | undefined = publication.getModel().imports[0];
  assert.equal(updated.name, 'Public Website');
  assert.equal(imported?.name, updated.name);
  assert.equal(imported?.modelUri, updated.$id);
  assert.equal(imported?.version, updated.version);
  assert.equal(publication.getNodeLineage(article).length, 3);
  assert.equal(publication.validate().valid, true);
  assert.equal(publication.getModel().name, 'Publication');

  filing.updateModel({ name: 'Archive' });
  assert.equal(website.getModel().imports[0]?.name, 'Archive');
  assert.equal(publication.validate().valid, true);
});

void test('model removal previews descendants, rejects by default and cascades atomically', (): void => {
  const filing: Modeller = Modeller.create('Filing');
  const website: Modeller = filing.createNextLevel('Website');
  const publication: Modeller = website.createNextLevel('Publication');
  const edition: Modeller = filing.createNextLevel('Edition');
  const websiteId: string = website.getModel().id;
  const editionId: string = edition.getModel().id;
  const before: readonly string[] = [filing, website, publication, edition].map((model: Modeller): string => model.getModel().id);

  const preview: ModelRemovalPreview = filing.previewNextLevelRemoval(websiteId);
  assert.deepEqual(
    preview.models.map((model: { readonly id: string; readonly name: string }): string => model.name),
    ['Website', 'Publication'],
  );
  assert.throws((): ModelRemovalPreview => filing.removeNextLevel(websiteId), /still used by Publication/);
  assert.deepEqual(
    before.map((id: string): boolean => filing.openLevel(id).getModel().id === id),
    [true, true, true, true],
  );

  const removed: ModelRemovalPreview = filing.removeNextLevel(websiteId, { cascade: true });
  assert.deepEqual(removed, preview);
  assert.throws((): Modeller => filing.openLevel(websiteId), /Model not found/);
  assert.equal(filing.openLevel(editionId).validate().valid, true);
  assert.equal(filing.validate().valid, true);
});

void test('one snapshot compares edits in the base and both sibling levels', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const edition: Modeller = base.createNextLevel('Edition');
  const letter: Node = edition.createNode({ name: 'Letter', refines: document }).element;
  const status: DataType = base.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  edition.createAttribute(letter, { name: 'status', type: status });
  const before: Modeller = website.snapshot();

  base.createAttribute(document, { name: 'title', typeId: DataTypes.String });
  base.removeDataType(status.id);
  edition.updateNode(letter.id, { name: 'Manuscript' });
  website.updateNode(page.id, { name: 'WebPage' });

  const report: EvolutionReport = before.compareTo(website);
  const changes: readonly EvolutionChange[] = report.changes;
  const changedModels: Set<string> = new Set<string>(changes.map((change: EvolutionChange): string => change.modelId));
  const oldEdition: Modeller = before.openLevel(edition.getModel().id);

  assert.deepEqual(changedModels, new Set<string>([base.getModel().id, website.getModel().id, edition.getModel().id]));
  assert.equal(oldEdition.getModel().classifiers[0]?.name, 'Letter');
  assert.deepEqual(before.getAttributes(page), []);
  assert.ok(report.afterDiagnostics.some((finding: Diagnostic): boolean => finding.code === 'ELEMENT_REFERENCE_NOT_FOUND'));
});

void test('a removed data type leaves an editable draft and a finding on the affected node', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const status: DataType = base.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const property: Attribute = next.createAttribute(page, { name: 'status', type: status }).element;

  const removed: ModelChange<DataType> = base.removeDataType(status.id);
  const finding: Diagnostic | undefined = next
    .validateNode(page)
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'ELEMENT_REFERENCE_NOT_FOUND');

  assert.equal(removed.validation.valid, true);
  assert.equal(next.validate().valid, false);
  assert.ok(finding);
  assert.ok(finding.path?.endsWith('/attributes/0/typeId'));
  assert.equal(finding.severity, 'error');

  next.updateAttribute(page.id, property.id, { typeId: DataTypes.String });
  assert.equal(next.validate().valid, true);
  assert.deepEqual(next.validateNode(page).diagnostics, []);
});

void test('node diagnostics include a rule on an incident relation', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const invalidRule: Constraint = {
    id: 'invalidRule00001',
    name: 'Invalid schema',
    language: 'json-schema',
    expression: { type: 'not-a-json-type' },
  };

  model.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder }, constraints: [invalidRule] });

  const finding: Diagnostic | undefined = model
    .validateNode(document)
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'CONSTRAINT_EXPRESSION_INVALID');
  assert.ok(finding);
  assert.ok(finding.path?.includes('/relations/0/constraints/0/expression'));
  assert.equal(finding.severity, 'error');
});

void test('strict node removal reports cross-level dependencies; cascade removes both branches', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const filedIn: Relation = base.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder },
  }).element;
  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  website.createRelation({ refines: filedIn, from: { node: page }, to: { node: section } });
  const edition: Modeller = base.createNextLevel('Edition');
  const letter: Node = edition.createNode({ name: 'Letter', refines: document }).element;
  const before: readonly Model[] = base.getModels();

  const preview: NodeRemovalPreview = base.previewNodeRemoval(document.id);
  assert.deepEqual(
    preview.nodes.map((item: WorkspaceElement): string => item.elementId),
    [document.id, page.id, letter.id],
  );
  assert.equal(preview.relations.length, 2);
  assert.throws((): ModelChange<Node> => base.removeNode(document.id), /still used by/);
  assert.deepEqual(base.getModels(), before);

  base.removeNode(document.id, { cascade: true });
  assert.equal(base.validate().valid, true);
  assert.equal(website.validate().valid, true);
  assert.equal(edition.validate().valid, true);
  assert.deepEqual(
    website.getModel().classifiers.map((item: Classifier): string => item.id),
    [section.id],
  );
  assert.deepEqual(edition.getModel().classifiers, []);
  assert.deepEqual(base.getModel().relations, []);
});

void test('an imported model is independent from the source workspace', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const next: Modeller = base.createNextLevel('Website');
  const page: Node = next.createNode({ name: 'Page', refines: document }).element;
  const restored: Modeller = Modeller.import(next.export());

  base.updateNode(document.id, { name: 'Record' });

  assert.deepEqual(
    next.getNodeLineage(page).map((item: NodeLineageItem): string => item.name),
    ['Record', 'Page'],
  );
  assert.deepEqual(
    restored.getNodeLineage(page).map((item: NodeLineageItem): string => item.name),
    ['Document', 'Page'],
  );

  const importedBase: Modeller = restored.openLevel(base.getModel().id);
  importedBase.updateNode(document.id, { name: 'Source' });
  assert.deepEqual(
    restored.getNodeLineage(page).map((item: NodeLineageItem): string => item.name),
    ['Source', 'Page'],
  );
  assert.equal(base.getModel().classifiers[0]?.name, 'Record');
});
