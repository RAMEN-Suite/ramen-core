import { GModel, GModelBundle, Id } from '../model/Types';
import { SchemaValidator } from '../validation/Schema';
import { Diagnostic } from '../validation/Diagnostics';
import { buildProjectGraph, ProjectGraphResult } from './Build';
import { compileSchema, JsonError, SchemaNode } from 'json-schema-library';
import bundleSchema from '../../resources/schemas/gcore-bundle.schema.json';

/** Canonical schema identifier of the supported model bundle envelope. */
export const MODEL_BUNDLE_SCHEMA: string = 'https://ramen-schema.org/gcore/1.0.0/bundle.json';
/** Version of the supported model bundle envelope. */
export const MODEL_BUNDLE_VERSION: string = '1.0.0';
const BUNDLE_SCHEMA_NODE: SchemaNode = compileSchema(bundleSchema);

/** Bundle creation result with graph diagnostics on failure. */
export type CreateBundleResult =
  { readonly ok: true; readonly bundle: GModelBundle } | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

/**
 * Creates a portable single-file container for every model reachable from the root.
 * Model boundaries, identifiers, versions, and imports remain unchanged.
 */
export function createModelBundle(rootModelId: Id, models: readonly GModel[]): CreateBundleResult {
  const graphResult: ProjectGraphResult = buildProjectGraph({ rootModelId: rootModelId, models: models });
  if (!graphResult.ok) return { ok: false, diagnostics: graphResult.diagnostics };
  const bundle: GModelBundle = {
    $schema: MODEL_BUNDLE_SCHEMA,
    kind: 'GModelBundle',
    version: MODEL_BUNDLE_VERSION,
    rootModelId: rootModelId,
    models: graphResult.graph.getModels().map((model: GModel): GModel => structuredClone(model)),
  };
  return { ok: true, bundle: bundle };
}

/**
 * Validates an unknown bundle value and restores its separate GCore models.
 *
 * @throws Error when the envelope, contained models, or project graph is invalid.
 */
export function splitModelBundle(input: unknown): readonly GModel[] {
  const bundle: GModelBundle = readBundle(input);
  const result: ProjectGraphResult = buildProjectGraph({ rootModelId: bundle.rootModelId, models: bundle.models });
  if (!result.ok) throw new Error(formatBundleErrors(result.diagnostics));
  return result.graph.getModels().map((model: GModel): GModel => structuredClone(model));
}

function readBundle(input: unknown): GModelBundle {
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
  const models: GModel[] = input.models.map((model: unknown, index: number): GModel => readModel(model, index));
  return {
    $schema: MODEL_BUNDLE_SCHEMA,
    kind: 'GModelBundle',
    version: MODEL_BUNDLE_VERSION,
    rootModelId: input.rootModelId,
    models: models,
  };
}

function readModel(input: unknown, index: number): GModel {
  try {
    SchemaValidator.assertValid(input);
    return input;
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
