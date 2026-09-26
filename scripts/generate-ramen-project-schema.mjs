import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const resource = (name) => fileURLToPath(new URL(`../src/resources/schemas/${name}`, import.meta.url));
const generic = JSON.parse(readFileSync(resource('model.schema.json'), 'utf8'));
const annotations = JSON.parse(readFileSync(resource('ramen-annotations.schema.json'), 'utf8'));
const uri = 'https://ramen-schema.org/ramen/1.0.0/project.schema.json';

function qualifyRefs(value) {
  if (Array.isArray(value)) return value.map(qualifyRefs);
  if (value === null || typeof value !== 'object') return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] =
      key === '$ref' && typeof entry === 'string' ? entry.replace(/^#\/\$defs\//, '#/$defs/Ramen') : qualifyRefs(entry);
  }
  return result;
}

const ramenDefs = Object.fromEntries(
  Object.entries(annotations.$defs).map(([name, definition]) => [`Ramen${name}`, qualifyRefs(definition)]),
);
const schema = {
  ...generic,
  $id: uri,
  title: 'RAMEN project model',
  required: [...generic.required, 'annotations'],
  properties: {
    ...generic.properties,
    $schema: { const: uri },
    annotations: qualifyRefs(annotations.properties.annotations),
    ext: { ...generic.properties.ext, properties: { ramen: false } },
  },
  $defs: { ...generic.$defs, ...ramenDefs },
};
const path = resource('ramen-project.schema.json');
const options = await prettier.resolveConfig(path);
const output = await prettier.format(JSON.stringify(schema), { ...options, parser: 'json' });

if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw new Error('RAMEN project schema is outdated. Run npm run schema:generate.');
} else {
  writeFileSync(path, output);
}
