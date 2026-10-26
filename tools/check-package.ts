import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type BuildResult } from 'esbuild';

interface PackedFile {
  readonly filename: string;
  readonly files: readonly { readonly path: string }[];
}

interface InstalledPackage {
  readonly name: string;
  readonly private?: boolean;
  readonly type: string;
  readonly sideEffects?: boolean;
}

const root: string = fileURLToPath(new URL('../', import.meta.url));
const npmCli: string = process.env['npm_execpath'] ?? '';

if (!npmCli) throw new Error('Run this check with npm run package:check.');

function pack(destination: string): PackedFile {
  const output: string = execFileSync(
    process.execPath,
    [npmCli, 'pack', '.', '--json', '--ignore-scripts', '--pack-destination', destination],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );

  const files: readonly PackedFile[] = JSON.parse(output) as readonly PackedFile[];
  const file: PackedFile | undefined = files[0];

  if (!file) throw new Error('npm pack returned no package.');
  return file;
}

function checkContents(file: PackedFile): void {
  const paths: ReadonlySet<string> = new Set(file.files.map((entry: { readonly path: string }): string => entry.path));
  const documents: readonly string[] = ['package.json', 'README.md', 'LICENSE'];
  const unexpected: readonly string[] = [...paths].filter(
    (path: string): boolean => !path.startsWith('dist/ramen-core/') && !documents.includes(path),
  );
  if (unexpected.length > 0) throw new Error(`Unexpected package files: ${unexpected.join(', ')}`);

  const schemas: readonly string[] = readdirSync(join(root, 'src/resources/schemas')).filter((name: string): boolean =>
    name.endsWith('.schema.json'),
  );
  const required: readonly string[] = [...documents, ...schemas.map((name: string): string => `dist/ramen-core/schemas/${name}`)];
  const missing: readonly string[] = required.filter((path: string): boolean => !paths.has(path));
  if (missing.length > 0) throw new Error(`Missing package files: ${missing.join(', ')}`);

  const missingModules: readonly string[] = [...paths]
    .filter((path: string): boolean => path.endsWith('.d.ts'))
    .map((path: string): string => path.replace(/\.d\.ts$/, '.js'))
    .filter((path: string): boolean => !paths.has(path));
  if (missingModules.length > 0) throw new Error(`Missing runtime modules: ${missingModules.join(', ')}`);

  const sharedChunks: boolean = [...paths].some((path: string): boolean => path.startsWith('dist/ramen-core/chunks/'));
  if (sharedChunks) {
    throw new Error('The package must preserve modules rather than publish generated shared chunks.');
  }
}

function install(tarball: string, consumer: string): void {
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));

  execFileSync(process.execPath, [npmCli, 'install', tarball, '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer,
    stdio: 'inherit',
  });

  const manifestPath: string = join(consumer, 'node_modules/@ramen-suite/core/package.json');
  const installed: InstalledPackage = JSON.parse(readFileSync(manifestPath, 'utf8')) as InstalledPackage;

  const publicPackage: boolean = installed.name === '@ramen-suite/core' && !installed.private;
  const optimisableEsm: boolean = installed.type === 'module' && installed.sideEffects === false;
  if (!publicPackage || !optimisableEsm) {
    throw new Error('The published manifest must identify RAMEN Core as a public, side-effect-free ESM package.');
  }
}

function compileConsumer(consumer: string): void {
  copyFileSync(join(root, 'test/package/consumer.ts'), join(consumer, 'consumer.ts'));
  const config: object = {
    compilerOptions: { strict: true, resolveJsonModule: true, module: 'NodeNext', target: 'ES2022' },
    include: ['consumer.ts'],
  };
  writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify(config));

  const compiler: string = join(root, 'node_modules/typescript/bin/tsc');
  execFileSync(process.execPath, [compiler, '-p', 'tsconfig.json'], { cwd: consumer, stdio: 'inherit' });
}

function runConsumer(consumer: string, entry: string = 'consumer.js'): void {
  const runtimes: readonly string[] = process.argv.length > 2 ? process.argv.slice(2) : [process.execPath];
  for (const runtime of runtimes) {
    const version: string = execFileSync(runtime, ['--version'], { encoding: 'utf8' }).trim();
    execFileSync(runtime, [entry], { cwd: consumer, stdio: 'inherit' });
    console.log(`Packed ${entry} consumer passed on ${version}.`);
  }
}

async function bundleBrowserConsumer(consumer: string): Promise<void> {
  const result: BuildResult = await build({
    absWorkingDir: consumer,
    entryPoints: ['consumer.ts'],
    outfile: 'browser-consumer.js',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    logLevel: 'silent',
  });
  if (result.warnings.length > 0) throw new Error(`Browser bundle warnings: ${JSON.stringify(result.warnings)}`);
  runConsumer(consumer, 'browser-consumer.js');
}

async function checkTreeShaking(consumer: string): Promise<void> {
  const result: BuildResult = await build({
    stdin: {
      contents: "export { DataTypes } from '@ramen-suite/core';",
      resolveDir: consumer,
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  if (result.warnings.length > 0) throw new Error(`Tree-shaking warnings: ${JSON.stringify(result.warnings)}`);
  if (!result.metafile) throw new Error('Missing tree-shaking metadata.');

  const retained: readonly string[] = Object.values(result.metafile.outputs).flatMap((output): string[] =>
    Object.entries(output.inputs)
      .filter(([, input]): boolean => input.bytesInOutput > 0)
      .map(([path]): string => path.replaceAll('\\', '/')),
  );

  const modules: readonly string[] = retained.filter((path: string): boolean => path !== '<stdin>');
  const onlyBuiltins: boolean = modules.length === 1 && modules[0]?.endsWith('/dist/ramen-core/model/Builtins.js') === true;
  if (!onlyBuiltins) {
    throw new Error(`A DataTypes import retained unrelated code: ${retained.join(', ')}`);
  }
  console.log('Browser tree shaking retained only the built-in data types.');
}

const temporary: string = mkdtempSync(join(tmpdir(), 'ramen-package-'));

try {
  const file: PackedFile = pack(temporary);
  checkContents(file);

  const consumer: string = join(temporary, 'consumer');
  install(join(temporary, file.filename), consumer);

  compileConsumer(consumer);
  runConsumer(consumer);
  await bundleBrowserConsumer(consumer);
  await checkTreeShaking(consumer);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
