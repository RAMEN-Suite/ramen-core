import assert from 'node:assert/strict';
import test from 'node:test';
import { ConstraintRegistry, Diagnostics, ModelFactory, RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '../../dist/index.js';
import type {
  Attribute,
  Constraint,
  ConstraintContext,
  CreateModelInput,
  CreateRamenBundleResult,
  Diagnostic,
  ModelInstanceGraph,
  Node,
  RamenChange,
  RamenAnnotation,
  ValidationResult,
} from '../../dist/index.js';

const INPUT: CreateModelInput = {
  id: 'modelRulesProject1',
  uri: 'https://example.org/rules',
  name: 'Correspondence',
  version: '1.0.0',
};

function rule(): Constraint {
  return { id: 'modelRuleCheck001', name: 'Review model', language: 'review', scope: 'model', expression: {} };
}

function registry(seen: ConstraintContext[]): ConstraintRegistry {
  const languages: ConstraintRegistry = ConstraintRegistry.createDefault();
  languages.register({
    language: 'review',
    evaluate(constraint: Constraint, context: ConstraintContext): readonly Diagnostic[] {
      seen.push(context);
      return [
        Diagnostics.warn({ code: 'REVIEW_MODEL', message: 'Review this declaration.', path: context.path, ref: constraint.id }),
      ];
    },
  });
  return languages;
}

void test('RAMEN keeps registered languages for editing, suggestions, bundles and further model levels', (): void => {
  const languages: ConstraintRegistry = registry([]);
  const project: RamenModel = RamenModel.create(INPUT, languages);
  const letter: Node = project.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  project.updateNode(letter.id, { constraints: [rule()] });
  assert.equal(project.validate().valid, true);
  assert.doesNotThrow((): void => {
    project.suggestAttributes(letter.id);
  });
  const bundle: CreateRamenBundleResult = project.exportBundle();
  assert.equal(bundle.ok, true);
  if (!bundle.ok) throw new Error('Expected bundle.');
  const restored: RamenModel = RamenModel.importBundle(bundle.bundle, languages);
  assert.deepEqual(restored.getModels(), project.getModels());
  assert.deepEqual(project.compareTo(restored).changes, []);
  assert.equal(project.compareTo(restored).afterDiagnostics[0]?.code, 'REVIEW_MODEL');
  const next: RamenModel = restored.createNextLevel({
    ...INPUT,
    id: 'modelRulesLevel02',
    uri: 'https://example.org/rules/edition',
  });
  assert.equal(next.validate().valid, true);
  assert.throws((): void => {
    RamenModel.importBundle(bundle.bundle);
  }, /not registered/);
});

void test('type-owned property rules run on their declaration, and data rules still validate their values', (): void => {
  const seen: ConstraintContext[] = [];
  const project: RamenModel = RamenModel.create(INPUT, registry(seen));
  const property: Attribute = ModelFactory.createAttribute({
    name: 'label',
    typeId: 'String',
    bounds: { lowerBound: 1, upperBound: 1 },
  });
  property.constraints = [rule()];
  const change: RamenChange<RamenAnnotation> = project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    properties: [property],
  });
  assert.equal(change.validation.valid, true);
  assert.equal(change.validation.diagnostics[0]?.severity, 'warn');
  assert.equal(seen[0]?.ownerId, property.id);
  assert.equal(seen[0]?.path.toString(), `/models/${INPUT.id}/annotations/0/properties/0`);
  const data: ModelInstanceGraph = {
    modelId: INPUT.id,
    nodes: [
      {
        id: 'annotationData001',
        typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
        properties: { uuid: 'abac88bd-b3e3-418a-8afe-6ac14409b9a1', type: 'note', label: 'Hello' },
      },
    ],
    relations: [],
  };
  seen.length = 0;
  const result: ValidationResult = project.validateInstances(data);
  assert.equal(result.hasErrors, false, JSON.stringify(result.diagnostics));
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.scope, 'model');
});

void test('registering a missing language refreshes a previously invalid RAMEN model', (): void => {
  const languages: ConstraintRegistry = new ConstraintRegistry();
  const project: RamenModel = RamenModel.create(INPUT, languages);
  const letter: Node = project.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  project.updateNode(letter.id, { constraints: [rule()] });
  assert.equal(project.validate().valid, false);
  languages.register({
    language: 'review',
    evaluate(_rule: Constraint, _context: ConstraintContext): readonly Diagnostic[] {
      return [];
    },
  });
  assert.equal(project.validate().valid, true);
  assert.doesNotThrow((): void => {
    project.suggestAttributes(letter.id);
  });
});
