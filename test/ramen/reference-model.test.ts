import assert from 'node:assert/strict';
import test from 'node:test';
import type { Diagnostic, Model, ModelHeader, Import, ProjectValidationResult } from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RAMEN_MODEL, RAMEN_VALIDATION_ERROR, RamenModel, type RamenFile } from '@ramen-suite/core/ramen';
import olderReference from '../fixtures/ramen-before-descriptions.model.json' with { type: 'json' };
import removedReference from '../fixtures/ramen-with-annotation-reference.model.json' with { type: 'json' };

function validateReference(reference: Model): ProjectValidationResult {
  const project: Model = RamenModel.create('Edition').getModel();
  project.imports = project.imports.map((entry: Import): Import => ({
    ...entry,
    version: reference.version,
    modelUri: reference.$id,
  }));
  return RamenModel.load(project, [reference]).validate();
}

void test('reference constants are frozen while projects receive independently editable copies', (): void => {
  assert.equal(Object.isFrozen(RAMEN_MODEL), true);
  assert.equal(Object.isFrozen(RAMEN_MODEL.classifiers), true);
  assert.equal(Reflect.set(RAMEN_MODEL, 'name', 'Changed'), false);
  assert.equal(Reflect.set(RAMEN_MODEL.classifiers[0] ?? {}, 'name', 'Changed'), false);
  assert.equal(Reflect.set(RAMEN_ELEMENT, 'ANNOTATION', 'Changed'), false);
  const copy: Model | undefined = RamenModel.create('Edition')
    .getModels()
    .find((model: Model): boolean => model.id === RAMEN_MODEL.id);
  assert.ok(copy);
  copy.name = 'Local copy';
  assert.equal(RAMEN_MODEL.name, 'RAMEN');
});

void test('older files using the current vocabulary retain their descriptions, identities and ordering', (): void => {
  const reference: Model = structuredClone(olderReference) as Model;
  reference.classifiers.reverse();
  reference.relations.reverse();
  assert.equal(validateReference(reference).valid, true);
  const project: RamenModel = RamenModel.load(RamenModel.create('Edition').getModel(), [reference]);
  const file: RamenFile = project.export();
  assert.deepEqual(RamenModel.import(file).export(), file);
  assert.equal(file.models.find((model: ModelHeader): boolean => model.id === RAMEN_MODEL.id)?.description, undefined);
});

function hasCode(reference: Model, code: string): boolean {
  return validateReference(reference).diagnostics.some((item: Diagnostic): boolean => item.code === code);
}

void test('references with changed vocabulary or unsupported versions are rejected explicitly', (): void => {
  const unsupported: Model = structuredClone(RAMEN_MODEL);
  unsupported.version = '9.9.9';
  assert.ok(hasCode(unsupported, RAMEN_VALIDATION_ERROR.BASE_MODEL_VERSION_UNSUPPORTED));

  const empty: Model = { ...structuredClone(RAMEN_MODEL), classifiers: [], relations: [] };
  assert.ok(hasCode(empty, RAMEN_VALIDATION_ERROR.BASE_MODEL_INVALID));
  assert.ok(hasCode(removedReference as Model, RAMEN_VALIDATION_ERROR.BASE_MODEL_INVALID));
});
