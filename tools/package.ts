import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source: string = fileURLToPath(new URL('../src/resources/schemas/', import.meta.url));
const destination: string = fileURLToPath(new URL('../dist/ramen-core/schemas/', import.meta.url));
const schemas: readonly string[] = readdirSync(source).filter((name: string): boolean => name.endsWith('.schema.json'));

mkdirSync(destination, { recursive: true });
for (const name of schemas) copyFileSync(`${source}/${name}`, `${destination}/${name}`);

interface PackageSource {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly author: Readonly<Record<string, string>>;
  readonly keywords: readonly string[];
  readonly dependencies: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, unknown>>;
  readonly repository: Readonly<Record<string, string>>;
  readonly homepage: string;
  readonly bugs: Readonly<Record<string, string>>;
}

const root: string = fileURLToPath(new URL('../', import.meta.url));
const output: string = fileURLToPath(new URL('../dist/ramen-core/', import.meta.url));
const sourcePackage: PackageSource = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as PackageSource;
const exports: unknown = JSON.parse(JSON.stringify(sourcePackage.exports).replaceAll('./dist/ramen-core/', './'));
const manifest: object = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  description: sourcePackage.description,
  keywords: sourcePackage.keywords,
  license: sourcePackage.license,
  author: sourcePackage.author,
  repository: sourcePackage.repository,
  homepage: sourcePackage.homepage,
  bugs: sourcePackage.bugs,
  type: 'module',
  sideEffects: false,
  exports,
  dependencies: sourcePackage.dependencies,
  publishConfig: { access: 'public' },
};

writeFileSync(`${output}/package.json`, `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(`${root}/LICENSE`, `${output}/LICENSE`);
const repository: string = sourcePackage.repository['url']?.replace(/^git\+/, '').replace(/\.git$/, '') ?? '';
const readme: string = readFileSync(`${root}/README.md`, 'utf8').replace(
  /\]\((?!https?:|mailto:|#)([^)]+)\)/g,
  (_match: string, path: string): string => `](${repository}/blob/main/${path})`,
);
writeFileSync(`${output}/README.md`, readme);
