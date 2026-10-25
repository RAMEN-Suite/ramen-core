import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelNames, Modeller, type ModelChange, type Node, type Relation } from '@ramen-suite/core/model';

void test('normalised relation names satisfy the schema for Unicode, punctuation and empty input', (): void => {
  const model: Modeller = Modeller.create('Names');
  const node: Node = model.createNode('Item').element;
  const examples: readonly string[] = ['gehört zu', 'Straße', 'Édition liée', '关联', '123 links', '!!!', '', 'x'.repeat(80)];

  for (const input of examples) {
    const name: string = ModelNames.toScreamedName(input);
    assert.match(name, /^[A-Z][A-Z0-9_]{0,31}$/);
    const change: ModelChange<Relation> = model.createRelation({ name, from: { node }, to: { node } });
    assert.equal(change.validation.valid, true);
  }
  assert.equal(ModelNames.toScreamedName('gehört zu'), 'GEHORT_ZU');
  assert.equal(ModelNames.toScreamedName('Straße'), 'STRASSE');
});

void test('node and property name helpers preserve Unicode and enforce their documented bounds', (): void => {
  assert.equal(ModelNames.toPascalName('digital edition'), 'DigitalEdition');
  assert.equal(ModelNames.toPascalName('édition'), 'Édition');
  assert.equal(ModelNames.toPascalName('123'), 'N123');
  assert.equal(ModelNames.toPascalName(''), 'N');
  assert.equal(ModelNames.toPascalName('x'.repeat(80)).length, 40);
  assert.equal(ModelNames.toCamelName('Digital edition'), 'digitalEdition');
  assert.equal(ModelNames.toCamelName('Änderung'), 'änderung');
  assert.equal(ModelNames.toCamelName('123'), 'p123');
  assert.equal(ModelNames.toCamelName(''), 'p');
  assert.equal(ModelNames.toCamelName('x'.repeat(80)).length, 32);
});

void test('Unicode name boundaries retain complete characters and camel-case supplementary letters', (): void => {
  const pascal: string = ModelNames.toPascalName('x'.repeat(39) + '𐐀');
  const camel: string = ModelNames.toCamelName('x'.repeat(31) + '𐐀');
  assert.equal(pascal, 'X' + 'x'.repeat(38) + '𐐀');
  assert.equal(camel, 'x'.repeat(31) + '𐐀');
  assert.equal(Array.from(pascal).length, 40);
  assert.equal(Array.from(camel).length, 32);
  assert.equal(ModelNames.toCamelName('𐐀 name'), '𐐨Name');
});
