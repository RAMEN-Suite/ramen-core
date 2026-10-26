import assert from 'node:assert/strict';
import test from 'node:test';
import { Modeller, type ModelFile, type ModelHeader, type ProjectMetadata } from '@ramen-suite/core/model';
import { RamenModel, type RamenFile } from '@ramen-suite/core/ramen';

void test('project metadata survives exchange, level selection and snapshots without renaming models', (): void => {
  const project: ProjectMetadata = {
    name: 'Correspondence project',
    description: 'Letters, drafts and annotations.\nAn edition.',
  };
  const base: Modeller = Modeller.create('Language');
  const next: Modeller = base.createNextLevel('Edition');

  const file: ModelFile = next.export(project);
  const restored: Modeller = Modeller.import(JSON.parse(JSON.stringify(file)) as unknown);

  assert.deepEqual(restored.getProjectMetadata(), project);
  assert.deepEqual(restored.export(), file);
  assert.equal(restored.getModel().name, 'Edition');

  assert.deepEqual(restored.openLevel(base.getModel().id).snapshot().export().project, project);
  assert.deepEqual(restored.createNextLevel('Publication').export().project, project);
  assert.deepEqual(file.models.map((model: ModelHeader): string => model.name).sort(), ['Edition', 'Language']);

  const replacement: ProjectMetadata = { name: 'Another project', description: '' };
  assert.deepEqual(restored.export(replacement).project, replacement);
  assert.deepEqual(restored.getProjectMetadata(), project);
});

void test('RAMEN project metadata remains separate from model levels through import and export', (): void => {
  const project: ProjectMetadata = { name: 'Briefedition ÄÖÜ', description: 'Eine Edition mit Briefen und Varianten.' };
  const base: RamenModel = RamenModel.create('Edition');
  const next: RamenModel = base.createNextLevel('Publication');

  const file: RamenFile = next.export(project);
  const restored: RamenModel = RamenModel.import(JSON.parse(JSON.stringify(file)) as unknown);

  assert.deepEqual(restored.export(), file);
  assert.deepEqual(restored.getProjectMetadata(), project);
  assert.equal(restored.getModel().name, 'Publication');
  assert.equal(restored.openLevel(base.getModel().id).getModel().name, 'Edition');
  assert.deepEqual(restored.openLevel(base.getModel().id).snapshot().export().project, project);
  assert.deepEqual(restored.createNextLevel('Print').export().project, project);

  Object.assign(project, { name: 'Changed' });
  assert.notEqual(file.project?.name, project.name);

  const metadata: ProjectMetadata | undefined = restored.getProjectMetadata();
  Object.assign(metadata ?? {}, { description: 'Changed' });
  assert.equal(restored.getProjectMetadata()?.description, file.project?.description);
});

void test('exchange rejects malformed project metadata in both formats', (): void => {
  const generic: Modeller = Modeller.create('Language');
  const ramen: RamenModel = RamenModel.create('Edition');
  const invalid: readonly unknown[] = [
    null,
    [],
    'Project',
    {},
    { name: '', description: '' },
    { name: 'Project' },
    { name: 'Project', description: 42 },
    { name: 'Project', description: '', extra: true },
  ];

  for (const project of invalid) {
    assert.throws((): Modeller => Modeller.import({ ...generic.export(), project }), /Invalid model file/);
    assert.throws((): RamenModel => RamenModel.import({ ...ramen.export(), project }), /Invalid model file/);
  }
  assert.throws((): ModelFile => generic.export({ name: '', description: '' }), /Invalid model file/);
  assert.throws((): RamenFile => ramen.export({ name: '', description: '' }), /Invalid model file/);
});
