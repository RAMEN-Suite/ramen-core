import { BuiltinDataTypes } from '../Builtins';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../validation/Diagnostics';
import { Classifier, Constraint, Model, Node, Relation, Id, Import, Ref } from '../Types';
import { ModelElementIndex } from './ElementIndex';
import { ModelRef } from './References';
import { ProjectGraph } from './ProjectGraph';
import { ValidationCode } from '../validation/Codes';

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
  const completed: Set<Id> = new Set<Id>();
  const active: Id[] = [];
  const reportedCycles: Set<string> = new Set<string>();

  const visit: (modelId: Id) => void = (modelId: Id): void => {
    if (completed.has(modelId)) return;
    const cycleStart: number = active.indexOf(modelId);
    if (cycleStart >= 0) {
      const cycle: Id[] = [...active.slice(cycleStart), modelId];
      const key: string = cycle.join('>');

      if (!reportedCycles.has(key)) {
        reportedCycles.add(key);
        state.diagnostics.push(error('IMPORT_CYCLE', `Import cycle: ${cycle.join(' -> ')}.`, DiagnosticPath.root()));
      }

      return;
    }
    const model: Model | undefined = state.modelsById.get(modelId);
    if (!model) return;
    state.reachableModelIds.add(modelId);
    active.push(modelId);

    model.imports.forEach((modelImport, index) => {
      resolveImportedModel(modelId, modelImport, index, state, visit);
    });

    active.pop();
    completed.add(modelId);
  };
  visit(rootModelId);
}

function resolveImportedModel(
  ownerModelId: Id,
  modelImport: Import,
  importIndex: number,
  state: GraphBuildState,
  visit: (modelId: Id) => void,
): void {
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
  visit(modelImport.modelId);
}

function buildElementIndexes(state: GraphBuildState): void {
  for (const modelId of state.reachableModelIds) {
    const model: Model | undefined = state.modelsById.get(modelId);

    if (!model) continue;
    const seen: Set<Id> = new Set<Id>();
    const modelPath: DiagnosticPath = DiagnosticPath.root().property('models').property(model.id);

    model.classifiers.forEach((classifier: Classifier, index: number): void => {
      registerClassifierIds(model.id, classifier, modelPath.property('classifiers').index(index), seen, state);
    });
    model.relations.forEach((relation: Relation, index: number): void => {
      registerRelationIds(model.id, relation, modelPath.property('relations').index(index), seen, state);
    });
    state.indexesByModelId.set(modelId, new ModelElementIndex(model));
  }
}

function registerClassifierIds(
  modelId: Id,
  classifier: Classifier,
  path: DiagnosticPath,
  seen: Set<Id>,
  state: GraphBuildState,
): void {
  registerId(modelId, classifier.id, path.property('id'), seen, state);
  registerConstraintIds(modelId, classifier.constraints, path.property('constraints'), seen, state);
  if (classifier.kind === 'Node') {
    classifier.attributes.forEach((attribute, index: number): void => {
      const attributePath: DiagnosticPath = path.property('attributes').index(index);
      registerId(modelId, attribute.id, attributePath.property('id'), seen, state);
      registerConstraintIds(modelId, attribute.constraints, attributePath.property('constraints'), seen, state);
    });
  } else {
    classifier.literals?.forEach((literal, index: number): void => {
      const literalPath: DiagnosticPath = path.property('literals').index(index);
      registerId(modelId, literal.id, literalPath.property('id'), seen, state);
      registerConstraintIds(modelId, literal.constraints, literalPath.property('constraints'), seen, state);
    });
  }
}

function registerRelationIds(modelId: Id, relation: Relation, path: DiagnosticPath, seen: Set<Id>, state: GraphBuildState): void {
  registerId(modelId, relation.id, path.property('id'), seen, state);
  registerId(modelId, relation.from.id, path.property('from').property('id'), seen, state);
  registerId(modelId, relation.to.id, path.property('to').property('id'), seen, state);
  registerConstraintIds(modelId, relation.constraints, path.property('constraints'), seen, state);
  registerConstraintIds(modelId, relation.from.constraints, path.property('from').property('constraints'), seen, state);
  registerConstraintIds(modelId, relation.to.constraints, path.property('to').property('constraints'), seen, state);
}

function registerConstraintIds(
  modelId: Id,
  constraints: readonly Constraint[] | undefined,
  path: DiagnosticPath,
  seen: Set<Id>,
  state: GraphBuildState,
): void {
  constraints?.forEach((constraint: Constraint, index: number): void => {
    registerId(modelId, constraint.id, path.index(index).property('id'), seen, state);
  });
}

function registerId(modelId: Id, id: Id, path: DiagnosticPath, seen: Set<Id>, state: GraphBuildState): void {
  if (seen.has(id)) {
    state.diagnostics.push(error('DUPLICATE_ELEMENT_ID', `Duplicate element id '${id}' in model '${modelId}'.`, path));
  }
  seen.add(id);
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
  const completed: Set<string> = new Set<string>();
  const active: string[] = [];

  const visit: (kind: 'node' | 'relation', modelId: Id, elementId: Id) => void = (
    kind: 'node' | 'relation',
    modelId: Id,
    elementId: Id,
  ): void => {
    const key: string = `${kind}:${modelId}:${elementId}`;
    if (completed.has(key)) return;
    const cycleStart: number = active.indexOf(key);
    if (cycleStart >= 0) {
      const cycle: string[] = [...active.slice(cycleStart), key];

      state.diagnostics.push(error('INHERITANCE_CYCLE', `Inheritance cycle: ${cycle.join(' -> ')}.`, DiagnosticPath.root()));
      return;
    }
    const element: Node | Relation | undefined = getInheritableElement(state, kind, modelId, elementId);
    if (!element) return;
    active.push(key);
    for (const superType of element.superTypes) {
      const target: ResolvedRef = ModelRef.isQualified(superType)
        ? ModelRef.splitQualified(superType)
        : { modelId, refId: superType };

      visit(kind, target.modelId, target.refId);
    }
    active.pop();
    completed.add(key);
  };

  for (const modelId of state.reachableModelIds) {
    const index: ModelElementIndex | undefined = state.indexesByModelId.get(modelId);

    if (!index) continue;
    for (const nodeId of index.nodesById.keys()) visit('node', modelId, nodeId);
    for (const relationId of index.relationsById.keys()) visit('relation', modelId, relationId);
  }
}

function getInheritableElement(
  state: GraphBuildState,
  kind: 'node' | 'relation',
  modelId: Id,
  elementId: Id,
): Node | Relation | undefined {
  const index: ModelElementIndex | undefined = state.indexesByModelId.get(modelId);
  return kind === 'node' ? index?.nodesById.get(elementId) : index?.relationsById.get(elementId);
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
