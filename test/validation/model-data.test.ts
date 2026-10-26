import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConstraintRegistry,
  DataTypes,
  Diagnostics,
  Modeller,
  type Attribute,
  type BuiltinType,
  type Constraint,
  type ConstraintContext,
  type DataType,
  type Diagnostic,
  type ModelInstanceGraph,
  type Literal,
  type Node,
  type Relation,
  type ValidationResult,
} from '@ramen-suite/core/model';

void test('Float literals preserve fractions through export while Integer literals require whole numbers', (): void => {
  const model: Modeller = Modeller.create('Scores');
  const score: DataType = model.createDataType({ name: 'Score', baseType: DataTypes.Float }).element;
  const half: Literal = model.createLiteral(score.id, { name: 'Half', value: 0.5 }).element;
  const negative: Literal = model.createLiteral(score.id, { name: 'Negative', value: -1.25 }).element;

  assert.equal(model.validate().valid, true);
  assert.equal(model.validateValue(score, 0.5).hasErrors, false);
  assert.equal(model.validateValue(score, -1.25).hasErrors, false);
  assert.equal(model.validateValue(score, 0.75).diagnostics[0]?.code, 'INSTANCE_PROPERTY_LITERAL_INVALID');
  assert.equal(Modeller.import(model.export()).validateValue(score, 0.5).hasErrors, false);

  model.removeLiteral(score.id, negative.id);
  model.updateDataType(score.id, { baseType: DataTypes.Integer });
  assert.equal(model.validate().diagnostics[0]?.code, 'DATATYPE_LITERAL_TYPE_INVALID');
  model.updateLiteral(score.id, half.id, { value: 1 });
  assert.equal(model.validate().valid, true);
  assert.equal(model.validateValue(score, 1).hasErrors, false);
});

function checkLength(rule: Constraint, context: ConstraintContext): readonly Diagnostic[] {
  if (typeof context.value !== 'string') return [];
  if (context.value.length <= Number(rule.expression)) return [];

  return [Diagnostics.error({ code: 'TITLE_TOO_LONG', message: 'Title is too long.', path: context.path })];
}

void test('recorded values obey inherited properties, closed fields and custom rules', (): void => {
  const base: Modeller = Modeller.create('People');
  const person: Node = base.createNode('Person').element;
  const capitalised: Constraint = {
    id: 'capitalNameRule1',
    name: 'Capitalised name',
    language: 'regex',
    expression: '^[A-Z]',
  };

  base.createAttribute(person, {
    name: 'name',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
    constraints: [capitalised],
  });

  const next: Modeller = base.createNextLevel('Edition');
  const editor: Node = next.createNode({ name: 'Editor', refines: person }).element;

  const valid: ModelInstanceGraph = {
    nodes: [{ id: 'editorRecord0001', typeId: editor.id, properties: { name: 'Ada' } }],
    relations: [],
  };
  const invalid: ModelInstanceGraph = {
    nodes: [{ id: 'editorRecord0001', typeId: editor.id, properties: { name: 'ada', unknown: true } }],
    relations: [],
  };
  const findings: readonly string[] = next.validateInstances(invalid).diagnostics.map((item: Diagnostic): string => item.code);

  assert.equal(next.validateInstances(valid).hasErrors, false);
  assert.ok(findings.includes('INSTANCE_PROPERTY_UNKNOWN'));
  assert.ok(findings.includes('CONSTRAINT_REGEX_MISMATCH'));
});

void test('a same-level subtype accepts its parent relation and property rule', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const rule: Constraint = {
    id: 'titleLengthRule01',
    name: 'Title length',
    language: 'json-schema',
    expression: { minLength: 3 },
  };

  model.createAttribute(document, {
    name: 'title',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
    constraints: [rule],
  });

  const letter: Node = model.createNode({ name: 'Letter', refines: document }).element;
  const filedIn: Relation = model.createRelation({ name: 'FILED_IN', from: { node: document }, to: { node: folder } }).element;

  const records: ModelInstanceGraph = {
    nodes: [
      { id: 'letterRecord0001', typeId: letter.id, properties: { title: 'Hi' } },
      { id: 'folderRecord0001', typeId: folder.id, properties: {} },
    ],
    relations: [{ id: 'filingRecord0001', typeId: filedIn.id, fromId: 'letterRecord0001', toId: 'folderRecord0001' }],
  };
  const invalid: ValidationResult = model.validateInstances(records);
  const valid: ModelInstanceGraph = {
    ...records,
    nodes: [
      { id: 'letterRecord0001', typeId: letter.id, properties: { title: 'Hello' } },
      { id: 'folderRecord0001', typeId: folder.id, properties: {} },
    ],
  };

  assert.ok(invalid.diagnostics.some((item: Diagnostic): boolean => item.code === 'CONSTRAINT_JSON_SCHEMA_MISMATCH'));
  assert.equal(model.validateInstances(valid).hasErrors, false);
});

void test('attribute rules can be changed and removed through the owning attribute', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const capitalised: Constraint = {
    id: 'capitalTitleRule01',
    name: 'Capitalised title',
    language: 'regex',
    expression: '^[A-Z]',
  };
  const title: Attribute = model.createAttribute(document, {
    name: 'title',
    typeId: DataTypes.String,
    constraints: [capitalised],
  }).element;
  const data: ModelInstanceGraph = {
    nodes: [{ id: 'documentRecord001', typeId: document.id, properties: { title: 'Example' } }],
    relations: [],
  };

  assert.equal(model.validateInstances(data).hasErrors, false);
  model.updateAttribute(document.id, title.id, { constraints: [{ ...capitalised, expression: '^Draft' }] });
  assert.equal(model.validateInstances(data).diagnostics[0]?.code, 'CONSTRAINT_REGEX_MISMATCH');
  model.updateAttribute(document.id, title.id, { constraints: [] });
  assert.equal(model.validateInstances(data).hasErrors, false);
});

void test('one inherited attribute input checks required values and its own rule', (): void => {
  const base: Modeller = Modeller.create('Filing');
  const document: Node = base.createNode('Document').element;
  const capitalised: Constraint = {
    id: 'capitalTitleRule01',
    name: 'Capitalised title',
    language: 'regex',
    expression: '^[A-Z]',
  };

  base.createAttribute(document, {
    name: 'title',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
    constraints: [capitalised],
  });

  const website: Modeller = base.createNextLevel('Website');
  const page: Node = website.createNode({ name: 'Page', refines: document }).element;

  assert.equal(website.validateAttributeValue(page, 'title', 'Example').hasErrors, false);
  assert.equal(website.validateAttributeValue(page, 'title', 'example').diagnostics[0]?.code, 'CONSTRAINT_REGEX_MISMATCH');
  assert.equal(website.validateAttributeValue(page, 'title', undefined).diagnostics[0]?.code, 'INSTANCE_PROPERTY_REQUIRED');
  assert.equal(website.validateAttributeValue(page, 'title', 7).diagnostics[0]?.code, 'INSTANCE_PROPERTY_TYPE_INVALID');
  assert.throws((): ValidationResult => website.validateAttributeValue(page, 'missing', 'value'), /not found/);
});

void test('relation cardinality is checked on complete recorded graphs', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const folder: Node = model.createNode('Folder').element;
  const filedIn: Relation = model.createRelation({
    name: 'FILED_IN',
    from: { node: document },
    to: { node: folder, bounds: { lowerBound: 1, upperBound: 1 } },
  }).element;
  const records: ModelInstanceGraph = {
    nodes: [
      { id: 'documentRecord01', typeId: document.id, properties: {} },
      { id: 'folderRecord0001', typeId: folder.id, properties: {} },
    ],
    relations: [],
  };
  const missing: ValidationResult = model.validateInstances(records);
  const linked: ModelInstanceGraph = {
    ...records,
    relations: [{ id: 'filingRecord0001', typeId: filedIn.id, fromId: 'documentRecord01', toId: 'folderRecord0001' }],
  };

  assert.ok(
    missing.diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_CARDINALITY_INVALID'),
    JSON.stringify(missing.diagnostics),
  );
  assert.equal(model.validateInstances(linked).hasErrors, false);

  const recordedLink: ModelInstanceGraph['relations'][number] | undefined = linked.relations[0];
  assert.ok(recordedLink);
  const withProperties: unknown = { ...linked, relations: [{ ...recordedLink, properties: { note: 'outside the model' } }] };
  const invalidLink: ValidationResult = model.validateInstances(withProperties);

  assert.equal(invalidLink.diagnostics[0]?.code, 'INSTANCE_SCHEMA_INVALID');
});
void test('inherited relation counts include self-links and keep endpoint bounds independent', (): void => {
  const base: Modeller = Modeller.create('People');
  const person: Node = base.createNode('Person').element;
  const knows: Relation = base.createRelation({
    name: 'KNOWS',
    from: { node: person },
    to: { node: person, bounds: { lowerBound: 1, upperBound: 1 } },
  }).element;

  const model: Modeller = base.createNextLevel('Members');
  const member: Node = model.createNode({ name: 'Member', refines: person }).element;
  const selected: Relation = model.createRelation({
    refines: knows,
    from: { node: member },
    to: { node: member },
  }).element;
  const typeId: string = selected.id;
  const records: ModelInstanceGraph = {
    nodes: [
      { id: 'firstMember00001', typeId: member.id, properties: {} },
      { id: 'otherMember00001', typeId: member.id, properties: {} },
    ],
    relations: [
      { id: 'selfLink00000001', typeId, fromId: 'firstMember00001', toId: 'firstMember00001' },
      { id: 'otherLink0000001', typeId, fromId: 'otherMember00001', toId: 'firstMember00001' },
    ],
  };
  assert.equal(model.validateInstances(records).hasErrors, false);

  const additional: ModelInstanceGraph = {
    ...records,
    relations: [...records.relations, { id: 'extraLink0000001', typeId, fromId: 'firstMember00001', toId: 'otherMember00001' }],
  };
  const missing: ModelInstanceGraph = { ...records, relations: records.relations.slice(1) };

  for (const invalid of [additional, missing]) {
    const result: ValidationResult = model.validateInstances(invalid);
    assert.deepEqual(
      result.diagnostics.map((item: Diagnostic): string => item.code),
      ['INSTANCE_CARDINALITY_INVALID'],
    );
  }
});

void test('model validation rejects a second key along one inheritance chain', (): void => {
  const model: Modeller = Modeller.create('People');
  const person: Node = model.createNode('Person').element;
  const id: Attribute = model.createAttribute(person, {
    name: 'identifier',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
    isKey: true,
  }).element;
  const editor: Node = model.createNode({ name: 'Editor', refines: person }).element;
  const duplicate: Attribute = model.createAttribute(editor, {
    name: 'editorIdentifier',
    typeId: DataTypes.String,
    bounds: { lowerBound: 1, upperBound: 1 },
    isKey: true,
  }).element;

  assert.equal(id.isKey, true);
  assert.equal(duplicate.isKey, true);
  assert.ok(model.validateNode(editor).diagnostics.some((item: Diagnostic): boolean => item.code === 'ATTRIBUTE_MULTIPLE_KEYS'));
});

interface ObjectKeys {
  readonly model: Modeller;
  readonly personRef: string;
  readonly editor: Node;
}

function objectKeyModel(): ObjectKeys {
  const base: Modeller = Modeller.create('People');
  const person: Node = base.createNode('Person').element;
  const identifier: DataType = base.createDataType({ name: 'Identifier', baseType: DataTypes.Object }).element;

  base.createAttribute(person, {
    name: 'identifier',
    type: identifier,
    bounds: { lowerBound: 1, upperBound: 1 },
    isKey: true,
  });

  const edition: Modeller = base.createNextLevel('Edition');
  const editor: Node = edition.createNode({ name: 'Editor', refines: person }).element;
  return { model: edition, personRef: `${base.getModel().id}:${person.id}`, editor };
}

void test('Object keys compare JSON content across inherited records, independently of member order', (): void => {
  const fixture: ObjectKeys = objectKeyModel();
  const edition: Modeller = fixture.model;
  const editor: Node = fixture.editor;
  const records: ModelInstanceGraph = {
    nodes: [
      {
        id: 'personRecord0001',
        typeId: fixture.personRef,
        properties: { identifier: { source: 'archive', code: { parts: ['A', 'B'], number: 7 } } },
      },
      {
        id: 'editorRecord0001',
        typeId: editor.id,
        properties: { identifier: { code: { number: 7, parts: ['A', 'B'] }, source: 'archive' } },
      },
    ],
    relations: [],
  };
  const result: ValidationResult = edition.validateInstances(records);
  const duplicate: Diagnostic | undefined = result.diagnostics.find(
    (item: Diagnostic): boolean => item.code === 'INSTANCE_KEY_DUPLICATE',
  );

  assert.ok(duplicate);
  assert.deepEqual(
    { severity: duplicate.severity, path: duplicate.path, ref: duplicate.ref },
    { severity: 'error', path: '/nodes/1/properties/identifier', ref: 'editorRecord0001' },
  );

  const distinct: ModelInstanceGraph = {
    ...records,
    nodes: records.nodes.map((record: ModelInstanceGraph['nodes'][number]): ModelInstanceGraph['nodes'][number] =>
      record.typeId === editor.id
        ? { ...record, properties: { identifier: { source: 'archive', code: { parts: ['B', 'A'], number: 7 } } } }
        : record,
    ),
  };
  assert.equal(edition.validateInstances(distinct).hasErrors, false);
});

void test('built-in keys reject repeated values without sharing keys between unrelated node types', (): void => {
  const cases: readonly (readonly [BuiltinType, unknown])[] = [
    [DataTypes.String, 'same'],
    [DataTypes.Integer, 7],
    [DataTypes.Float, 1.5],
    [DataTypes.Boolean, true],
    [DataTypes.Object, { code: 'same' }],
  ];

  for (const [typeId, value] of cases) {
    const model: Modeller = Modeller.create('Keys');
    const first: Node = model.createNode('First').element;
    const second: Node = model.createNode('Second').element;

    model.createAttribute(first, { name: 'key', typeId, isKey: true, bounds: { lowerBound: 1, upperBound: 1 } });
    model.createAttribute(second, { name: 'key', typeId, isKey: true, bounds: { lowerBound: 1, upperBound: 1 } });

    const data: ModelInstanceGraph = {
      nodes: [
        { id: 'firstRecord00001', typeId: first.id, properties: { key: value } },
        { id: 'secondRecord0001', typeId: second.id, properties: { key: structuredClone(value) } },
      ],
      relations: [],
    };
    assert.equal(model.validateInstances(data).hasErrors, false, typeId);

    const repeated: ModelInstanceGraph = {
      ...data,
      nodes: [...data.nodes, { id: 'thirdRecord00001', typeId: first.id, properties: { key: structuredClone(value) } }],
    };
    assert.equal(model.validateInstances(repeated).diagnostics[0]?.code, 'INSTANCE_KEY_DUPLICATE', typeId);
  }
});

void test('an invalid recorded data shape is reported before semantic checks', (): void => {
  const model: Modeller = Modeller.create('People');
  model.createNode('Person');
  const invalid: unknown = { nodes: [{ id: 'record1', typeId: 'person1', properties: {}, createdAt: 'now' }], relations: [] };
  const result: ValidationResult = model.validateInstances(invalid);

  assert.equal(result.diagnostics[0]?.code, 'INSTANCE_SCHEMA_INVALID');
});

void test('an attribute can use a registered evaluator for input and recorded data', (): void => {
  const model: Modeller = Modeller.create('Filing');
  const document: Node = model.createNode('Document').element;
  const rule: Constraint = {
    id: 'titleLengthRule01',
    name: 'Maximum title length',
    language: 'example:max-length',
    expression: '8',
  };
  const capitalised: Constraint = {
    id: 'capitalTitleRule02',
    name: 'Capitalised title',
    language: 'regex',
    expression: '^[A-Z]',
  };

  model.createAttribute(document, {
    name: 'title',
    typeId: DataTypes.String,
    constraints: [capitalised, rule],
  });
  const registry: ConstraintRegistry = ConstraintRegistry.createDefault();
  registry.register({ language: rule.language, evaluate: checkLength });
  const invalid: ModelInstanceGraph = {
    nodes: [{ id: 'documentRecord01', typeId: document.id, properties: { title: 'Long title' } }],
    relations: [],
  };

  assert.equal(model.validateInstances(invalid, registry).diagnostics[0]?.code, 'TITLE_TOO_LONG');
  assert.equal(model.validateAttributeValue(document.id, 'title', 'Long title', registry).diagnostics[0]?.code, 'TITLE_TOO_LONG');
  assert.equal(model.validateAttributeValue(document, 'title', 'Short', registry).hasErrors, false);
  assert.deepEqual(
    model
      .validateAttributeValue(document.id, 'title', 'long title', registry)
      .diagnostics.map((item: Diagnostic): string => item.code),
    ['CONSTRAINT_REGEX_MISMATCH', 'TITLE_TOO_LONG'],
  );
  assert.deepEqual(
    model.validateAttributeValue(document.id, 'title', 7, registry).diagnostics.map((item: Diagnostic): string => item.code),
    ['INSTANCE_PROPERTY_TYPE_INVALID'],
  );
});

void test('one value checks its base type, literals and constraints without recorded objects', (): void => {
  const model: Modeller = Modeller.create('Events');
  const status: DataType = model.createDataType({
    name: 'Status',
    baseType: DataTypes.String,
    constraints: [{ id: 'startsWithDRule1', name: 'Starts with D', language: 'regex', expression: '^D' }],
  }).element;

  model.createLiteral(status.id, { name: 'Draft', literal: 'Draft' });

  assert.equal(model.validateValue(status, 'Draft').hasErrors, false);
  assert.equal(model.validateValue(status, 4).diagnostics[0]?.code, 'INSTANCE_PROPERTY_TYPE_INVALID');
  assert.equal(model.validateValue(status, 'Done').diagnostics[0]?.code, 'INSTANCE_PROPERTY_LITERAL_INVALID');
  assert.equal(model.validateValue(DataTypes.Integer, 4).hasErrors, false);
  assert.equal(model.validateValue(DataTypes.Integer, 4.5).diagnostics[0]?.code, 'INSTANCE_PROPERTY_TYPE_INVALID');

  model.updateDataType(status.id, {
    constraints: [{ id: 'startsWithPRule1', name: 'Starts with P', language: 'regex', expression: '^P' }],
  });
  assert.equal(model.validateValue(status, 'Draft').diagnostics[0]?.code, 'CONSTRAINT_REGEX_MISMATCH');
});

void test('a named date type validates stored strings through its format rule', (): void => {
  const model: Modeller = Modeller.create('Events');
  const event: Node = model.createNode('Event').element;
  const date: DataType = model.createDataType({
    name: 'EventDate',
    baseType: DataTypes.String,
    constraints: [{ id: 'eventDateRule001', name: 'Calendar date', language: 'format', expression: 'date' }],
  }).element;
  model.createAttribute(event, { name: 'date', type: date });
  const valid: ModelInstanceGraph = {
    nodes: [{ id: 'eventRecord00001', typeId: event.id, properties: { date: '2026-09-22' } }],
    relations: [],
  };
  const invalid: ModelInstanceGraph = {
    nodes: [{ id: 'eventRecord00001', typeId: event.id, properties: { date: '2026-02-30' } }],
    relations: [],
  };

  assert.equal(model.validateInstances(valid).hasErrors, false);
  assert.ok(
    model.validateInstances(invalid).diagnostics.some((item: Diagnostic): boolean => item.code === 'CONSTRAINT_FORMAT_MISMATCH'),
  );
});

void test('JSON Schema rules validate declared scalar types', (): void => {
  const model: Modeller = Modeller.create('People');
  const shortName: DataType = model.createDataType({
    name: 'ShortName',
    baseType: DataTypes.String,
    constraints: [
      { id: 'nameLengthRule01', name: 'Name length', language: 'json-schema', expression: { minLength: 2, maxLength: 8 } },
    ],
  }).element;
  const age: DataType = model.createDataType({
    name: 'Age',
    baseType: DataTypes.Integer,
    constraints: [{ id: 'adultAgeRule0001', name: 'Adult age', language: 'json-schema', expression: { minimum: 18 } }],
  }).element;
  const confirmed: DataType = model.createDataType({
    name: 'Confirmed',
    baseType: DataTypes.Boolean,
    constraints: [{ id: 'confirmedRule001', name: 'Confirmed', language: 'json-schema', expression: { const: true } }],
  }).element;
  const score: DataType = model.createDataType({
    name: 'Score',
    baseType: DataTypes.Float,
    constraints: [
      { id: 'scoreRangeRule01', name: 'Score range', language: 'json-schema', expression: { minimum: 0, maximum: 1 } },
    ],
  }).element;

  assert.equal(model.validateValue(shortName, 'Ada').hasErrors, false);
  assert.equal(model.validateValue(shortName, 'A').diagnostics[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.equal(model.validateValue(age, 17).diagnostics[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.equal(model.validateValue(age, 20).hasErrors, false);
  assert.equal(model.validateValue(confirmed, false).diagnostics[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  assert.equal(model.validateValue(confirmed, true).hasErrors, false);
  assert.equal(model.validateValue(score, 0.5).hasErrors, false);
  assert.equal(model.validateValue(score, 2).diagnostics[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
});

void test('JSON Schema rules validate nested Object values and attribute inputs', (): void => {
  const model: Modeller = Modeller.create('People');
  const person: Node = model.createNode('Person').element;
  const contact: DataType = model.createDataType({
    name: 'Contact',
    baseType: DataTypes.Object,
    constraints: [
      {
        id: 'contactRule00001',
        name: 'Contact details',
        language: 'json-schema',
        expression: {
          properties: { city: { type: 'string', minLength: 2 }, postcode: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
    ],
  }).element;

  model.createAttribute(person, { name: 'contact', type: contact });

  assert.equal(model.validateValue(contact, { city: 'London' }).hasErrors, false);
  assert.equal(model.validateValue(contact, { city: 'L', extra: true }).diagnostics.length, 2);
  assert.equal(model.validateAttributeValue(person, 'contact', { city: 'L' }).diagnostics[0]?.path, '/value/city');
  assert.equal(model.validateValue(contact, 'London').diagnostics[0]?.code, 'INSTANCE_PROPERTY_TYPE_INVALID');
});

void test('JSON Schema supports local references and reports invalid schemas', (): void => {
  const model: Modeller = Modeller.create('People');
  const person: Node = model.createNode('Person').element;
  const local: Constraint = {
    id: 'localCodeRule001',
    name: 'Local reference',
    language: 'json-schema',
    expression: { $ref: '#/$defs/code', $defs: { code: { pattern: '^[A-Z]{2}$' } } },
  };
  const invalid: Constraint = {
    id: 'invalidRule00001',
    name: 'Invalid schema',
    language: 'json-schema',
    expression: { type: 'bad' },
  };
  const code: Attribute = model.createAttribute(person, {
    name: 'code',
    typeId: DataTypes.String,
    constraints: [local],
  }).element;

  assert.equal(model.validateAttributeValue(person, 'code', 'AB').hasErrors, false);
  assert.equal(model.validateAttributeValue(person, 'code', 'abc').diagnostics[0]?.code, 'CONSTRAINT_JSON_SCHEMA_MISMATCH');
  model.updateAttribute(person.id, code.id, { constraints: [invalid] });
  assert.equal(model.validate().diagnostics[0]?.code, 'CONSTRAINT_EXPRESSION_INVALID');
  assert.equal(model.validateAttributeValue(person, 'code', 'AB').diagnostics[0]?.code, 'CONSTRAINT_EXPRESSION_INVALID');
});

void test('format stays an independent constraint language', (): void => {
  const model: Modeller = Modeller.create('People');
  const email: DataType = model.createDataType({
    name: 'Email',
    baseType: DataTypes.String,
    constraints: [{ id: 'emailSchemaRule1', name: 'Email hint', language: 'json-schema', expression: { format: 'email' } }],
  }).element;

  assert.equal(model.validateValue(email, 'not-an-email').hasErrors, false);
  model.updateDataType(email.id, {
    constraints: [{ id: 'emailFormatRule1', name: 'Valid email', language: 'format', expression: 'email' }],
  });
  assert.equal(model.validateValue(email, 'not-an-email').diagnostics[0]?.code, 'CONSTRAINT_FORMAT_MISMATCH');
});
