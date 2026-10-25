import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller, type DataType, type ValidationResult } from '@ramen-suite/core/model';

const VALID_URIS: readonly string[] = [
  'https://example.org/a%20b',
  'https://example.org/%2F?q=a&b=c#part',
  'https://[::1]:8080/',
  'mailto:editor@example.org',
  'urn:isbn:9780000000000',
  'file:///tmp/source.txt',
  'example://[2001:db8::1]/resource',
  'https://example.org/%5Bentry%5D?q=%23value#part',
  'urn:example:a%5Bb%5D',
  'example:',
  'example://',
];
const INVALID_URIS: readonly string[] = [
  'https://example.org/a b',
  ' https://example.org ',
  'https://example.org/%ZZ',
  'https://example.org/%',
  'https://example.org/\npath',
  'https://é.example/',
  '/relative',
  '',
  'https://[broken/',
  'https://example.org/[entry]',
  'urn:example:a[b]',
  'https://example.org/?q=[entry]',
  'https://example.org/#first#second',
  'https://user[name]@example.org/',
  'https://user@example@host/',
  'https://example.org:port/',
  'https://example.org/\\path',
];

void test('URI constraints check RFC 3986 syntax without normalising input', (): void => {
  const model: Modeller = Modeller.create('Links');
  const uri: DataType = model.createDataType({
    name: 'URI',
    baseType: DataTypes.String,
    constraints: [{ id: 'uriFormatRule001', name: 'Absolute URI', language: 'format', expression: 'uri' }],
  }).element;

  for (const value of VALID_URIS) assert.equal(model.validateValue(uri, value).hasErrors, false, value);
  for (const value of INVALID_URIS) {
    const result: ValidationResult = model.validateValue(uri, value);
    assert.equal(result.hasErrors, true, value);
    assert.equal(result.diagnostics[0]?.code, 'CONSTRAINT_FORMAT_MISMATCH');
  }
});

void test('URI assertions stay separate from JSON Schema format annotations', (): void => {
  const model: Modeller = Modeller.create('Links');
  const annotation: DataType = model.createDataType({
    name: 'DocumentedURI',
    baseType: DataTypes.String,
    constraints: [{ id: 'uriAnnotation001', name: 'URI annotation', language: 'json-schema', expression: { format: 'uri' } }],
  }).element;
  assert.equal(model.validateValue(annotation, 'not a URI').hasErrors, false);
});

void test('URI failures preserve a rule’s custom diagnostic and warning severity', (): void => {
  const model: Modeller = Modeller.create('Links');
  const uri: DataType = model.createDataType({
    name: 'URI',
    baseType: DataTypes.String,
    constraints: [
      {
        id: 'uriWarning000001',
        name: 'URI warning',
        language: 'format',
        expression: 'uri',
        code: 'INVALID_LINK',
        message: 'Use an absolute URI.',
        severity: 'warn',
      },
    ],
  }).element;
  const result: ValidationResult = model.validateValue(uri, 'not a URI');
  assert.equal(result.hasErrors, false);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0]?.severity, 'warn');
  assert.equal(result.diagnostics[0]?.code, 'INVALID_LINK');
  assert.equal(result.diagnostics[0]?.message, 'Use an absolute URI.');
});

void test('unsupported IP versions produce a diagnostic instead of escaping value validation', (): void => {
  const model: Modeller = Modeller.create('Links');
  const uri: DataType = model.createDataType({
    name: 'URI',
    baseType: DataTypes.String,
    constraints: [{ id: 'uriFormatRule001', name: 'Absolute URI', language: 'format', expression: 'uri' }],
  }).element;
  const result: ValidationResult = model.validateValue(uri, 'example://[v1.fe80]/resource');
  assert.equal(result.hasErrors, true);
  assert.equal(result.diagnostics[0]?.code, 'CONSTRAINT_EVALUATION_FAILED');
});
