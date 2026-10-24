import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller, type DataType, type ValidationResult } from '@ramen-suite/core/model';

void test('URI constraints reject malformed input without normalising it into an acceptable URL', (): void => {
  const model: Modeller = Modeller.create('Links');
  const uri: DataType = model.createDataType({
    name: 'URI',
    baseType: DataTypes.String,
    constraints: [{ id: 'uriFormatRule001', name: 'Absolute URI', language: 'format', expression: 'uri' }],
  }).element;
  const valid: readonly string[] = [
    'https://example.org/a%20b',
    'https://example.org/%2F?q=a&b=c#part',
    'https://[::1]:8080/',
    'mailto:editor@example.org',
    'urn:isbn:9780000000000',
    'file:///tmp/source.txt',
  ];
  const invalid: readonly string[] = [
    'https://example.org/a b',
    ' https://example.org ',
    'https://example.org/%ZZ',
    'https://example.org/%',
    'https://example.org/\npath',
    'https://é.example/',
    '/relative',
    '',
    'https://',
    'https://[broken/',
  ];

  for (const value of valid) assert.equal(model.validateValue(uri, value).hasErrors, false, value);
  for (const value of invalid) {
    const result: ValidationResult = model.validateValue(uri, value);
    assert.equal(result.hasErrors, true, value);
    assert.equal(result.diagnostics[0]?.code, 'CONSTRAINT_FORMAT_MISMATCH');
  }
});
