import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  ModelRef,
  Modeller,
  type Attribute,
  type AttributeInfo,
  type Classifier,
  type Constraint,
  type DataType,
  type Diagnostic,
  type EvolutionChange,
  type EvolutionReport,
  type Model,
  type ModelHeader,
  type ModelChange,
  type ModelRemovalPreview,
  type Node,
  type NodeRemovalPreview,
  type NodeLineageItem,
  type Relation,
  type WorkspaceElement,
  type ValidationResult,
} from '@ramen-suite/core/model';

void test('element getters read local and imported definitions without exposing the draft', (): void => {
  const filing: Modeller = Modeller.create('Filing');
  const document: Node = filing.createNode('Document').element;
  const folder: Node = filing.createNode('Folder').element;
  const status: DataType = filing.createDataType({ name: 'Status', baseType: DataTypes.String }).element;
  const filedIn: Relation = filing.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;

  const website: Modeller = filing.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;

  const imported: Node | undefined = website.getNode(document.id);
  const qualified: Node | undefined = website.getNode(ModelRef.qualify(filing.getModel().id, document.id));
  const local: Node | undefined = website.getNode(page.id);
  const importedType: DataType | undefined = website.getDataType(status.id);
  const importedRelation: Relation | undefined = website.getRelation(filedIn.id);

  assert.equal(imported?.name, 'Document');
  assert.deepEqual(qualified, imported);
  assert.equal(local?.name, 'Page');

  assert.equal(importedType?.name, 'Status');
  assert.equal(importedRelation?.name, 'FILED_IN');

  assert.equal(website.getNode('missing'), undefined);
  assert.equal(website.getDataType(DataTypes.String), undefined);
  assert.equal(website.getRelation('missing'), undefined);

  if (!imported || !importedType || !importedRelation) throw new Error('Expected imported definitions.');
  imported.name = 'Changed locally';
  importedType.name = 'Changed locally';
  importedRelation.name = 'Changed locally';

  assert.equal(website.getNode(document.id)?.name, 'Document');
  assert.equal(website.getDataType(status.id)?.name, 'Status');
  assert.equal(website.getRelation(filedIn.id)?.name, 'FILED_IN');
});

void test('most specific node accepts definitions or a lineage and rejects incomparable branches', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const letter: Node = model.createNode({ name: 'Letter', refines: document }).element;
  const note: Node = model.createNode({ name: 'Note', refines: document }).element;
  const privateLetter: Node = model.createNode({ name: 'PrivateLetter', refines: letter }).element;

  const lineage: readonly NodeLineageItem[] = model.getNodeLineage(privateLetter);
  const fromLineage: Node | undefined = model.getMostSpecificNode(lineage);
  const fromNodes: Node | undefined = model.getMostSpecificNode([document, letter, privateLetter]);

  assert.equal(fromLineage?.id, privateLetter.id);
  assert.equal(fromNodes?.id, privateLetter.id);
  assert.equal(model.getMostSpecificNode([note, privateLetter]), undefined);
  assert.equal(model.getMostSpecificNode([]), undefined);
  assert.throws((): Node | undefined => model.getMostSpecificNode(['missing']), /Expected one node/);

  const website: Modeller = model.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const acrossLevels: Node | undefined = website.getMostSpecificNode([document, page]);

  assert.equal(acrossLevels?.id, page.id);
});

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

void test('node diagnostics retain project-wide inheritance errors and update after repair', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const page: Node = model.createNode({ name: 'Page', refines: document }).element;

  model.updateNode(document.id, { superTypes: [page.id] });
  const invalid: ValidationResult = model.validateNode(page);

  assert.equal(invalid.hasErrors, true);
  assert.ok(invalid.diagnostics.some((item: Diagnostic): boolean => item.code === 'INHERITANCE_CYCLE' && item.path === '/'));

  model.updateNode(document.id, { superTypes: [] });
  assert.deepEqual(model.validateNode(page), { hasErrors: false, diagnostics: [] });
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

  assert.deepEqual(Object.keys(preview).sort(), ['nodes', 'relations']);

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

void test('narrowing a base relation invalidates a warmed child and repair refreshes validation and suggestions', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const folder: Node = base.createNode('Folder').element;
  const relation: Relation = base.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;

  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const applied: Relation = website.createRelation({ from: { node: page }, to: { node: section } }).element;

  assert.equal(website.validate().valid, true);
  assert.equal(website.suggestRelations(page, section).length > 0, true);

  base.updateRelation(relation.id, { to: { ...relation.to, bounds: { lowerBound: 0, upperBound: 1 } } });
  const finding: Diagnostic | undefined = website
    .validate()
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'RELATION_BOUNDS_WIDENED');

  assert.equal(website.validate().valid, false);
  assert.equal(finding?.severity, 'error');
  assert.equal(finding?.ref, applied.to.id);
  assert.equal(finding?.path, `/models/${website.getModel().id}/relations/0/to/bounds`);
  assert.throws((): unknown => website.suggestRelations(page, section), /invalid model/i);

  website.updateRelation(applied.id, { to: { ...applied.to, bounds: { lowerBound: 0, upperBound: 1 } } });
  assert.equal(website.validate().valid, true);
  assert.equal(website.suggestRelations(page, section).length > 0, true);
  assert.equal(Modeller.import(website.export()).validate().valid, true);
});

void test('export selects predecessors while snapshots retain sibling and descendant levels', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const website: Modeller = base.createNextLevel('Website');
  website.createNode({ name: 'Page', refines: document });

  const edition: Modeller = base.createNextLevel('Edition');
  edition.createNode({ name: 'Letter', refines: document });

  const publication: Modeller = website.createNextLevel('Publication');

  const exportedIds: readonly string[] = website.export().models.map((model: ModelHeader): string => model.id);
  assert.deepEqual(new Set<string>(exportedIds), new Set<string>([base.getModel().id, website.getModel().id]));

  const snapshot: Modeller = website.snapshot();
  assert.equal(snapshot.openLevel(edition.getModel().id).getModel().name, 'Edition');
  assert.equal(snapshot.openLevel(publication.getModel().id).getModel().name, 'Publication');
});
