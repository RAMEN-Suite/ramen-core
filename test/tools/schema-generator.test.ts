import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';

const root: string = fileURLToPath(new URL('../../', import.meta.url));

function fixture(context: TestContext): string {
  const directory: string = mkdtempSync(join(tmpdir(), 'ramen-schemas-'));
  context.after((): void => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'tools'));
  mkdirSync(join(directory, 'src/resources/schemas'), { recursive: true });

  const files: readonly string[] = [
    'tools/generate-schema.ts',
    'src/resources/schemas/model.schema.json',
    'src/resources/schemas/ramen-annotations.schema.json',
    '.prettierrc',
  ];
  for (const name of files) {
    copyFileSync(join(root, name), join(directory, name));
  }
  writeFileSync(join(directory, 'package.json'), '{"type":"module"}\n');
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
  return directory;
}

function generate(directory: string, check: boolean = false): void {
  const args: readonly string[] = [join(directory, 'tools/generate-schema.ts'), ...(check ? ['--check'] : [])];
  execFileSync(process.execPath, args, { cwd: directory, stdio: 'pipe', timeout: 15_000 });
}

void test('schema generation leaves current files untouched', (context: TestContext): void => {
  const directory: string = fixture(context);
  const schema: string = join(directory, 'src/resources/schemas/ramen-project.schema.json');
  generate(directory);
  const modified: number = statSync(schema).mtimeMs;

  generate(directory, true);
  generate(directory);
  assert.equal(statSync(schema).mtimeMs, modified);
});

void test('schema check rejects stale files without writing and generation replaces them', (context: TestContext): void => {
  const directory: string = fixture(context);
  const schema: string = join(directory, 'src/resources/schemas/ramen-project.schema.json');
  const expected: string = readFileSync(join(root, 'src/resources/schemas/ramen-project.schema.json'), 'utf8');
  writeFileSync(schema, '{}\n');

  assert.throws((): void => generate(directory, true), /Outdated ramen-project.schema.json/);
  assert.equal(readFileSync(schema, 'utf8'), '{}\n');
  generate(directory);
  assert.equal(readFileSync(schema, 'utf8'), expected);
});

void test('schema check rejects missing files without creating them and generation restores them', (context: TestContext): void => {
  const directory: string = fixture(context);
  const schemas: string = join(directory, 'src/resources/schemas');
  const schema: string = join(schemas, 'ramen-project.schema.json');
  const expected: string = readFileSync(join(root, 'src/resources/schemas/ramen-project.schema.json'), 'utf8');

  assert.throws((): void => generate(directory, true), /Outdated ramen-project.schema.json/);
  assert.equal(readdirSync(schemas).includes('ramen-project.schema.json'), false);
  generate(directory);
  assert.equal(readFileSync(schema, 'utf8'), expected);
});

void test(
  'schema replacement replaces destination symlinks without overwriting their targets',
  { skip: process.platform === 'win32' },
  (context: TestContext): void => {
    const directory: string = fixture(context);
    const schemas: string = join(directory, 'src/resources/schemas');
    const schema: string = join(schemas, 'ramen-project.schema.json');
    const target: string = join(directory, 'unrelated.json');
    writeFileSync(target, 'unrelated content');
    symlinkSync(target, schema);

    generate(directory);
    assert.equal(readFileSync(target, 'utf8'), 'unrelated content');
    const expected: string = readFileSync(join(root, 'src/resources/schemas/ramen-project.schema.json'), 'utf8');
    assert.equal(readFileSync(schema, 'utf8'), expected);
    assert.equal(
      readdirSync(schemas).some((name: string): boolean => name.startsWith('.schema-')),
      false,
    );
    generate(directory, true);
  },
);
