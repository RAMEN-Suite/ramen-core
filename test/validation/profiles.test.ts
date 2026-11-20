import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConstraintRegistry,
  DataTypes,
  Modeller,
  VALIDATION_ERROR,
  type Attribute,
  type AttributeValidationRule,
  type Constraint,
  type DataType,
  type Diagnostic,
  type InstanceValidationProfile,
  type ModelInstanceGraph,
  type Node,
  type Severity,
  type ValidationResult,
} from '@ramen-suite/core/model';
import { RamenValidationProfiles } from '@ramen-suite/core/ramen';

interface Archive {
  readonly model: Modeller;
  readonly document: Node;
  readonly date: Attribute;
  readonly constraint: Constraint;
  readonly profile: InstanceValidationProfile;
  readonly data: ModelInstanceGraph;
}

function archive(severity: Severity = 'error'): Archive {
  const model: Modeller = Modeller.create('Archive');
  const constraint: Constraint = { id: 'archiveDateRule01', name: 'Date', language: 'format', expression: 'date', severity };
  const dateType: DataType = model.createDataType({
    name: 'ArchiveDate',
    baseType: DataTypes.String,
    constraints: [constraint],
  }).element;
  const document: Node = model.createNode('Document').element;
  const date: Attribute = model.createAttribute(document, { name: 'issuedOn', typeId: dateType.id }).element;
  const profile: InstanceValidationProfile = {
    rules: [
      {
        attributeId: date.id,
        constraintId: constraint.id,
        code: VALIDATION_ERROR.CONSTRAINT_FORMAT_MISMATCH,
        accepts: (value: unknown): boolean => value === '14.07.1912',
      },
    ],
  };
  const data: ModelInstanceGraph = {
    nodes: [{ id: 'documentRecord01', typeId: document.id, properties: { issuedOn: '14.07.1912' } }],
    relations: [],
  };
  return { model, document, date, constraint, profile, data };
}

void test('custom profiles support historical dates in generic RMF models without losing diagnostic context', (): void => {
  const { model, profile, data }: Archive = archive();
  const before: string = JSON.stringify({ model: model.getModel(), data });
  const strict: ValidationResult = model.validateInstances(data);
  assert.equal(strict.hasErrors, true);
  assert.equal(strict.diagnostics.length, 1);

  const accepted: ValidationResult = model.validateInstances(data, { profile });
  assert.equal(accepted.hasErrors, false);
  assert.deepEqual(
    accepted.diagnostics,
    strict.diagnostics.map((item: Diagnostic): Diagnostic => ({ ...item, severity: 'warn' })),
  );
  assert.equal(JSON.stringify({ model: model.getModel(), data }), before);
  assert.equal(model.validateInstances(data).hasErrors, true);
});

void test('profile exceptions require matching attribute, constraint, diagnostic code and accepted value', (): void => {
  const { model, profile, data }: Archive = archive();
  const rule: AttributeValidationRule | undefined = profile.rules[0];
  assert.ok(rule);
  const unrelated: readonly AttributeValidationRule[] = [
    { ...rule, attributeId: 'anotherAttribute' },
    { ...rule, constraintId: 'anotherConstraint' },
    { ...rule, code: VALIDATION_ERROR.CONSTRAINT_JSON_SCHEMA_MISMATCH },
    { ...rule, accepts: (_value: unknown): boolean => false },
  ];
  for (const exception of unrelated) {
    const result: ValidationResult = model.validateInstances(data, { profile: { rules: [exception] } });
    assert.equal(result.hasErrors, true);
    assert.equal(result.diagnostics[0]?.severity, 'error');
  }
  assert.equal(model.validateInstances(data, { profile: { rules: [] } }).hasErrors, true);
});

void test('profiles do not relax another property sharing the same data type', (): void => {
  const { model, document, date, profile, data }: Archive = archive();
  model.createAttribute(document, { name: 'receivedOn', typeId: date.typeId });
  const first: ModelInstanceGraph['nodes'][number] | undefined = data.nodes[0];
  assert.ok(first);
  const input: ModelInstanceGraph = {
    ...data,
    nodes: [{ ...first, properties: { ...first.properties, receivedOn: '14.07.1912' } }],
  };
  const result: ValidationResult = model.validateInstances(input, { profile });
  assert.equal(result.hasErrors, true);
  assert.equal(
    result.diagnostics.find((item: Diagnostic): boolean => item.severity === 'error')?.path,
    '/nodes/0/properties/receivedOn',
  );
  assert.equal(result.diagnostics.filter((item: Diagnostic): boolean => item.severity === 'warn').length, 1);
});

void test('generic profiles work with custom registries, model exchange and inherited properties', (): void => {
  const { model, document, profile }: Archive = archive();
  const next: Modeller = model.createNextLevel('Edition');
  const letter: Node = next.createNode({ name: 'Letter', refines: document }).element;
  const restored: Modeller = Modeller.import(next.export());
  const data: ModelInstanceGraph = {
    nodes: [{ id: 'letterRecord0001', typeId: letter.id, properties: { issuedOn: '14.07.1912' } }],
    relations: [],
  };
  const constraints: ConstraintRegistry = ConstraintRegistry.createDefault();
  assert.equal(restored.validateInstances(data, { constraints }).hasErrors, true);
  assert.equal(restored.validateInstances(data, { profile, constraints }).hasErrors, false);
  assert.equal(restored.validateInstances(data).hasErrors, true);
});

void test('profiles can be composed without changing shared immutable RAMEN defaults', (): void => {
  const { model, profile, data }: Archive = archive();
  const preset: InstanceValidationProfile = RamenValidationProfiles.LEGACY_IDENTIFIERS;
  const combined: InstanceValidationProfile = { rules: [...preset.rules, ...profile.rules] };
  assert.equal(model.validateInstances(data, { profile: combined }).hasErrors, false);
  assert.equal(Object.isFrozen(preset), true);
  assert.equal(Object.isFrozen(preset.rules), true);
  assert.ok(preset.rules.length > 0);
  assert.ok(preset.rules.every((rule: AttributeValidationRule): boolean => Object.isFrozen(rule)));
});

void test('errors in a caller-provided acceptance predicate propagate instead of accepting invalid data', (): void => {
  const { model, profile, data }: Archive = archive();
  const rule: AttributeValidationRule | undefined = profile.rules[0];
  assert.ok(rule);
  const broken: InstanceValidationProfile = {
    rules: [
      {
        ...rule,
        accepts: (_value: unknown): boolean => {
          throw new Error('Invalid compatibility rule');
        },
      },
    ],
  };
  assert.throws((): ValidationResult => model.validateInstances(data, { profile: broken }), /Invalid compatibility rule/u);
  assert.equal(model.validateInstances(data).hasErrors, true);
});

void test('profiles preserve existing warnings and information without invoking acceptance predicates', (): void => {
  for (const severity of ['warn', 'info'] as const) {
    const { model, profile, data }: Archive = archive(severity);
    const rule: AttributeValidationRule | undefined = profile.rules[0];
    assert.ok(rule);
    const guarded: InstanceValidationProfile = {
      rules: [
        {
          ...rule,
          accepts: (_value: unknown): boolean => {
            throw new Error('Must not run');
          },
        },
      ],
    };
    const original: ValidationResult = model.validateInstances(data);
    assert.equal(original.hasErrors, false);
    assert.equal(original.diagnostics[0]?.severity, severity);
    assert.deepEqual(model.validateInstances(data, { profile: guarded }), original);
  }
});

void test('profiles also support project constraints unrelated to standard string formats', (): void => {
  const model: Modeller = Modeller.create('Archive');
  const constraint: Constraint = {
    id: 'shortCodeRule001',
    name: 'Length',
    language: 'json-schema',
    expression: { maxLength: 3 },
    code: 'ARCHIVE_CODE_LENGTH',
  };
  const code: DataType = model.createDataType({ name: 'Code', baseType: DataTypes.String, constraints: [constraint] }).element;
  const document: Node = model.createNode('Document').element;
  const attribute: Attribute = model.createAttribute(document, { name: 'code', typeId: code.id }).element;
  const profile: InstanceValidationProfile = {
    rules: [
      {
        attributeId: attribute.id,
        constraintId: constraint.id,
        code: 'ARCHIVE_CODE_LENGTH',
        accepts: (value: unknown): boolean => value === 'HISTORIC',
      },
    ],
  };
  const data: ModelInstanceGraph = {
    nodes: [{ id: 'documentRecord01', typeId: document.id, properties: { code: 'HISTORIC' } }],
    relations: [],
  };
  assert.equal(model.validateInstances(data).hasErrors, true);
  const result: ValidationResult = model.validateInstances(data, { profile });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics[0]?.code, 'ARCHIVE_CODE_LENGTH');
  assert.equal(result.diagnostics[0]?.severity, 'warn');
});

void test('custom property profiles apply consistently to one field and the complete graph', (): void => {
  const { model, document, profile }: Archive = archive();
  const constraints: ConstraintRegistry = ConstraintRegistry.createDefault();
  const result: ValidationResult = model.validateAttributeValue(document, 'issuedOn', '14.07.1912', { profile, constraints });
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics[0]?.severity, 'warn');
  assert.equal(result.diagnostics[0]?.path, '/value');
  assert.equal(model.validateAttributeValue(document, 'issuedOn', '14.07.1912').hasErrors, true);
});
