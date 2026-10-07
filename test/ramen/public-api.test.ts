import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_ELEMENT, RamenAdvisor, RamenModel } from '@ramen-suite/core/ramen';
import { ConstraintRegistry, DataTypes, Diagnostics } from '@ramen-suite/core/model';
import type {
  Attribute,
  Constraint,
  ConstraintContext,
  DataType,
  Diagnostic,
  Node,
  Relation,
  ValidationResult,
} from '@ramen-suite/core/model';
import type {
  AnnotationOptions,
  AnnotationSuggestion,
  PropertyOption,
  RamenAnnotation,
  RelationOption,
} from '@ramen-suite/core/ramen';

function renameAndRemoveType(edition: RamenModel, type: RamenAnnotation, text: Node): void {
  edition.updateAnnotation(type.id, { type: 'person' });
  assert.deepEqual(
    edition.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION).map((item: AnnotationSuggestion): string => item.type),
    ['person'],
  );

  edition.removeAnnotation(type.id);
  assert.deepEqual(edition.getAnnotations(), []);
  assert.deepEqual(edition.suggestAnnotationsForNode(text), []);
  assert.equal(edition.validate().valid, true);
}

void test('RAMEN annotation queries distinguish possible choices from a declared type', (): void => {
  const edition: RamenModel = RamenModel.create('Edition');
  const text: Node = edition.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  const carrier: Relation = edition.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
  const reference: Relation = edition.refersTo(RAMEN_ELEMENT.ANNOTATION, person).element;

  const before: AnnotationOptions | undefined = edition.suggestAnnotationOptions(RAMEN_ELEMENT.ANNOTATION);
  assert.ok(before);
  assert.ok(before.relations.some((item: RelationOption): boolean => item.targetName === 'Text'));
  assert.ok(before.relations.some((item: RelationOption): boolean => item.targetName === 'Person'));

  const type: RamenAnnotation = edition.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'persName',
    relations: [
      { relation: carrier, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
      { relation: reference, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } },
    ],
  }).element;

  const onAnnotation: readonly AnnotationSuggestion[] = edition.suggestAnnotations(RAMEN_ELEMENT.ANNOTATION);
  const onText: readonly AnnotationSuggestion[] = edition.suggestAnnotationsForNode(text, RAMEN_ELEMENT.ANNOTATION);
  const properties: readonly PropertyOption[] = edition.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'persName');
  const relations: readonly RelationOption[] = edition.getRelationsForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'persName');

  assert.deepEqual(
    onAnnotation.map((item: AnnotationSuggestion): string => item.type),
    ['persName'],
  );
  assert.deepEqual(
    onText.map((item: AnnotationSuggestion): string => item.type),
    ['persName'],
  );
  assert.ok(edition.getAdvisor() instanceof RamenAdvisor);
  assert.deepEqual(properties, []);
  assert.equal(relations.length, 2);

  renameAndRemoveType(edition, type, text);
});

void test('RAMEN can load a project and create a later level from its detached model', (): void => {
  const edition: RamenModel = RamenModel.create('Edition');
  const person: Node = edition.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  const loaded: RamenModel = RamenModel.load(edition.getModel());
  const later: RamenModel = RamenModel.createLevel(edition.getModel(), 'Research');
  const correspondent: Node = later.createNode({ name: 'Correspondent', refines: person }).element;

  assert.equal(loaded.getNode(person.id)?.name, 'Person');
  assert.equal(later.getNodeLineage(correspondent).length, 3);
  assert.equal(later.validate().valid, true);
});

void test('annotation input checks resolve inherited type-owned properties and selected node attributes', (): void => {
  const edition: RamenModel = RamenModel.create('Edition');
  const annotation: Node = edition.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const roleName: DataType = edition.createDataType({ name: 'RoleName', baseType: DataTypes.String }).element;
  edition.createLiteral(roleName.id, { name: 'Sender', literal: 'sender' });
  const label: Attribute = edition.createAttribute(annotation, { name: 'label', typeId: DataTypes.String }).element;
  const capitalised: Constraint = { id: 'capitalLabelRule1', name: 'Capitalised', language: 'regex', expression: '^[A-Z]' };
  edition.updateAttribute(annotation.id, label.id, { constraints: [capitalised] });
  edition.createAnnotation({
    node: annotation,
    type: 'role',
    properties: [
      { name: 'name', type: roleName, bounds: { lowerBound: 1, upperBound: 1 } },
      { attribute: label, bounds: { lowerBound: 1, upperBound: 1 } },
    ],
  });
  const next: RamenModel = edition.createNextLevel('Research');
  const refined: Node = next.createNode({ name: 'ResearchAnnotation', refines: annotation }).element;

  assert.equal(next.validateAnnotationValue(refined, 'role', 'name', 'sender').hasErrors, false);
  assert.equal(
    next.validateAnnotationValue(refined.id, 'role', 'name', 'other').diagnostics[0]?.code,
    'INSTANCE_PROPERTY_LITERAL_INVALID',
  );
  assert.equal(
    next.validateAnnotationValue(refined, 'role', 'name', undefined).diagnostics[0]?.code,
    'INSTANCE_PROPERTY_REQUIRED',
  );
  assert.equal(next.validateAnnotationValue(refined, 'role', 'name', 7).diagnostics[0]?.code, 'INSTANCE_PROPERTY_TYPE_INVALID');
  assert.equal(
    next.validateAnnotationValue(refined, 'role', 'label', 'lowercase').diagnostics[0]?.code,
    'CONSTRAINT_REGEX_MISMATCH',
  );
  assert.equal(next.validateAnnotationValue(refined, 'role', 'label', undefined).diagnostics[0]?.path, '/value');
  assert.throws((): ValidationResult => next.validateAnnotationValue(refined, 'missing', 'name', 'sender'), /not found/);
  assert.throws((): ValidationResult => next.validateAnnotationValue(refined, 'role', 'missing', 'sender'), /not allowed/);
  checkCommonInputs(next, refined);
});

function checkCommonInputs(model: RamenModel, node: Node): void {
  assert.equal(model.validateAnnotationValue(node, 'role', 'uuid', 'wrong').diagnostics[0]?.code, 'CONSTRAINT_FORMAT_MISMATCH');
  assert.equal(
    model.validateAnnotationValue(node, 'role', 'selector', 'wrong').diagnostics[0]?.code,
    'INSTANCE_PROPERTY_TYPE_INVALID',
  );
  assert.equal(
    model.validateAnnotationValue(node, 'role', 'selector', {}).diagnostics[0]?.code,
    'RAMEN_INSTANCE_SELECTOR_TYPE_REQUIRED',
  );
}

function checkRole(rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
  if (context.value === rule.expression) return [];
  return [Diagnostics.error({ code: 'ROLE_MISMATCH', message: 'Role is not permitted.', path: context.path })];
}

void test('annotation input checks use custom evaluators and report invalid model dependencies', (): void => {
  const edition: RamenModel = RamenModel.create('Edition');
  const annotation: Node = edition.createNode({ name: 'Annotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const roleName: DataType = edition.createDataType({ name: 'RoleName', baseType: DataTypes.String }).element;
  edition.createAnnotation({ node: annotation, type: 'role', properties: [{ name: 'name', type: roleName }] });

  const rule: Constraint = { id: 'customRoleRule01', name: 'Custom role', language: 'example:role', expression: 'sender' };
  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  registry.register({ language: rule.language, evaluate: checkRole });
  edition.updateDataType(roleName.id, { constraints: [rule] });

  assert.equal(edition.validateAnnotationValue(annotation, 'role', 'name', 'sender', registry).hasErrors, false);
  assert.equal(
    edition.validateAnnotationValue(annotation, 'role', 'name', 'other', registry).diagnostics[0]?.code,
    'ROLE_MISMATCH',
  );
  assert.equal(
    edition.validateAnnotationValue(annotation, 'role', 'name', 'sender').diagnostics[0]?.code,
    'CONSTRAINT_LANGUAGE_UNSUPPORTED',
  );
  edition.removeDataType(roleName.id);
  assert.equal(edition.validateAnnotationValue(annotation, 'role', 'name', 'sender').hasErrors, true);
});
