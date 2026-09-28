import { rmSync } from 'node:fs';

const target = process.argv[2];
if (target !== undefined && target !== 'core') throw new Error('Use clean or clean:core.');

const directory = target === 'core' ? '../dist/ramen-core/' : '../dist/';
rmSync(new URL(directory, import.meta.url), { recursive: true, force: true });
