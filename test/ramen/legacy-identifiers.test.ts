import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConstraintRegistry,
  type Diagnostic,
  type InstanceValidationProfile,
  VALIDATION_ERROR,
  type ModelInstanceGraph,
  type Node,
  type ValidationResult,
} from '@ramen-suite/core/model';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenValidationProfiles, RamenInstanceValidator, RamenModel } from '@ramen-suite/core/ramen';

const legacy: string = 'MAIN_ed_isx_tgn_r5b';
const uuid: string = '550e8400-e29b-41d4-a716-446655440000';
const warningCode: string = VALIDATION_ERROR.CONSTRAINT_FORMAT_MISMATCH;

interface Edition {
  readonly model: RamenModel;
  readonly letter: Node;
}

function edition(): Edition {
  const model: RamenModel = RamenModel.create('Edition');
  const letter: Node = model.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
  return { model, letter };
}

function data(
  letter: Node,
  properties: Readonly<Record<string, unknown>> = { uuid: legacy, label: 'Letter' },
): ModelInstanceGraph {
  return { nodes: [{ id: legacy, typeId: letter.id, properties }], relations: [] };
}

void test('legacy RAMEN identities require explicit opt-in and preserve model and recorded values', (): void => {
  const { model, letter }: Edition = edition();
  const input: ModelInstanceGraph = data(letter);
  const original: string = JSON.stringify({ model: model.getModel(), input });
  assert.equal(model.validateInstances(input).hasErrors, true);
  assert.equal(model.validateInstances(input, { profile: { rules: [] } }).hasErrors, true);

  const result: ValidationResult = model.validateInstances(input, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.code, warningCode);
  assert.equal(result.diagnostics[0]?.severity, 'warn');
  assert.equal(result.diagnostics[0]?.path, '/nodes/0/properties/uuid');
  assert.ok(result.diagnostics[0]?.ref);
  assert.equal(JSON.stringify({ model: model.getModel(), input }), original);
  assert.equal(model.validateInstances(input).hasErrors, true);
});

void test('valid UUIDs produce no compatibility warning and field validation is strict by default', (): void => {
  const { model, letter }: Edition = edition();
  const input: ModelInstanceGraph = data(letter, { uuid, label: 'Letter' });
  assert.deepEqual(model.validateInstances(input, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS }).diagnostics, []);
  assert.equal(model.validateAttributeValue(letter, 'uuid', legacy).hasErrors, true);
  assert.equal(model.validateValue(RAMEN_ELEMENT.UUID, legacy).hasErrors, true);
});

void test('missing, empty and non-string identities remain errors in compatibility mode', (): void => {
  const { model, letter }: Edition = edition();
  const invalid: readonly unknown[] = [undefined, '', null, 7, [], {}];
  for (const value of invalid) {
    const properties: Record<string, unknown> = { label: 'Letter' };
    if (value !== undefined) properties['uuid'] = value;
    const result: ValidationResult = model.validateInstances(data(letter, properties), {
      profile: RamenValidationProfiles.LEGACY_IDENTIFIERS,
    });
    assert.equal(result.hasErrors, true, JSON.stringify(value));
    assert.equal(
      result.diagnostics.some((item: Diagnostic): boolean => item.code === warningCode && item.severity === 'warn'),
      false,
    );
  }
});

void test('duplicate legacy identities are still checked as keys', (): void => {
  const { model, letter }: Edition = edition();
  const input: ModelInstanceGraph = data(letter);
  const first: ModelInstanceGraph['nodes'][number] | undefined = input.nodes[0];
  assert.ok(first);
  const duplicated: ModelInstanceGraph = { ...input, nodes: [...input.nodes, { ...first, id: 'secondLetterRecord' }] };
  const result: ValidationResult = model.validateInstances(duplicated, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(result.hasErrors, true);
  assert.equal(result.diagnostics.filter((item: Diagnostic): boolean => item.code === warningCode).length, 2);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_KEY_DUPLICATE'));
});

void test('other UUID, URI and DateTime properties remain strict in compatibility mode', (): void => {
  const { model, letter }: Edition = edition();
  model.createAttribute(letter, { name: 'externalId', typeId: RAMEN_ELEMENT.UUID });
  model.createAttribute(letter, { name: 'sourceUri', typeId: RAMEN_ELEMENT.URI });
  model.createAttribute(letter, { name: 'recordedAt', typeId: RAMEN_ELEMENT.DATE_TIME });
  const input: ModelInstanceGraph = data(letter, {
    uuid: legacy,
    label: 'Letter',
    externalId: legacy,
    sourceUri: '/relative',
    recordedAt: 'yesterday',
  });

  const result: ValidationResult = model.validateInstances(input, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  const errors: readonly Diagnostic[] = result.diagnostics.filter((item: Diagnostic): boolean => item.severity === 'error');
  assert.equal(result.hasErrors, true);
  assert.deepEqual(errors.map((item: Diagnostic): string | undefined => item.path).sort(), [
    '/nodes/0/properties/externalId',
    '/nodes/0/properties/recordedAt',
    '/nodes/0/properties/sourceUri',
  ]);
});

void test('additional project constraints on the identity are not relaxed', (): void => {
  const { model, letter }: Edition = edition();
  model.addConstraint(letter, {
    id: 'legacyPrefix0001',
    name: 'Prefix',
    language: 'json-schema',
    expression: { properties: { uuid: { pattern: '^OTHER_' } } },
    code: 'PROJECT_IDENTIFIER_PREFIX',
  });
  const result: ValidationResult = model.validateInstances(data(letter), { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(result.hasErrors, true);
  assert.ok(
    result.diagnostics.some(
      (item: Diagnostic): boolean => item.code === 'PROJECT_IDENTIFIER_PREFIX' && item.severity === 'error',
    ),
  );
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === warningCode));
});

void test('the lower-level validator and custom registry options remain supported', (): void => {
  const { model, letter }: Edition = edition();
  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  const input: ModelInstanceGraph = data(letter);
  assert.equal(model.validateInstances(input, { constraints: registry }).hasErrors, true);
  assert.equal(
    model.validateInstances(input, { constraints: registry, profile: RamenValidationProfiles.LEGACY_IDENTIFIERS }).hasErrors,
    false,
  );

  const validator: RamenInstanceValidator = RamenInstanceValidator.withConstraints(registry);
  const result: ValidationResult = validator.validate(model.getModel().id, [RAMEN_MODEL, model.getModel()], input, {
    profile: RamenValidationProfiles.LEGACY_IDENTIFIERS,
  });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics[0]?.code, warningCode);
});

void test('compatibility survives model exchange and an additional refinement level', (): void => {
  const { model, letter }: Edition = edition();
  const next: RamenModel = model.createNextLevel('Printed edition');
  const printed: Node = next.createNode({ name: 'PrintedLetter', refines: letter }).element;
  const restored: RamenModel = RamenModel.import(next.export());
  const input: ModelInstanceGraph = data(printed);

  assert.equal(restored.validateInstances(input).hasErrors, true);
  const result: ValidationResult = restored.validateInstances(input, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics[0]?.code, warningCode);
});

void test('shared Annotation identities use the same explicit compatibility policy', (): void => {
  const { model }: Edition = edition();
  model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' });
  const input: ModelInstanceGraph = {
    nodes: [
      { id: legacy, typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`, properties: { uuid: legacy, type: 'comment' } },
    ],
    relations: [],
  };

  assert.equal(model.validateInstances(input).hasErrors, true);
  const result: ValidationResult = model.validateInstances(input, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics[0]?.code, warningCode);
});

void test('unknown properties and malformed recorded identities remain errors', (): void => {
  const { model, letter }: Edition = edition();
  const unknown: ModelInstanceGraph = data(letter, { uuid: legacy, label: 'Letter', unknown: true });
  const result: ValidationResult = model.validateInstances(unknown, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(result.hasErrors, true);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_PROPERTY_UNKNOWN'));

  const malformed: unknown = {
    nodes: [{ id: 'short', typeId: letter.id, properties: { uuid: legacy, label: 'Letter' } }],
    relations: [],
  };
  const invalid: ValidationResult = model.validateInstances(malformed, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(invalid.hasErrors, true);
  assert.equal(invalid.diagnostics[0]?.code, 'INSTANCE_SCHEMA_INVALID');
});

void test('identifier compatibility does not bypass validation of the RAMEN reference', (): void => {
  const { model, letter }: Edition = edition();
  const invalid: RamenModel = RamenModel.load(model.getModel(), [{ ...RAMEN_MODEL, version: '0.0.0' }]);
  const result: ValidationResult = invalid.validateInstances(data(letter), {
    profile: RamenValidationProfiles.LEGACY_IDENTIFIERS,
  });
  assert.equal(result.hasErrors, true);
  assert.ok(result.diagnostics.some((item: Diagnostic): boolean => item.code === 'IMPORTED_VERSION_MISMATCH'));
  assert.equal(
    result.diagnostics.some((item: Diagnostic): boolean => item.code === warningCode),
    false,
  );
});

void test('legacy identifiers reject whitespace, controls and oversized values', (): void => {
  const { model, letter }: Edition = edition();
  const profile: InstanceValidationProfile = RamenValidationProfiles.LEGACY_IDENTIFIERS;
  const invalid: readonly string[] = [
    '   ',
    '\n',
    'old id',
    'old\nidentifier',
    'old\u0000id',
    'old\u200bid',
    'x'.repeat(257),
    'x'.repeat(10240),
  ];
  for (const value of invalid) {
    const result: ValidationResult = model.validateAttributeValue(letter, 'uuid', value, { profile });
    assert.equal(result.hasErrors, true, JSON.stringify(value));
    assert.equal(result.diagnostics[0]?.severity, 'error');
  }
  assert.equal(model.validateAttributeValue(letter, 'uuid', 'x'.repeat(256), { profile }).hasErrors, false);
});

void test('field editing can opt into the same legacy profile without changing strict defaults', (): void => {
  const { model, letter }: Edition = edition();
  const profile: InstanceValidationProfile = RamenValidationProfiles.LEGACY_IDENTIFIERS;
  const result: ValidationResult = model.validateAttributeValue(letter, 'uuid', legacy, { profile });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics[0]?.severity, 'warn');
  assert.equal(result.diagnostics[0]?.path, '/value');
  assert.equal(model.validateAttributeValue(letter, 'uuid', legacy).hasErrors, true);
  assert.equal(model.validateValue(RAMEN_ELEMENT.UUID, legacy).hasErrors, true);

  model.createAnnotationShape({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'comment' });
  const annotation: ValidationResult = model.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'comment', 'uuid', legacy, {
    profile,
  });
  assert.equal(annotation.hasErrors, false);
  assert.equal(annotation.diagnostics[0]?.severity, 'warn');
  assert.equal(model.validateAnnotationValue(RAMEN_ELEMENT.ANNOTATION, 'comment', 'uuid', legacy).hasErrors, true);
});

void test('legacy warnings retain each affected record and property path', (): void => {
  const { model, letter }: Edition = edition();
  const input: ModelInstanceGraph = {
    nodes: [
      { id: 'firstLetterRecord', typeId: letter.id, properties: { uuid: 'historicFirst', label: 'First' } },
      { id: 'secondLetterRecord', typeId: letter.id, properties: { uuid: 'historicSecond', label: 'Second' } },
    ],
    relations: [],
  };
  const result: ValidationResult = model.validateInstances(input, { profile: RamenValidationProfiles.LEGACY_IDENTIFIERS });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics.length, 2);
  assert.deepEqual(
    result.diagnostics.map((item: Diagnostic): string | undefined => item.path),
    ['/nodes/0/properties/uuid', '/nodes/1/properties/uuid'],
  );
});

void test('legacy identifiers reject unpaired surrogates, including those decoded from JSON', (): void => {
  const { model, letter }: Edition = edition();
  const profile: InstanceValidationProfile = RamenValidationProfiles.LEGACY_IDENTIFIERS;
  const decoded: unknown = JSON.parse('"ab\\ud800c"');
  assert.equal(typeof decoded, 'string');
  const malformed: readonly unknown[] = [decoded, 'ab\udc00c', '\ud800\ud800', '\udc00\ud800'];
  for (const value of malformed) {
    assert.equal(model.validateAttributeValue(letter, 'uuid', value, { profile }).hasErrors, true);
    const result: ValidationResult = model.validateInstances(data(letter, { uuid: value, label: 'Letter' }), { profile });
    assert.equal(result.hasErrors, true);
    assert.equal(result.diagnostics[0]?.severity, 'error');
  }
});

void test('legacy identifier limits count UTF-16 code units and retain well-formed surrogate pairs', (): void => {
  const { model, letter }: Edition = edition();
  const profile: InstanceValidationProfile = RamenValidationProfiles.LEGACY_IDENTIFIERS;
  const accepted: string = '\u{1F600}'.repeat(128);
  assert.equal(accepted.length, 256);
  const result: ValidationResult = model.validateAttributeValue(letter, 'uuid', accepted, { profile });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics[0]?.severity, 'warn');
  assert.equal(model.validateAttributeValue(letter, 'uuid', `${accepted}a`, { profile }).hasErrors, true);
});
