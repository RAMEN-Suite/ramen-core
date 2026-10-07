import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller } from '@ramen-suite/core/model';
import type { Diagnostic, ModelFile, ModelInstanceGraph, Node, Relation } from '@ramen-suite/core/model';

function fileRecords(file: Node, folder: Node, membership: Relation): ModelInstanceGraph {
  const fileId: string = 'fileRecord00000001';
  const folderId: string = 'folderRecord000001';

  return {
    nodes: [
      { id: fileId, typeId: file.id, properties: { name: 'index.html' } },
      { id: folderId, typeId: folder.id, properties: { name: 'public' } },
    ],
    relations: [{ id: 'membership00000001', typeId: membership.id, fromId: fileId, toId: folderId }],
  };
}

void test('RMF scenario: a file system defines files, folders and recorded membership', (): void => {
  // Model definitions describe the records a file browser may later store.
  const filesystem: Modeller = Modeller.create('File system');
  const file: Node = filesystem.createNode('File').element;
  const folder: Node = filesystem.createNode('Folder').element;

  filesystem.createAttribute(file, {
    name: 'name',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
  });
  filesystem.createAttribute(folder, {
    name: 'name',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
  });
  const inFolder: Relation = filesystem.createRelation({
    name: 'IN_FOLDER',
    from: { node: file },
    to: { node: folder, bounds: { lowerBound: 1, upperBound: 1 } },
  }).element;

  assert.equal(filesystem.validate().valid, true);

  // The same model checks complete records, including the required link.
  const records: ModelInstanceGraph = fileRecords(file, folder, inFolder);
  const withoutMembership: ModelInstanceGraph = { ...records, relations: [] };

  assert.equal(
    filesystem.validateInstances(records).hasErrors,
    false,
    JSON.stringify(filesystem.validateInstances(records).diagnostics),
  );
  assert.ok(
    filesystem
      .validateInstances(withoutMembership)
      .diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_CARDINALITY_INVALID'),
  );

  const exchanged: ModelFile = filesystem.export();
  assert.deepEqual(Modeller.import(exchanged).export(), exchanged);
});
