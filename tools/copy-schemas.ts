import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';

const source: URL = new URL('../src/resources/schemas/', import.meta.url);
const destination: URL = new URL('../dist/ramen-core/schemas/', import.meta.url);
const schemas: readonly string[] = readdirSync(source).filter((name: string): boolean => name.endsWith('.schema.json'));

mkdirSync(destination, { recursive: true });
for (const name of schemas) copyFileSync(new URL(name, source), new URL(name, destination));
