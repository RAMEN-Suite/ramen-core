import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import type { Options } from 'prettier';
import generic from '../src/resources/schemas/model.schema.json' with { type: 'json' };
import annotations from '../src/resources/schemas/ramen-annotations.schema.json' with { type: 'json' };

interface Schema {
  readonly [key: string]: unknown;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema | boolean>>;
}

interface ModelSchema extends Schema {
  readonly $id: string;
  readonly required: readonly string[];
  readonly properties: Readonly<Record<string, Schema>>;
  readonly $defs: Readonly<Record<string, Schema>>;
}

interface FileInput {
  readonly name: string;
  readonly source: ModelSchema;
  readonly uri: string;
  readonly ramen: boolean;
}

const projectUri: string = 'https://ramen-schema.org/ramen/1.0.0/project.schema.json';
const excluded: readonly string[] = ['classifiers', 'relations', 'annotations'];

function resource(name: string): string {
  return fileURLToPath(new URL(`../src/resources/schemas/${name}`, import.meta.url));
}

function qualifyRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(qualifyRefs);
  if (value === null || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  const entries: readonly [string, unknown][] = Object.entries(value);
  for (const [key, entry] of entries) {
    result[key] =
      key === '$ref' && typeof entry === 'string' ? entry.replace(/^#\/\$defs\//, '#/$defs/Ramen') : qualifyRefs(entry);
  }
  return result;
}

function projectSchema(): ModelSchema {
  const definitions: Readonly<Record<string, Schema>> = Object.fromEntries(
    Object.entries(annotations.$defs).map(([name, definition]: [string, Schema]): [string, Schema] => [
      `Ramen${name}`,
      qualifyRefs(definition) as Schema,
    ]),
  );
  return {
    ...generic,
    $id: projectUri,
    title: 'RAMEN project model',
    required: [...generic.required, 'annotations'],
    properties: {
      ...generic.properties,
      $schema: { const: projectUri },
      annotations: qualifyRefs(annotations.properties.annotations) as Schema,
      ext: { ...generic.properties.ext, properties: { ramen: false } },
    },
    $defs: { ...generic.$defs, ...definitions },
  };
}

function owned(definition: Schema | undefined): Schema {
  if (!definition?.required || !definition.properties) throw new Error('Owned elements require properties and required fields.');
  return {
    ...definition,
    required: [...definition.required, 'modelId'],
    properties: {
      ...definition.properties,
      modelId: { $ref: '#/$defs/Id', description: 'Model that declares this element. Nested elements share this owner.' },
    },
  };
}

function header(source: ModelSchema, ramen: boolean): Schema {
  const metadata: Readonly<Record<string, Schema>> = Object.fromEntries(
    Object.entries(source.properties).filter(([key]: [string, Schema]): boolean => !excluded.includes(key)),
  );
  return {
    type: 'object',
    additionalProperties: false,
    required: generic.required.filter((key: string): boolean => !['classifiers', 'relations'].includes(key)),
    properties: { ...metadata, $schema: { enum: ramen ? [generic.$id, projectUri] : [generic.$id] } },
  };
}

function graphProperties(fileUri: string, ramen: boolean): Readonly<Record<string, Schema>> {
  const properties: Record<string, Schema> = {
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
  };
  if (ramen) {
    properties.annotations = {
      type: 'array',
      items: { $ref: '#/$defs/OwnedAnnotation' },
      description:
        'Each annotation type is declared once. It can belong to a project while referring to the unchanged RAMEN Annotation node.',
    };
  }
  return properties;
}

function graphSchema(input: FileInput): Schema {
  const definitions: Readonly<Record<string, Schema>> = JSON.parse(
    JSON.stringify(input.source.$defs).replaceAll(`${generic.$id}#/$defs/`, '#/$defs/'),
  ) as Readonly<Record<string, Schema>>;
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: input.uri,
    title: input.ramen ? 'RAMEN shared model graph' : 'RMF shared model graph',
    description:
      'One graph retaining inheritance and original declarations. Model headers and declaration ownership allow lossless splitting. References resolve relative to the declaring model; inherited features are computed by the library, not copied into this file.',
    type: 'object',
    additionalProperties: false,
    required: ['$schema', 'id', 'models', 'classifiers', 'relations', ...(input.ramen ? ['annotations'] : [])],
    properties: graphProperties(input.uri, input.ramen),
    $defs: {
      ...definitions,
      Header: header(input.source, input.ramen),
      OwnedNode: owned(definitions.Node),
      OwnedDataType: owned(definitions.DataType),
      OwnedRelation: owned(definitions.Relation),
      ...(input.ramen ? { OwnedAnnotation: owned(definitions.RamenAnnotation) } : {}),
    },
  };
}

async function emit(name: string, schema: Schema): Promise<void> {
  const destination: string = resource(name);
  const options: Options | null = await prettier.resolveConfig(destination);
  const generated: string = await prettier.format(JSON.stringify(schema), { ...options, parser: 'json' });
  if (!process.argv.includes('--check')) {
    writeFileSync(destination, generated);
    return;
  }
  if (readFileSync(destination, 'utf8') !== generated) throw new Error(`Outdated ${name}. Run npm run schema:generate.`);
}

const project: ModelSchema = projectSchema();
const files: readonly FileInput[] = [
  { name: 'model-file.schema.json', source: generic, uri: 'https://ramen-schema.org/model/1.0.0/file.schema.json', ramen: false },
  { name: 'ramen-file.schema.json', source: project, uri: 'https://ramen-schema.org/ramen/1.0.0/file.schema.json', ramen: true },
];

await emit('ramen-project.schema.json', project);
for (const file of files) await emit(file.name, graphSchema(file));
