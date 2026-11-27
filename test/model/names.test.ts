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

void test('node and property names handle long separator runs without changing naming rules', (): void => {
  const separators: string = '^'.repeat(100_000);
  const input: string = `${separators}digital${separators}édition${separators}`;
  assert.equal(ModelNames.toPascalName(input), 'DigitalÉdition');
  assert.equal(ModelNames.toCamelName(input), 'digitalÉdition');
  assert.equal(ModelNames.toPascalName(separators), 'N');
  assert.equal(ModelNames.toCamelName(separators), 'p');
});

void test('word boundaries retain underscores and digits while removing repeated punctuation', (): void => {
  const cases: readonly (readonly [string, string, string])[] = [
    ['one---two', 'OneTwo', 'oneTwo'],
    ['one__two', 'One__two', 'one__two'],
    ['one--2two', 'One2two', 'one2two'],
    ['123--édition', 'N123Édition', 'p123Édition'],
    ['𐐨...name', '𐐀Name', '𐐨Name'],
  ];

  for (const [input, pascal, camel] of cases) {
    assert.equal(ModelNames.toPascalName(input), pascal);
    assert.equal(ModelNames.toCamelName(input), camel);
  }
});

void test('name helpers preserve canonical composition and combining marks', (): void => {
  assert.equal(ModelNames.toPascalName('e\u0301tat'), 'État');
  assert.equal(ModelNames.toCamelName('E\u0301tat'), 'état');
  assert.equal(ModelNames.toPascalName('q\u0301 type'), 'Q\u0301Type');
  assert.equal(ModelNames.foldClassifierName('Straße'), ModelNames.foldClassifierName('STRASSE'));
  assert.equal(ModelNames.foldClassifierName('ﬁle'), ModelNames.foldClassifierName('file'));
});

void test('classifier names allow at most two consecutive combining marks after NFC', (): void => {
  const boundary: string = 'A\u0301\u0301\u0301';
  const excessive: string = `${boundary}\u0301`;
  assert.equal(boundary.normalize('NFC'), 'Á\u0301\u0301');
  assert.equal(ModelNames.isClassifierName(boundary), true);
  assert.equal(ModelNames.isClassifierName(excessive), false);
  assert.equal(ModelNames.isClassifierName(`A${'\u0301'.repeat(5)}`), false);
  assert.equal(ModelNames.isClassifierName('A\u0302\u0301'), true);
  assert.equal(ModelNames.isClassifierName('a\u0306\u0301'), true);
  assert.equal(ModelNames.isClassifierName('Ma\u0304ori'), true);
});

void test('generated conventional names also respect the combining mark bound', (): void => {
  const input: string = `q${'\u0301'.repeat(5)} type`;
  const pascal: string = ModelNames.toPascalName(input);
  const camel: string = ModelNames.toCamelName(input);
  assert.equal(pascal, 'Q\u0301\u0301Type');
  assert.equal(camel, 'q\u0301\u0301Type');
  assert.equal(ModelNames.isClassifierName(pascal), true);
  assert.equal(ModelNames.isClassifierName(camel), true);
});

void test('classifier names explicitly exclude joining controls', (): void => {
  assert.equal(ModelNames.isClassifierName('می\u200cخواهم'), false);
  assert.equal(ModelNames.isClassifierName('क्\u200dष'), false);
});
