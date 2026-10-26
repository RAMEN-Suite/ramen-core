import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DataTypes,
  Modeller,
  ModelRef,
  type Attribute,
  type AttributeInfo,
  type Constraint,
  type DataType,
  type Diagnostic,
  type EvolutionChange,
  type EvolutionReport,
  type Model,
  type ModelChange,
  type ModelInstanceGraph,
  type ModelInstanceNode,
  type Node,
  type NodeLineageItem,
  type NodeRemovalPreview,
  type Relation,
  type ValidationResult,
  type WorkspaceElement,
} from '@ramen-suite/core/model';

// Adapted from the Book / Writer / SchoolBook example in the official EMF overview:
// https://help.eclipse.org/latest/topic/org.eclipse.emf.doc/references/overview/EMF.html
interface Library {
  readonly model: Modeller;
  readonly book: Node;
  readonly writer: Node;
  readonly schoolBook: Node;
  readonly subject: DataType;
  readonly subjectProperty: Attribute;
  readonly authoredBy: Relation;
}

const positivePages: Constraint = {
  id: 'positivePages001',
  name: 'Positive page count',
  language: 'json-schema',
  expression: { minimum: 1 },
};

function createLibrary(): Library {
  const model: Modeller = Modeller.create('Library');
  const book: Node = model.createNode('Book').element;
  const writer: Node = model.createNode('Writer').element;
  const schoolBook: Node = model.createNode({ name: 'SchoolBook', refines: book }).element;
  const subject: DataType = model.createDataType({ name: 'Subject', baseType: DataTypes.String }).element;

  model.createLiteral(subject.id, { name: 'History', literal: 'history' });
  model.createLiteral(subject.id, { name: 'Science', literal: 'science' });
  model.createAttribute(book, { name: 'title', typeId: DataTypes.String, bounds: { lowerBound: 1, upperBound: 1 } });
  model.createAttribute(book, { name: 'pages', typeId: DataTypes.Integer, constraints: [positivePages] });
  model.createAttribute(writer, { name: 'name', typeId: DataTypes.String, bounds: { lowerBound: 1, upperBound: 1 } });
  const subjectProperty: Attribute = model.createAttribute(schoolBook, { name: 'subject', type: subject }).element;
  const authoredBy: Relation = model.createRelation({
    name: 'AUTHORED_BY',
    from: { node: book },
    to: { node: writer, bounds: { lowerBound: 1, upperBound: 1 } },
  }).element;

  return { model, book, writer, schoolBook, subject, subjectProperty, authoredBy };
}

void test('MDE library pass 1: specialise Book within and across levels while reusing Writer and Subject', (): void => {
  const library: Library = createLibrary();
  const course: Modeller = library.model.createNextLevel('Course library');
  const textbook: Node = course.createNode({ name: 'Textbook', refines: library.schoolBook }).element;

  assert.deepEqual(
    course.getNodeLineage(textbook).map((item: NodeLineageItem): string => item.name),
    ['Book', 'SchoolBook', 'Textbook'],
  );
  assert.deepEqual(
    course.getAttributes(textbook).map((item: AttributeInfo): string => item.name),
    ['title', 'pages', 'subject'],
  );

  assert.equal(course.getDataType(library.subject.id)?.id, library.subject.id);
  assert.equal(course.validateAttributeValue(textbook, 'subject', 'science').hasErrors, false);
  assert.equal(course.validateAttributeValue(textbook, 'subject', 'fiction').hasErrors, true);

  assert.equal(course.suggestRelations(textbook, library.writer).length, 1);
  assert.deepEqual(course.getRelations(textbook, library.writer), []);

  course.createRelation({ from: { node: textbook }, to: { node: library.writer } });
  const shadow: Attribute = course.createAttribute(textbook, { name: 'title', typeId: DataTypes.Integer }).element;
  assert.equal(course.validate().valid, false);
  assert.equal(course.validate().diagnostics[0]?.code, 'ATTRIBUTE_NAME_SHADOWS_SUPERTYPE');

  course.removeAttribute(textbook.id, shadow.id);
  assert.equal(course.validate().valid, true);
  assert.equal(course.getRelations(textbook, library.writer).length, 1);
  assert.equal(library.model.getNode(library.writer.id)?.name, 'Writer');
});

void test('MDE library pass 2: repair a deleted value type without changing the snapshot', (): void => {
  const library: Library = createLibrary();
  const course: Modeller = library.model.createNextLevel('Course library');
  const textbook: Node = course.createNode({ name: 'Textbook', refines: library.schoolBook }).element;
  const before: Modeller = course.snapshot();

  library.model.removeDataType(library.subject.id);
  assert.equal(course.validate().valid, false);
  assert.ok(course.validate().diagnostics.some((item: Diagnostic): boolean => item.code === 'ELEMENT_REFERENCE_NOT_FOUND'));
  assert.throws((): unknown => course.export(), /invalid/i);

  library.model.updateAttribute(library.schoolBook.id, library.subjectProperty.id, { typeId: DataTypes.String });
  const report: EvolutionReport = before.compareTo(course);
  const removedType: EvolutionChange | undefined = report.changes.find(
    (change: EvolutionChange): boolean => change.element === 'dataType' && change.action === 'removed',
  );

  assert.ok(removedType);
  assert.ok(
    report.changes.some((change: EvolutionChange): boolean => change.element === 'attribute' && change.action === 'changed'),
  );
  assert.deepEqual(report.beforeDiagnostics, []);
  assert.deepEqual(report.afterDiagnostics, []);

  assert.equal(course.validateAttributeValue(textbook, 'subject', 'fiction').hasErrors, false);
  assert.equal(before.validateAttributeValue(textbook, 'subject', 'fiction').hasErrors, true);
});

void test('MDE library pass 2: preview dependent deletion, reject it, then remove the complete branch', (): void => {
  const library: Library = createLibrary();
  const course: Modeller = library.model.createNextLevel('Course library');
  const textbook: Node = course.createNode({ name: 'Textbook', refines: library.schoolBook }).element;
  course.createRelation({ from: { node: textbook }, to: { node: library.writer } });

  const before: readonly Model[] = course.getModels();
  const preview: NodeRemovalPreview = library.model.previewNodeRemoval(library.book.id);

  assert.deepEqual(
    preview.nodes.map((item: WorkspaceElement): string => item.elementId),
    [library.book.id, library.schoolBook.id, textbook.id],
  );
  assert.equal(preview.relations.length, 2);
  assert.throws((): ModelChange<Node> => library.model.removeNode(library.book.id), /still used by/);
  assert.deepEqual(course.getModels(), before);

  library.model.removeNode(library.book.id, { cascade: true });
  assert.equal(library.model.validate().valid, true);
  assert.equal(course.validate().valid, true);

  assert.equal(library.model.getNode(library.writer.id)?.name, 'Writer');
  assert.equal(library.model.getDataType(library.subject.id)?.name, 'Subject');

  assert.deepEqual(course.getModel().classifiers, []);
  assert.deepEqual(course.getModel().relations, []);
});

function recordTextbook(library: Library, textbook: Node, authorship: Relation): ModelInstanceGraph {
  return {
    nodes: [
      { id: 'bookRecord000001', typeId: textbook.id, properties: { title: 'Science', pages: 120, subject: 'science' } },
      {
        id: 'writerRecord0001',
        typeId: ModelRef.qualify(library.model.getModel().id, library.writer.id),
        properties: { name: 'Ada' },
      },
    ],
    relations: [{ id: 'authorship000001', typeId: authorship.id, fromId: 'bookRecord000001', toId: 'writerRecord0001' }],
  };
}

void test('MDE library pass 3: inherited value rules survive a JSON export and import', (): void => {
  const library: Library = createLibrary();
  const course: Modeller = library.model.createNextLevel('Course library');
  const textbook: Node = course.createNode({ name: 'Textbook', refines: library.schoolBook }).element;
  const authorship: Relation = course.createRelation({ from: { node: textbook }, to: { node: library.writer } }).element;

  const data: ModelInstanceGraph = recordTextbook(library, textbook, authorship);
  const parsed: unknown = JSON.parse(JSON.stringify(course.export()));
  const restored: Modeller = Modeller.import(parsed);

  assert.equal(course.validateInstances(data).hasErrors, false);
  assert.equal(restored.validateInstances(data).hasErrors, false);
  const cases: readonly (readonly [Readonly<Record<string, unknown>>, string, string])[] = [
    [{ pages: 120, subject: 'science' }, 'INSTANCE_PROPERTY_REQUIRED', 'title'],
    [{ title: 'Science', pages: 0 }, 'CONSTRAINT_JSON_SCHEMA_MISMATCH', 'pages'],
    [{ title: 'Science', pages: 1.5 }, 'INSTANCE_PROPERTY_TYPE_INVALID', 'pages'],
    [{ title: 'Science', subject: 'fiction' }, 'INSTANCE_PROPERTY_LITERAL_INVALID', 'subject'],
  ];

  for (const [properties, code, property] of cases) {
    const nodes: readonly ModelInstanceNode[] = data.nodes.map((node: ModelInstanceNode, index: number): ModelInstanceNode =>
      index === 0 ? { ...node, properties } : node,
    );
    const invalid: ModelInstanceGraph = { ...data, nodes };
    const checked: ValidationResult = course.validateInstances(invalid);
    const finding: Diagnostic | undefined = checked.diagnostics.find((item: Diagnostic): boolean => item.code === code);

    assert.ok(finding, JSON.stringify(checked.diagnostics));
    assert.equal(finding.severity, 'error');
    assert.equal(finding.path, `/nodes/0/properties/${property}`);
    assert.deepEqual(restored.validateInstances(invalid).diagnostics, checked.diagnostics);
  }
});

void test('MDE library pass 3: required authorship checks counts and endpoint types after import', (): void => {
  const library: Library = createLibrary();
  const course: Modeller = library.model.createNextLevel('Course library');
  const textbook: Node = course.createNode({ name: 'Textbook', refines: library.schoolBook }).element;
  const authorship: Relation = course.createRelation({ from: { node: textbook }, to: { node: library.writer } }).element;

  const data: ModelInstanceGraph = recordTextbook(library, textbook, authorship);
  const restored: Modeller = Modeller.import(course.export());

  const missing: ModelInstanceGraph = { ...data, relations: [] };
  const invalid: ModelInstanceGraph = {
    ...data,
    relations: [{ id: 'authorship000001', typeId: authorship.id, fromId: 'bookRecord000001', toId: 'bookRecord000001' }],
  };

  const missingAuthor: Diagnostic | undefined = restored
    .validateInstances(missing)
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'INSTANCE_CARDINALITY_INVALID');
  const wrongAuthor: Diagnostic | undefined = restored
    .validateInstances(invalid)
    .diagnostics.find((item: Diagnostic): boolean => item.code === 'INSTANCE_RELATION_END_TYPE_INVALID');

  assert.equal(missingAuthor?.path, '/relations');
  assert.equal(missingAuthor?.severity, 'error');
  assert.equal(missingAuthor?.ref, authorship.id);

  assert.equal(wrongAuthor?.path, '/relations/0/toId');
  assert.equal(wrongAuthor?.severity, 'error');

  assert.deepEqual(restored.validateInstances(missing).diagnostics, course.validateInstances(missing).diagnostics);
  assert.deepEqual(restored.validateInstances(invalid).diagnostics, course.validateInstances(invalid).diagnostics);
});

void test('MDE library pass 3: the inherited upper bound rejects two distinct authors', (): void => {
  const library: Library = createLibrary();
  const course: Modeller = library.model.createNextLevel('Course library');
  const textbook: Node = course.createNode({ name: 'Textbook', refines: library.schoolBook }).element;
  const authorship: Relation = course.createRelation({ from: { node: textbook }, to: { node: library.writer } }).element;

  const data: ModelInstanceGraph = recordTextbook(library, textbook, authorship);
  const writerType: string = ModelRef.qualify(library.model.getModel().id, library.writer.id);
  const twoAuthors: ModelInstanceGraph = {
    nodes: [...data.nodes, { id: 'writerRecord0002', typeId: writerType, properties: { name: 'Grace' } }],
    relations: [
      ...data.relations,
      { id: 'authorship000002', typeId: authorship.id, fromId: 'bookRecord000001', toId: 'writerRecord0002' },
    ],
  };

  const checked: ValidationResult = course.validateInstances(twoAuthors);
  assert.deepEqual(
    checked.diagnostics.map((item: Diagnostic): string => item.code),
    ['INSTANCE_CARDINALITY_INVALID'],
  );
  assert.equal(checked.diagnostics[0]?.path, '/relations');
  assert.equal(checked.diagnostics[0]?.severity, 'error');
  assert.equal(checked.diagnostics[0]?.ref, authorship.id);
  assert.deepEqual(Modeller.import(course.export()).validateInstances(twoAuthors).diagnostics, checked.diagnostics);
});
