import { Model, ModelBundle, Id } from '../Types';
import { ModelSchemaValidator } from '../validation/ModelSchema';
import { Diagnostic } from '../validation/Diagnostics';
import { ModelValidator, ProjectValidationResult } from '../validation/ModelValidator';
import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import bundleSchema from '../../resources/schemas/model-bundle.schema.json';

/** Canonical schema identifier of the supported model bundle envelope. */
export const MODEL_BUNDLE_SCHEMA: string = 'https://ramen-schema.org/model/1.0.0/bundle.schema.json';
/** Version of the supported model bundle envelope. */
export const MODEL_BUNDLE_VERSION: string = '1.0.0';

const BUNDLE_SCHEMA_NODE: SchemaNode = compileSchema(bundleSchema);

/** Bundle creation result with graph diagnostics on failure. */
export type CreateBundleResult =
  { readonly ok: true; readonly bundle: ModelBundle } | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * Creates a portable single-file container for every model reachable from the root.
 * Model boundaries, identifiers, versions, and imports remain unchanged.
 */
export function createModelBundle(rootModelId: Id, models: readonly Model[]): CreateBundleResult {
  const graphResult: ProjectValidationResult = new ModelValidator().validateProject(rootModelId, models);
  if (!graphResult.valid) return { ok: false, diagnostics: graphResult.diagnostics };
  const bundle: ModelBundle = {
    $schema: MODEL_BUNDLE_SCHEMA,
    kind: 'ModelBundle',
    version: MODEL_BUNDLE_VERSION,
    rootModelId: rootModelId,
    models: graphResult.graph.getModels().map((model: Model): Model => structuredClone(model)),
  };
  return { ok: true, bundle: bundle };
}

/**
 * Validates an unknown bundle value and restores its separate RAMEN models.
 *
 * @throws Error when the envelope, contained models, or project graph is invalid.
 */
export function splitModelBundle(input: unknown): readonly Model[] {
  return parseModelBundle(input).models;
}

/** Validates an unknown bundle and returns a detached, graph-ordered representation. */
export function parseModelBundle(input: unknown): ModelBundle {
  const bundle: ModelBundle = readBundleEnvelope(input);
  const result: ProjectValidationResult = new ModelValidator().validateModels(bundle.rootModelId, bundle.models);

  if (!result.valid) throw new Error(formatBundleErrors(result.diagnostics));
  return {
    ...bundle,
    models: result.graph.getModels().map((model: Model): Model => structuredClone(model)),
  };
}

function readBundleEnvelope(input: unknown): ModelBundle {
  const envelope: { readonly valid: boolean; readonly errors: JsonError[] } = BUNDLE_SCHEMA_NODE.validate(input);
  if (!envelope.valid) {
    const details: string = envelope.errors.map((error: JsonError): string => error.message).join('\n');

    throw new Error(`Invalid model bundle: ${details}`);
  }
  if (!isRecord(input) || typeof input.$schema !== 'string' || typeof input.kind !== 'string') {
    throw new Error('Invalid model bundle envelope.');
  }
  if (typeof input.version !== 'string' || typeof input.rootModelId !== 'string' || !Array.isArray(input.models)) {
    throw new Error('Invalid model bundle envelope.');
  }

  const models: Model[] = input.models.map((model: unknown, index: number): Model => readModel(model, index));
  return {
    $schema: MODEL_BUNDLE_SCHEMA,
    kind: 'ModelBundle',
    version: MODEL_BUNDLE_VERSION,
    rootModelId: input.rootModelId,
    models: models,
  };
}

function readModel(input: unknown, index: number): Model {
  try {
    ModelSchemaValidator.assertValid(input);

    return structuredClone(input);
  } catch (error: unknown) {
    const message: string = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid model bundle at models/${index}: ${message}`, { cause: error });
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function formatBundleErrors(diagnostics: readonly Diagnostic[]): string {
  const messages: string = diagnostics.map((diagnostic: Diagnostic): string => diagnostic.message).join('\n');
  return `Invalid model bundle:\n${messages}`;
}
