import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  type Attribute,
  type AttributeInfo,
  type ModelFile,
  type Node,
  type NodeLineageItem,
  type Relation,
  type RelationSelection,
} from '@ramen-suite/core/model';

function revisePost(website: Modeller, post: Node): void {
  const published: Attribute = website.createAttribute(post, { name: 'publish', typeId: DataTypes.Boolean }).element;

  website.updateNode(post.id, { name: 'Post' });
  website.updateAttribute(post.id, published.id, { name: 'published' });
  const temporary: Attribute = website.createAttribute(post, { name: 'temporary', typeId: DataTypes.String }).element;
  website.removeAttribute(post.id, temporary.id);
}

void test('RMF scenario: a website applies a file system relation to pages and sections', (): void => {
  const filesystem: Modeller = Modeller.create('File system');
  const file: Node = filesystem.createNode('File').element;
  const folder: Node = filesystem.createNode('Folder').element;

  filesystem.createAttribute(file, { name: 'name', typeId: DataTypes.String });
  const inFolder: Relation = filesystem.createRelation({
    name: 'IN_FOLDER',
    from: { node: file },
    to: { node: folder, bounds: { lowerBound: 0, upperBound: 1 } },
  }).element;

  const website: Modeller = filesystem.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: file }).element;
  const section: Node = website.createNode({ name: 'Section', refines: folder }).element;
  const post: Node = website.createNode({ name: 'DraftPost', refines: page }).element;

  assert.equal(website.suggestRelations(page, section)[0]?.relationId, inFolder.id);

  // Importing a relation does not enable it on the next level.
  const applied: Relation = website.createRelation({
    refines: inFolder,
    from: { node: page },
    to: { node: section },
  }).element;
  // A modeller corrects names and removes a provisional property before export.
  revisePost(website, post);

  assert.deepEqual(
    website.getNodeLineage(post).map((item: NodeLineageItem): string => item.name),
    ['File', 'Page', 'Post'],
  );
  assert.deepEqual(
    website.getAttributes(post).map((item: AttributeInfo): string => item.name),
    ['name', 'published'],
  );

  assert.equal(website.getMostSpecificNode([file, page, post])?.id, post.id);
  assert.equal(website.getNode(post.id)?.name, 'Post');
  assert.ok(
    website.getRelations(page, section).some((relation: RelationSelection): boolean => relation.ref.endsWith(applied.id)),
  );

  const exchanged: ModelFile = website.export();
  const restored: Modeller = Modeller.import(exchanged);

  assert.equal(exchanged.models.length, 2);
  assert.equal(restored.validate().valid, true);
  assert.equal(restored.openLevel(filesystem.getModel().id).getNode(file.id)?.name, 'File');
});
