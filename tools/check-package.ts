import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackedFile {
  readonly filename: string;
}

interface InstalledPackage {
  readonly name: string;
  readonly private?: boolean;
  readonly scripts?: Readonly<Record<string, string>>;
}

const root: string = fileURLToPath(new URL('../', import.meta.url));
const temporary: string = mkdtempSync(join(tmpdir(), 'ramen-package-'));
const npm: string = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  const packed: string = execFileSync(
    npm,
    ['pack', './dist/ramen-core', '--json', '--ignore-scripts', '--pack-destination', temporary],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  const files: readonly PackedFile[] = JSON.parse(packed) as readonly PackedFile[];
  const file: PackedFile | undefined = files[0];
  if (!file) throw new Error('npm pack returned no package.');
  const consumer: string = join(temporary, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));

  execFileSync(npm, ['install', join(temporary, file.filename), '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: consumer,
    stdio: 'inherit',
  });
  const manifestPath: string = join(consumer, 'node_modules/@ramen-suite/core/package.json');
  const installed: InstalledPackage = JSON.parse(readFileSync(manifestPath, 'utf8')) as InstalledPackage;
  if (installed.name !== '@ramen-suite/core' || installed.private || installed.scripts) {
    throw new Error('The published manifest must identify RAMEN Core and exclude private development scripts.');
  }

  const example: string = readFileSync(join(root, 'test/package/consumer.ts'), 'utf8');
  writeFileSync(join(consumer, 'consumer.ts'), example);
  execFileSync(process.execPath, ['--experimental-strip-types', 'consumer.ts'], { cwd: consumer, stdio: 'inherit' });
  execFileSync(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--resolveJsonModule',
      '--module',
      'nodenext',
      '--target',
      'es2022',
      'consumer.ts',
    ],
    { cwd: consumer, stdio: 'inherit' },
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
