import { walkGraph } from './Traversal.js';
import { BuiltinDataTypes } from '../Builtins.js';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../validation/Diagnostics.js';
import { Classifier, Model, Node, Relation, Id, Import, Ref } from '../Types.js';
import { ModelElementIndex } from './ElementIndex.js';
import { ModelIdentifiers } from './Identifiers.js';
import { ModelRef } from './References.js';
import { ProjectGraph } from './ProjectGraph.js';
import { ValidationCode } from '../validation/Codes.js';

/** Root selection and available models used to build a project graph. */
export interface ProjectGraphInput {
  readonly rootModelId: Id;
  readonly models: readonly Model[];
}

/** Successful immutable graph or the diagnostics that prevented construction. */
export type ProjectGraphResult =
  | { readonly ok: true; readonly graph: ProjectGraph; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

interface ResolvedRef {
  readonly modelId: Id;
  readonly refId: Id;
}

interface GraphBuildState {
  readonly modelsById: Map<Id, Model>;
  readonly reachableModelIds: Set<Id>;
  readonly indexesByModelId: Map<Id, ModelElementIndex>;
  readonly diagnostics: Diagnostic[];
  readonly visibleModels: Map<Id, ReadonlySet<Id>>;
}

/**
 * Resolves every model reachable from a root model into an immutable project graph.
 *
 * The result contains diagnostics instead of a graph when imports, identifiers,
 * references, element kinds, or inheritance cannot be resolved deterministically.
 *
 * @param input - Root model identifier and all models available for resolution.
 * @returns A project graph on success, otherwise structured diagnostics.
 */
export function buildProjectGraph(input: ProjectGraphInput): ProjectGraphResult {
  const state: GraphBuildState = {
    modelsById: new Map<Id, Model>(),
    reachableModelIds: new Set<Id>(),
    indexesByModelId: new Map<Id, ModelElementIndex>(),
    diagnostics: [],
    visibleModels: new Map<Id, ReadonlySet<Id>>(),
  };

  registerModels(input.models, state);
  if (!state.modelsById.has(input.rootModelId)) {
    state.diagnostics.push(
      error('PROJECT_ROOT_NOT_FOUND', `Root model not found: '${input.rootModelId}'.`, DiagnosticPath.root()),
    );
  }
  if (state.diagnostics.length > 0) return { ok: false, diagnostics: state.diagnostics };

  resolveImports(input.rootModelId, state);
  buildElementIndexes(state);
  validateModelRefs(state);
  if (state.diagnostics.length === 0) validateInheritanceCycles(state);
  if (state.diagnostics.length > 0) return { ok: false, diagnostics: state.diagnostics };

  const reachableModels: Map<Id, Model> = new Map<Id, Model>();
  const reachableIndexes: Map<Id, ModelElementIndex> = new Map<Id, ModelElementIndex>();

  for (const modelId of state.reachableModelIds) {
    const model: Model | undefined = state.modelsById.get(modelId);
    const index: ModelElementIndex | undefined = state.indexesByModelId.get(modelId);

    if (model && index) {
      reachableModels.set(modelId, model);
      reachableIndexes.set(modelId, index);
    }
  }
  return { ok: true, graph: new ProjectGraph(input.rootModelId, reachableModels, reachableIndexes), diagnostics: [] };
}

function registerModels(models: readonly Model[], state: GraphBuildState): void {
  for (const model of models) {
    if (state.modelsById.has(model.id)) {
      state.diagnostics.push(error('DUPLICATE_MODEL_ID', `Duplicate model id: '${model.id}'.`, DiagnosticPath.root()));
      continue;
    }
    state.modelsById.set(model.id, deepFreeze(structuredClone(model)));
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nestedValue of Object.values(value)) deepFreeze(nestedValue);
  return Object.freeze(value);
}

function resolveImports(rootModelId: Id, state: GraphBuildState): void {
  const children: (id: Id) => readonly Id[] = (id: Id): readonly Id[] => {
    const model: Model | undefined = state.modelsById.get(id);
    if (!model) return [];
    state.reachableModelIds.add(id);
    return model.imports.flatMap((item: Import, index: number): Id[] => {
      const target: Id | undefined = resolveImportedModel(id, item, index, state);
      return target === undefined ? [] : [target];
    });
  };

  walkGraph([rootModelId], children, (cycle: readonly string[]): void => {
    state.diagnostics.push(error('IMPORT_CYCLE', `Import cycle: ${cycle.join(' -> ')}.`, DiagnosticPath.root()));
  });
}

function resolveImportedModel(
  ownerModelId: Id,
  modelImport: Import,
  importIndex: number,
  state: GraphBuildState,
): Id | undefined {
  const importPath: DiagnosticPath = DiagnosticPath.root()
    .property('models')
    .property(ownerModelId)
    .property('imports')
    .index(importIndex);
  const importedModel: Model | undefined = state.modelsById.get(modelImport.modelId);

  if (!importedModel) {
    state.diagnostics.push(error('IMPORTED_MODEL_NOT_FOUND', `Imported model not found: '${modelImport.modelId}'.`, importPath));

    return;
  }

  if (modelImport.modelUri !== importedModel.$id) {
    state.diagnostics.push(
      error(
        'IMPORTED_MODEL_URI_MISMATCH',
        `Import model URI '${modelImport.modelUri}' does not match '${importedModel.$id}'.`,
        importPath.property('modelUri'),
      ),
    );
  }

  if (modelImport.version !== importedModel.version) {
    state.diagnostics.push(
      error(
        'IMPORTED_VERSION_MISMATCH',
        `Import version '${modelImport.version}' does not match '${importedModel.version}'.`,
        importPath.property('version'),
      ),
    );
  }
  return modelImport.modelId;
}

function buildElementIndexes(state: GraphBuildState): void {
  for (const modelId of state.reachableModelIds) {
    const model: Model | undefined = state.modelsById.get(modelId);

    if (!model) continue;
    state.diagnostics.push(...new ModelIdentifiers(model).getDiagnostics());
    state.indexesByModelId.set(modelId, new ModelElementIndex(model));
  }
}

function validateModelRefs(state: GraphBuildState): void {
  for (const modelId of state.reachableModelIds) {
    const model: Model | undefined = state.modelsById.get(modelId);

    if (!model) continue;
    model.classifiers.forEach((classifier: Classifier, classifierIndex: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root()
        .property('models')
        .property(modelId)
        .property('classifiers')
        .index(classifierIndex);
      if (classifier.kind === 'Node') validateNodeModelRefs(modelId, classifier, path, state);
    });
    model.relations.forEach((relation: Relation, relationIndex: number): void => {
      const path: DiagnosticPath = DiagnosticPath.root()
        .property('models')
        .property(modelId)
        .property('relations')
        .index(relationIndex);

      relation.superTypes.forEach((ref: Ref, index: number): void =>
        validateModelRef(modelId, ref, 'relation', path.property('superTypes').index(index), state),
      );
      validateModelRef(modelId, relation.from.nodeId, 'node', path.property('from').property('nodeId'), state);
      validateModelRef(modelId, relation.to.nodeId, 'node', path.property('to').property('nodeId'), state);
    });
  }
}

function validateNodeModelRefs(modelId: Id, node: Node, path: DiagnosticPath, state: GraphBuildState): void {
  node.superTypes.forEach((ref: Ref, index: number): void =>
    validateModelRef(modelId, ref, 'node', path.property('superTypes').index(index), state),
  );
  node.attributes.forEach((attribute, index: number): void => {
    if (BuiltinDataTypes.isBuiltin(attribute.typeId)) return;
    validateModelRef(modelId, attribute.typeId, 'dataType', path.property('attributes').index(index).property('typeId'), state);
  });
}

type ExpectedElementKind = 'node' | 'dataType' | 'relation';

function validateModelRef(
  ownerModelId: Id,
  reference: Ref,
  expectedKind: ExpectedElementKind,
  path: DiagnosticPath,
  state: GraphBuildState,
): void {
  const target: ResolvedRef = ModelRef.isQualified(reference)
    ? ModelRef.splitQualified(reference)
    : { modelId: ownerModelId, refId: reference };

  if (!visibleModels(ownerModelId, state).has(target.modelId)) {
    state.diagnostics.push(
      error(
        'REFERENCE_MODEL_NOT_REACHABLE',
        `Reference target model '${target.modelId}' is not imported by '${ownerModelId}'.`,
        path,
        reference,
      ),
    );

    return;
  }
  const index: ModelElementIndex | undefined = state.indexesByModelId.get(target.modelId);
  if (!index) return;
  const foundKind: ExpectedElementKind | undefined = findElementKind(index, target.refId);
  if (!foundKind) {
    state.diagnostics.push(
      error('ELEMENT_REFERENCE_NOT_FOUND', `Referenced element not found: '${reference}'.`, path, reference),
    );
  } else if (foundKind !== expectedKind) {
    state.diagnostics.push(
      error(
        'ELEMENT_REFERENCE_KIND_MISMATCH',
        `Reference '${reference}' points to ${foundKind}; expected ${expectedKind}.`,
        path,
        reference,
      ),
    );
  }
}

function visibleModels(modelId: Id, state: GraphBuildState): ReadonlySet<Id> {
  const cached: ReadonlySet<Id> | undefined = state.visibleModels.get(modelId);
  if (cached) return cached;
  const visible: Set<Id> = new Set<Id>();
  const pending: Id[] = [modelId];

  for (const id of pending) {
    if (visible.has(id)) continue;
    visible.add(id);
    const model: Model | undefined = state.modelsById.get(id);
    for (const imported of model?.imports ?? []) pending.push(imported.modelId);
  }

  state.visibleModels.set(modelId, visible);
  return visible;
}

function validateInheritanceCycles(state: GraphBuildState): void {
  const edges: Map<string, readonly string[]> = new Map<string, readonly string[]>();
  for (const modelId of state.reachableModelIds) {
    const index: ModelElementIndex | undefined = state.indexesByModelId.get(modelId);
    if (!index) continue;
    addInheritanceEdges(edges, modelId, 'node', [...index.nodesById.values()]);
    addInheritanceEdges(edges, modelId, 'relation', [...index.relationsById.values()]);
  }

  walkGraph(
    [...edges.keys()],
    (key: string): readonly string[] => edges.get(key) ?? [],
    (cycle: readonly string[]): void => {
      state.diagnostics.push(error('INHERITANCE_CYCLE', `Inheritance cycle: ${cycle.join(' -> ')}.`, DiagnosticPath.root()));
    },
  );
}

function addInheritanceEdges(
  edges: Map<string, readonly string[]>,
  modelId: Id,
  kind: 'node' | 'relation',
  elements: readonly (Node | Relation)[],
): void {
  for (const element of elements) {
    const targets: string[] = element.superTypes.map((ref: Ref): string => {
      const target: ResolvedRef = ModelRef.isQualified(ref) ? ModelRef.splitQualified(ref) : { modelId, refId: ref };
      return `${kind}:${target.modelId}:${target.refId}`;
    });
    edges.set(`${kind}:${modelId}:${element.id}`, targets);
  }
}

function findElementKind(index: ModelElementIndex, elementId: Id): ExpectedElementKind | undefined {
  if (index.nodesById.has(elementId)) return 'node';
  if (index.dataTypesById.has(elementId)) return 'dataType';
  if (index.relationsById.has(elementId)) return 'relation';
  return undefined;
}

function error(code: ValidationCode, message: string, path: DiagnosticPath, ref?: string): Diagnostic {
  return Diagnostics.error({ code, message, path, ref });
}
