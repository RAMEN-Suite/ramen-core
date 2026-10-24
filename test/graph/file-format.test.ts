import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFiles, Modeller, UnsupportedModelFormatError, type ModelFile } from '@ramen-suite/core/model';
import { RamenFiles, RamenModel, type RamenFile } from '@ramen-suite/core/ramen';

void test('file readers identify unsupported formats without changing their input', (): void => {
  const files: readonly ModelFile[] = [Modeller.create('Filing').export(), RamenModel.create('Edition').export()];
  const readers: readonly ((input: unknown) => unknown)[] = [
    (input: unknown): unknown => ModelFiles.read(input),
    (input: unknown): unknown => RamenFiles.read(input),
  ];

  files.forEach((file: ModelFile, index: number): void => {
    const input: ModelFile = { ...file, $schema: 'https://example.org/old-format.json' };
    const original: ModelFile = structuredClone(input);
    assert.throws(
      (): unknown => readers[index]?.(input),
      (error: unknown): boolean => {
        assert.ok(error instanceof UnsupportedModelFormatError);
        assert.equal(error.actualSchema, input.$schema);
        assert.equal(error.expectedSchema, file.$schema);
        return true;
      },
    );
    assert.deepEqual(input, original);
  });
});

void test('missing format identifiers and malformed current files remain schema errors', (): void => {
  const generic: ModelFile = Modeller.create('Filing').export();
  const ramen: RamenFile = RamenModel.create('Edition').export();
  assert.throws((): unknown => ModelFiles.read({ ...generic, $schema: undefined }), /Invalid model file/);
  assert.throws((): unknown => RamenFiles.read({ ...ramen, classifiers: null }), /Invalid model file/);
});
