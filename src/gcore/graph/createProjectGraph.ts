import { BuiltinDataTypes } from '../model/BuiltinDataTypes';
import { Diagnostic, DiagnosticPath, Diagnostics } from '../validation/ValidationDiagnostic';
import { GClassifier, GModel, GNode, GRelation, Id, Import, Ref } from '../model/ModelTypes';
import { ModelElementIndex } from './ModelElementIndex';
import { ModelReference } from '../reference/ModelReference';
import { ProjectGraph } from './ProjectGraph';

export interface CreateProjectGraphInput {
  readonly rootModelId: Id;
  readonly models: readonly GModel[];
}

export type ProjectGraphResult =
  | { readonly ok: true; readonly graph: ProjectGraph; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

interface GraphBuildState {
  readonly modelsById: Map<Id, GModel>;
  readonly reachableModelIds: Set<Id>;
  readonly indexesByModelId: Map<Id, ModelElementIndex>;
  readonly diagnostics: Diagnostic[];
}

export function createProjectGraph(input: CreateProjectGraphInput): ProjectGraphResult {
  const state: GraphBuildState = {
    modelsById: new Map<Id, GModel>(),
    reachableModelIds: new Set<Id>(),
    indexesByModelId: new Map<Id, ModelElementIndex>(),
    diagnostics: [],
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
  validateModelReferences(state);
  if (state.diagnostics.length === 0) validateInheritanceCycles(state);
  if (state.diagnostics.length > 0) return { ok: false, diagnostics: state.diagnostics };

  const reachableModels = new Map<Id, GModel>();
  const reachableIndexes = new Map<Id, ModelElementIndex>();
  for (const modelId of state.reachableModelIds) {
    const model = state.modelsById.get(modelId);
    const index = state.indexesByModelId.get(modelId);
    if (model && index) {
      reachableModels.set(modelId, model);
      reachableIndexes.set(modelId, index);
    }
  }

  return { ok: true, graph: new ProjectGraph(input.rootModelId, reachableModels, reachableIndexes), diagnostics: [] };
}

function registerModels(models: readonly GModel[], state: GraphBuildState): void {
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

  const visit = (modelId: Id): void => {
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

    const model: GModel | undefined = state.modelsById.get(modelId);
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
  const importPath = DiagnosticPath.root().property('models').property(ownerModelId).property('imports').index(importIndex);
  const importedModel: GModel | undefined = state.modelsById.get(modelImport.modelId);
  if (!importedModel) {
    state.diagnostics.push(error('IMPORTED_MODEL_NOT_FOUND', `Imported model not found: '${modelImport.modelId}'.`, importPath));
    return;
  }
  if (modelImport.schemaId !== importedModel.$id) {
    state.diagnostics.push(
      error(
        'IMPORTED_SCHEMA_ID_MISMATCH',
        `Import schema '${modelImport.schemaId}' does not match '${importedModel.$id}'.`,
        importPath.property('schemaId'),
      ),
    );
  }
  visit(modelImport.modelId);
}

function buildElementIndexes(state: GraphBuildState): void {
  for (const modelId of state.reachableModelIds) {
    const model: GModel | undefined = state.modelsById.get(modelId);
    if (!model) continue;
    const seen: Set<Id> = new Set<Id>();

    for (const classifier of model.classifiers) registerElementId(model, classifier, seen, state);
    for (const relation of model.relations) registerElementId(model, relation, seen, state);
    state.indexesByModelId.set(modelId, new ModelElementIndex(model));
  }
}

function registerElementId(model: GModel, element: GClassifier | GRelation, seen: Set<Id>, state: GraphBuildState): void {
  if (seen.has(element.id)) {
    state.diagnostics.push(
      error(
        'DUPLICATE_ELEMENT_ID',
        `Duplicate element id '${element.id}' in model '${model.id}'.`,
        DiagnosticPath.root().property('models').property(model.id),
      ),
    );
  }
  seen.add(element.id);
}

function validateModelReferences(state: GraphBuildState): void {
  for (const modelId of state.reachableModelIds) {
    const model: GModel | undefined = state.modelsById.get(modelId);
    if (!model) continue;

    model.classifiers.forEach((classifier, classifierIndex) => {
      const path = DiagnosticPath.root().property('models').property(modelId).property('classifiers').index(classifierIndex);
      if (classifier.kind === 'GNode') validateNodeModelReferences(modelId, classifier, path, state);
    });

    model.relations.forEach((relation, relationIndex) => {
      const path = DiagnosticPath.root().property('models').property(modelId).property('relations').index(relationIndex);
      relation.superTypes.forEach((ref, index) =>
        validateModelReference(modelId, ref, 'relation', path.property('superTypes').index(index), state),
      );
      validateModelReference(modelId, relation.from.nodeId, 'node', path.property('from').property('nodeId'), state);
      validateModelReference(modelId, relation.to.nodeId, 'node', path.property('to').property('nodeId'), state);
    });
  }
}

function validateNodeModelReferences(modelId: Id, node: GNode, path: DiagnosticPath, state: GraphBuildState): void {
  node.superTypes.forEach((ref, index) =>
    validateModelReference(modelId, ref, 'node', path.property('superTypes').index(index), state),
  );
  node.attributes.forEach((attribute, index) => {
    if (BuiltinDataTypes.isBuiltin(attribute.typeId)) return;
    validateModelReference(
      modelId,
      attribute.typeId,
      'dataType',
      path.property('attributes').index(index).property('typeId'),
      state,
    );
  });
}

type ExpectedElementKind = 'node' | 'dataType' | 'relation';

function validateModelReference(
  ownerModelId: Id,
  reference: Ref,
  expectedKind: ExpectedElementKind,
  path: DiagnosticPath,
  state: GraphBuildState,
): void {
  const target = ModelReference.isQualified(reference)
    ? ModelReference.splitQualified(reference)
    : { modelId: ownerModelId, refId: reference };

  if (!state.reachableModelIds.has(target.modelId)) {
    state.diagnostics.push(
      error('REFERENCE_MODEL_NOT_REACHABLE', `Reference target model is not reachable: '${target.modelId}'.`, path, reference),
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

function validateInheritanceCycles(state: GraphBuildState): void {
  const completed: Set<string> = new Set<string>();
  const active: string[] = [];

  const visit = (kind: 'node' | 'relation', modelId: Id, elementId: Id): void => {
    const key: string = `${kind}:${modelId}:${elementId}`;
    if (completed.has(key)) return;
    const cycleStart: number = active.indexOf(key);
    if (cycleStart >= 0) {
      const cycle: string[] = [...active.slice(cycleStart), key];
      state.diagnostics.push(error('INHERITANCE_CYCLE', `Inheritance cycle: ${cycle.join(' -> ')}.`, DiagnosticPath.root()));
      return;
    }

    const element: GNode | GRelation | undefined = getInheritableElement(state, kind, modelId, elementId);
    if (!element) return;
    active.push(key);
    for (const superType of element.superTypes) {
      const target = ModelReference.isQualified(superType)
        ? ModelReference.splitQualified(superType)
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
): GNode | GRelation | undefined {
  const index: ModelElementIndex | undefined = state.indexesByModelId.get(modelId);
  return kind === 'node' ? index?.nodesById.get(elementId) : index?.relationsById.get(elementId);
}

function findElementKind(index: ModelElementIndex, elementId: Id): ExpectedElementKind | undefined {
  if (index.nodesById.has(elementId)) return 'node';
  if (index.dataTypesById.has(elementId)) return 'dataType';
  if (index.relationsById.has(elementId)) return 'relation';
  return undefined;
}

function error(code: string, message: string, path: DiagnosticPath, ref?: string): Diagnostic {
  return Diagnostics.error({ code, message, path, ref });
}
