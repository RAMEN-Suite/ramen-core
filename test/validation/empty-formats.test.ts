import assert from 'node:assert/strict';
import test from 'node:test';
import { DataTypes, Modeller, VALIDATION_ERROR, type DataType, type Node, type ValidationResult } from '@ramen-suite/core/model';

void test('standard format constraints reject empty strings even on optional properties', (): void => {
  const model: Modeller = Modeller.create('Formats');
  const node: Node = model.createNode('Record').element;
  for (const format of ['uuid', 'date', 'date-time', 'email']) {
    const suffix: string = format.replace('-', '');
    const type: DataType = model.createDataType({
      name: `Format${suffix}`,
      baseType: DataTypes.String,
      constraints: [{ id: `formatConstraint${suffix}`, name: 'Format', language: 'format', expression: format }],
    }).element;
    const name: string = `value${suffix}`;
    model.createAttribute(node, { name, typeId: type.id, bounds: { lowerBound: 0, upperBound: 1 } });

    const result: ValidationResult = model.validateValue(type, '');
    assert.equal(result.hasErrors, true, format);
    assert.equal(result.diagnostics[0]?.code, VALIDATION_ERROR.CONSTRAINT_FORMAT_MISMATCH);
    assert.equal(model.validateAttributeValue(node, name, '').hasErrors, true);
    assert.equal(model.validateAttributeValue(node, name, undefined).hasErrors, false);
  }
});
