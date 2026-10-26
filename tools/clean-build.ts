import { rmSync } from 'node:fs';

// A fresh build must not retain obsolete declarations, schemas or hashed chunks.
const output: URL = new URL('../dist/ramen-core/', import.meta.url);
rmSync(output, { recursive: true, force: true });
