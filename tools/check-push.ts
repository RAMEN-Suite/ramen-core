import { execFileSync, spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { readFileSync } from 'node:fs';

const updates: string = readFileSync(0, 'utf8');
const checked: Set<string> = new Set<string>();
let failed: boolean = false;

for (const line of updates.split('\n')) {
  if (!line.trim()) continue;

  const fields: string[] = line.trim().split(/\s+/);
  if (fields.length !== 4) throw new Error(`Invalid pre-push ref update: ${line}`);

  const localSha: string | undefined = fields[1];
  const remoteSha: string | undefined = fields[3];
  if (!localSha || !remoteSha) throw new Error(`Invalid pre-push ref update: ${line}`);
  if (/^0+$/.test(localSha)) continue;

  const range: string[] = /^0+$/.test(remoteSha) ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`];
  const output: string = execFileSync('git', ['rev-list', '--reverse', ...range], { encoding: 'utf8' });

  for (const sha of output.trim().split('\n')) {
    if (!sha || checked.has(sha)) continue;
    checked.add(sha);

    const message: string = execFileSync('git', ['show', '-s', '--format=%B', sha], { encoding: 'utf8' });
    const result: SpawnSyncReturns<string> = spawnSync('npx', ['--no', '--', 'commitlint'], {
      input: message,
      encoding: 'utf8',
    });
    if (result.status === 0) continue;

    failed = true;
    process.stderr.write(`Commit ${sha.slice(0, 7)} does not satisfy commitlint.\n`);
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.error) throw result.error;
    break;
  }

  if (failed) break;
}

if (failed) process.exitCode = 1;
