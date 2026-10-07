import { rmSync } from 'node:fs';

const output: URL = new URL('../dist/ramen-core/', import.meta.url);

// A fresh build must not retain obsolete declarations, schemas or hashed chunks.
rmSync(output, { recursive: true, force: true });
