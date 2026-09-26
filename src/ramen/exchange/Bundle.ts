import type { ConstraintRegistry } from '../../model/validation/Constraints';
import { compileSchema, SchemaNode } from 'json-schema-library';
import type { Diagnostic, Id, Model, ProjectGraph, ProjectValidationResult } from '../../model/index';
import { RamenValidator } from '../validation/ModelValidator';
import bundleSchema from '../../resources/schemas/ramen-bundle.schema.json';

/** Canonical schema identifier of the RAMEN project bundle. */
export const RAMEN_BUNDLE_SCHEMA_URI: string = 'https://ramen-schema.org/ramen/1.0.0/bundle.schema.json';
/** Version of the RAMEN project bundle envelope. */
export const RAMEN_BUNDLE_VERSION: string = '1.0.0';

/** One file containing a RAMEN project model and all models it imports. */
export interface RamenModelBundle {
  readonly $schema: string;
  readonly kind: 'RamenModelBundle';
  readonly version: string;
  readonly rootModelId: Id;
  readonly models: readonly Model[];
}

/** Bundle creation result with project diagnostics on failure. */
export type CreateRamenBundleResult =
  { readonly ok: true; readonly bundle: RamenModelBundle } | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

const BUNDLE_SCHEMA: SchemaNode = compileSchema(bundleSchema);

/** Packs a valid RAMEN project and its dependencies into one file. */
export function createRamenBundle(
  rootModelId: Id,
  models: readonly Model[],
  constraints?: ConstraintRegistry,
): CreateRamenBundleResult {
  const validation: ProjectValidationResult = new RamenValidator(constraints).validateProject(rootModelId, models);
  if (!validation.valid) return { ok: false, diagnostics: validation.diagnostics };
  return {
    ok: true,
    bundle: {
      $schema: RAMEN_BUNDLE_SCHEMA_URI,
      kind: 'RamenModelBundle',
      version: RAMEN_BUNDLE_VERSION,
      rootModelId,
      models: orderedModels(validation.graph, models),
    },
  };
}

/** Validates a RAMEN bundle and returns its separate, detached models. */
export function splitRamenBundle(input: unknown, constraints?: ConstraintRegistry): readonly Model[] {
  return parseRamenBundle(input, constraints).models;
}

/** Validates a RAMEN bundle before exposing its model documents. */
export function parseRamenBundle(input: unknown, constraints?: ConstraintRegistry): RamenModelBundle {
  const envelope: { readonly valid: boolean } = BUNDLE_SCHEMA.validate(input);
  if (!envelope.valid || !isRecord(input) || !Array.isArray(input.models) || typeof input.rootModelId !== 'string') {
    throw new Error('Invalid RAMEN project bundle envelope.');
  }

  const models: readonly unknown[] = input.models;
  const validation: ProjectValidationResult = new RamenValidator(constraints).validateProject(input.rootModelId, models);
  if (!validation.valid) {
    const messages: string = validation.diagnostics.map((item: Diagnostic): string => item.message).join('\n');
    throw new Error(`Invalid RAMEN project bundle:\n${messages}`);
  }
  return {
    $schema: RAMEN_BUNDLE_SCHEMA_URI,
    kind: 'RamenModelBundle',
    version: RAMEN_BUNDLE_VERSION,
    rootModelId: input.rootModelId,
    models: orderedModels(validation.graph, models as Model[]),
  };
}

function orderedModels(graph: ProjectGraph, models: readonly Model[]): readonly Model[] {
  const originals: ReadonlyMap<Id, Model> = new Map<Id, Model>(models.map((model: Model): [Id, Model] => [model.id, model]));
  return graph.getModels().map((model: Model): Model => structuredClone(originals.get(model.id) ?? model));
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
