import assert from 'node:assert/strict';
import test from 'node:test';
import model from '@ramen-suite/core/schemas/model.schema.json' with { type: 'json' };
import modelFile from '@ramen-suite/core/schemas/model-file.schema.json' with { type: 'json' };
import instances from '@ramen-suite/core/schemas/model-instances.schema.json' with { type: 'json' };
import annotations from '@ramen-suite/core/schemas/ramen-annotations.schema.json' with { type: 'json' };
import project from '@ramen-suite/core/schemas/ramen-project.schema.json' with { type: 'json' };
import ramenFile from '@ramen-suite/core/schemas/ramen-file.schema.json' with { type: 'json' };

interface PackagedSchema {
  readonly $id: string;
  readonly $schema: string;
}

void test('package exports each RMF and RAMEN schema under its public path', (): void => {
  const schemas: readonly PackagedSchema[] = [model, modelFile, instances, annotations, project, ramenFile];
  const ids: readonly string[] = schemas.map((schema: PackagedSchema): string => schema.$id);

  assert.equal(new Set<string>(ids).size, schemas.length);
  assert.ok(ids.every((id: string): boolean => id.startsWith('https://ramen-schema.org/')));
  assert.ok(schemas.every((schema: PackagedSchema): boolean => schema.$schema.endsWith('/2020-12/schema')));
});
