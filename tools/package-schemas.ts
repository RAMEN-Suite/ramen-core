import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source: string = fileURLToPath(new URL('../src/resources/schemas/', import.meta.url));
const destination: string = fileURLToPath(new URL('../dist/ramen-core/schemas/', import.meta.url));
const schemas: readonly string[] = readdirSync(source).filter((name: string): boolean => name.endsWith('.schema.json'));

mkdirSync(destination, { recursive: true });
for (const name of schemas) copyFileSync(`${source}/${name}`, `${destination}/${name}`);
