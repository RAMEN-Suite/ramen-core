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

function owned(definition) {
  return {
    ...definition,
    required: [...definition.required, 'modelId'],
    properties: {
      ...definition.properties,
      modelId: { $ref: '#/$defs/Id', description: 'Model that declares this element. Nested elements share this owner.' },
    },
  };
}

function graphSchema(source, fileUri, ramen) {
  const metadata = Object.fromEntries(
    Object.entries(source.properties).filter(([key]) => !['classifiers', 'relations', 'annotations'].includes(key)),
  );
  const definitions = JSON.parse(JSON.stringify(source.$defs).replaceAll(`${generic.$id}#/$defs/`, '#/$defs/'));
  const header = {
    type: 'object',
    additionalProperties: false,
    required: generic.required.filter((key) => !['classifiers', 'relations'].includes(key)),
    properties: { ...metadata, $schema: { enum: ramen ? [generic.$id, uri] : [generic.$id] } },
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: fileUri,
    title: ramen ? 'RAMEN shared model graph' : 'RMF shared model graph',
    description:
      'One graph retaining inheritance and original declarations. Model headers and declaration ownership allow lossless splitting. References resolve relative to the declaring model; inherited features are computed by the library, not copied into this file.',
    type: 'object',
    additionalProperties: false,
    required: ['$schema', 'id', 'models', 'classifiers', 'relations', ...(ramen ? ['annotations'] : [])],
    properties: {
      $schema: { const: fileUri },
      id: {
        $ref: '#/$defs/Id',
        description: 'Identity of the exported project, matching one model header. Its context preserves relation restrictions.',
      },
      models: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/$defs/Header' },
        description: 'Original metadata and imports only; declarations live in the shared arrays.',
      },
      classifiers: { type: 'array', items: { oneOf: [{ $ref: '#/$defs/OwnedNode' }, { $ref: '#/$defs/OwnedDataType' }] } },
      relations: {
        type: 'array',
        items: { $ref: '#/$defs/OwnedRelation' },
        description: 'All original relation declarations. Presence does not automatically permit use at every model level.',
      },
      ...(ramen
        ? {
            annotations: {
              type: 'array',
              items: { $ref: '#/$defs/OwnedAnnotation' },
              description:
                'Each annotation type is declared once. It can belong to a project while referring to the unchanged RAMEN Annotation node.',
            },
          }
        : {}),
    },
    $defs: {
      ...definitions,
      Header: header,
      OwnedNode: owned(definitions.Node),
      OwnedDataType: owned(definitions.DataType),
      OwnedRelation: owned(definitions.Relation),
      ...(ramen ? { OwnedAnnotation: owned(definitions.RamenAnnotation) } : {}),
    },
  };
}

for (const [name, source, fileUri, ramen] of [
  ['model-file.schema.json', generic, 'https://ramen-schema.org/model/1.0.0/file.schema.json', false],
  ['ramen-file.schema.json', schema, 'https://ramen-schema.org/ramen/1.0.0/file.schema.json', true],
]) {
  const destination = resource(name);
  const generated = await prettier.format(JSON.stringify(graphSchema(source, fileUri, ramen)), { ...options, parser: 'json' });
  if (process.argv.includes('--check')) {
    if (readFileSync(destination, 'utf8') !== generated) throw new Error(`Outdated ${name}. Run npm run schema:generate.`);
  } else writeFileSync(destination, generated);
}
