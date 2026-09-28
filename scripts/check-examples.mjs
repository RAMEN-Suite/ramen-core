import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../examples/', import.meta.url));
const examples = readdirSync(directory, { recursive: true })
  .filter((file) => file.endsWith('.ts'))
  .sort();

for (const example of examples) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', `${directory}/${example}`], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
