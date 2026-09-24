import assert from 'node:assert/strict';
import test from 'node:test';
import { RAMEN_ELEMENT, RamenModel } from '../../dist/index.js';
import type {
  Attribute,
  AttributeCreationAdvice,
  AttributeSuggestion,
  CreateRamenBundleResult,
  Classifier,
  DataType,
  Diagnostic,
  Literal,
  Model,
  RamenModelBundle,
  RamenModelDocument,
  Node,
  NodeRelationSuggestion,
  RamenAdvisor,
  RamenAnnotation,
  RamenAnnotationChange,
  RamenChange,
  RamenEvolutionReport,
  Relation,
  RelationRefinementSuggestion,
} from '../../dist/index.js';
import { createCorrespondenceFixture } from './fixtures.ts';
import type { CorrespondenceFixture } from './fixtures.ts';

void test('connects compatible RAMEN nodes without naming the relation', (): void => {
  const model: RamenModel = RamenModel.create({
    id: 'automaticLinkModel01',
    uri: 'https://example.org/models/automatic-link',
    name: 'Automatic Link',
    version: '1.0.0',
  });
  const annotation: Node = model.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const person: Node = model.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
  const linked: RamenChange<Relation> = model.connect(annotation, person);

  assert.equal(linked.element.name, 'REFERS_TO');
  assert.equal(linked.validation.valid, true);
  assert.throws((): RamenChange<Relation> => model.connect(annotation, annotation), /found 2: HAS_ANNOTATION, REFERS_TO/);

  const choices: readonly RelationRefinementSuggestion[] = model.suggestRelations(annotation.id, annotation.id);
  const selected: RelationRefinementSuggestion | undefined = choices.find(
    (item: RelationRefinementSuggestion): boolean => item.name === 'HAS_ANNOTATION',
  );
  assert.ok(selected);
  const explicit: RamenChange<Relation> = model.connect(annotation, annotation, selected);
  assert.equal(explicit.validation.valid, true);
  assert.equal(explicit.element.name, 'HAS_ANNOTATION');
  assert.throws((): RamenChange<Relation> => model.connect(annotation, person, selected), /does not connect these nodes/);

  const next: RamenModel = model.createNextLevel({
    id: 'specificLinkModel01',
    uri: 'https://example.org/models/specific-link',
    name: 'Specific Link',
    version: '1.0.0',
  });
  const refinedAnnotation: Node = next.createNode({ name: 'EditionAnnotation', refines: annotation.id }).element;
  const refinedPerson: Node = next.createNode({ name: 'HistoricalPerson', refines: person.id }).element;
  const refinedLink: RamenChange<Relation> = next.connect(refinedAnnotation, refinedPerson);

  assert.equal(refinedLink.validation.valid, true);
  assert.deepEqual(refinedLink.element.superTypes, [`${model.getModel().id}:${linked.element.id}`]);
});

void test('updates and removes local model elements through the RAMEN project API', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const project: RamenModel = fixture.project;
  const node: RamenChange<Node> = project.updateNode(fixture.nodes.person.id, { name: 'HistoricalPerson' });
  const attribute: RamenChange<Attribute> = project.updateAttribute(fixture.nodes.annotation.id, fixture.url.id, {
    name: 'referenceUrl',
    isUnique: true,
  });
  const createdType: RamenChange<DataType> = project.createDataType({ name: 'Certainty', baseType: 'String' });
  const dataType: RamenChange<DataType> = project.updateDataType(createdType.element.id, { name: 'Confidence' });
  const relation: RamenChange<Relation> = project.updateRelation(fixture.relations.textAnnotation.id, {
    name: 'ANNOTATES',
  });

  assert.equal(node.element.name, 'HistoricalPerson');
  assert.equal(attribute.element.name, 'referenceUrl');
  assert.equal(attribute.element.isUnique, true);
  assert.equal(dataType.element.name, 'Confidence');
  assert.equal(relation.element.name, 'ANNOTATES');
  assert.equal(relation.validation.valid, true);

  const removedRelation: RamenChange<Relation> = project.removeRelation(relation.element.id);
  const removedAttribute: RamenChange<Attribute> = project.removeAttribute(fixture.nodes.annotation.id, attribute.element.id);
  const removedType: RamenChange<DataType> = project.removeDataType(dataType.element.id);

  assert.equal(removedRelation.validation.valid, true);
  assert.equal(removedAttribute.validation.valid, true);
  assert.equal(removedType.validation.valid, true);
});

void test('removes annotation references together with their owning node', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const removed: RamenChange<Node> = fixture.project.removeNode(fixture.nodes.annotation.id);

  assert.equal(removed.validation.valid, true);
  assert.deepEqual(fixture.project.getAnnotations(), []);
  assert.equal(
    fixture.project
      .getModel()
      .relations.some(
        (relation: Relation): boolean =>
          relation.from.nodeId === fixture.nodes.annotation.id || relation.to.nodeId === fixture.nodes.annotation.id,
      ),
    false,
  );
});

void test('updates and removes local annotation definitions', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const created: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: fixture.nodes.annotation.id,
    type: 'temporary',
  });
  const updated: RamenChange<RamenAnnotation> = fixture.project.updateAnnotation(created.element.id, { type: 'editorialNote' });
  const removed: RamenChange<RamenAnnotation> = fixture.project.removeAnnotation(updated.element.id);

  assert.equal(updated.element.type, 'editorialNote');
  assert.equal(updated.validation.valid, true);
  assert.equal(removed.element.id, created.element.id);
  assert.equal(removed.validation.valid, true);
});

void test('exports and imports a complete editable RAMEN project bundle', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const exported: CreateRamenBundleResult = fixture.project.exportBundle();

  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const serialized: string = JSON.stringify(exported.bundle);
  const parsed: unknown = JSON.parse(serialized);
  const imported: RamenModel = RamenModel.importBundle(parsed);

  assert.equal(imported.validate().valid, true);
  assert.equal(imported.getModel().id, fixture.model.id);
  assert.equal(imported.getModels().length, 2);
  assert.deepEqual(imported.getAnnotations(), fixture.project.getAnnotations());
});

void test('does not export a project with invalid RAMEN annotation semantics', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const duplicate: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: fixture.nodes.annotation.id,
    type: 'persName',
  });
  const exported: CreateRamenBundleResult = fixture.project.exportBundle();

  assert.equal(duplicate.validation.valid, false);
  assert.equal(exported.ok, false);
  assert.throws((): RamenAdvisor => fixture.project.createAdvisor(), /Cannot advise an invalid RAMEN model/);
  if (exported.ok) return;
  assert.ok(
    exported.diagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_DUPLICATE'),
  );
});

void test('rejects a structurally valid bundle with invalid RAMEN semantics on import', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const exported: CreateRamenBundleResult = fixture.project.exportBundle();

  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const malformed: RamenModelDocument = {
    ...fixture.model,
    annotations: [{ id: 'incomplete' }],
  } as unknown as RamenModelDocument;
  const bundle: RamenModelBundle = {
    ...exported.bundle,
    models: exported.bundle.models.map((model: Model): Model => (model.id === malformed.id ? malformed : model)),
  };

  assert.throws((): RamenModel => RamenModel.importBundle(bundle), /Invalid RAMEN project bundle/);
});

void test('compares two project states and reports RAMEN errors in the later state', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const before: RamenModel = RamenModel.load(fixture.model);
  const changed: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: fixture.nodes.annotation.id,
    type: 'persName',
  });
  const report: RamenEvolutionReport = before.compareTo(fixture.project);
  assert.equal(changed.validation.valid, false);
  assert.deepEqual(report.changes, []);
  assert.equal(report.annotationChanges.length, 1);
  assert.equal(report.annotationChanges[0]?.action, 'added');
  assert.equal(report.annotationChanges[0]?.annotationId, changed.element.id);
  assert.deepEqual(report.beforeDiagnostics, []);
  assert.ok(
    report.afterDiagnostics.some((diagnostic: Diagnostic): boolean => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_DUPLICATE'),
  );
});

void test('identifies changed and removed annotation definitions by stable ID', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const before: RamenModel = RamenModel.load(fixture.model);
  const changed: RamenChange<RamenAnnotation> = fixture.project.updateAnnotation(fixture.annotations.persName.id, {
    type: 'personName',
  });
  const removed: RamenChange<RamenAnnotation> = fixture.project.removeAnnotation(fixture.annotations.placeName.id);
  const report: RamenEvolutionReport = before.compareTo(fixture.project);

  assert.equal(changed.validation.valid, true);
  assert.equal(removed.validation.valid, true);
  assert.deepEqual(
    report.annotationChanges
      .map((change: RamenAnnotationChange): readonly string[] => [change.action, change.annotationId])
      .sort(),
    [
      ['changed', fixture.annotations.persName.id],
      ['removed', fixture.annotations.placeName.id],
    ].sort(),
  );
  assert.deepEqual(report.afterDiagnostics, []);
});

void test('creates, updates, and removes a data type literal through the project API', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const dataType: RamenChange<DataType> = fixture.project.createDataType({ name: 'EditorialStatus', baseType: 'String' });
  const created: RamenChange<Literal> = fixture.project.createLiteral(dataType.element.id, {
    name: 'Draft',
    literal: 'draft',
  });
  const updated: RamenChange<Literal> = fixture.project.updateLiteral(dataType.element.id, created.element.id, {
    name: 'Reviewed',
    literal: 'reviewed',
  });

  assert.equal(created.validation.valid, true);
  assert.equal(updated.validation.valid, true);
  assert.equal(updated.element.id, created.element.id);
  assert.equal(updated.element.literal, 'reviewed');

  const removed: RamenChange<Literal> = fixture.project.removeLiteral(dataType.element.id, created.element.id);
  const classifier: DataType | undefined = fixture.project
    .getModel()
    .classifiers.find((item: Classifier): item is DataType => item.id === dataType.element.id && item.kind === 'DataType');

  assert.equal(removed.validation.valid, true);
  assert.equal(classifier?.literals, undefined);
  assert.throws(
    (): RamenChange<Literal> => fixture.project.removeLiteral(dataType.element.id, created.element.id),
    /Literal not found/,
  );
});

void test('reports duplicate data type literals when editing a project', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const dataType: RamenChange<DataType> = fixture.project.createDataType({ name: 'EditorialStatus', baseType: 'String' });
  const first: RamenChange<Literal> = fixture.project.createLiteral(dataType.element.id, { name: 'Draft', literal: 'draft' });
  const duplicate: RamenChange<Literal> = fixture.project.createLiteral(dataType.element.id, {
    name: 'Draft',
    literal: 'draft',
  });

  assert.equal(first.validation.valid, true);
  assert.equal(duplicate.validation.valid, false);
  assert.ok(
    duplicate.validation.diagnostics.some(
      (diagnostic: Diagnostic): boolean => diagnostic.code === 'DATATYPE_LITERAL_NAME_DUPLICATE',
    ),
  );
});

void test('suggests inherited attributes and rejects conflicting attribute names', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const local: RamenChange<Attribute> = fixture.project.createAttribute(fixture.nodes.person.id, {
    name: 'authorityId',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  const advisor: RamenAdvisor = fixture.project.createAdvisor();

  assert.ok(advisor);
  const attributes: readonly AttributeSuggestion[] = advisor.suggestAttributes(fixture.model.id, fixture.nodes.person.id);
  const relation: NodeRelationSuggestion | undefined = advisor.suggestConnections(fixture.model.id, fixture.nodes.person.id)[0];
  const inherited: AttributeSuggestion | undefined = attributes.find(
    (attribute: AttributeSuggestion): boolean => attribute.name === 'label',
  );
  const declared: AttributeSuggestion | undefined = attributes.find(
    (attribute: AttributeSuggestion): boolean => attribute.attributeId === local.element.id,
  );

  assert.ok(relation);
  assert.equal(inherited?.inherited, true);
  assert.equal(declared?.inherited, false);
  const attributeConflict: AttributeCreationAdvice = advisor.adviseAttributeCreation(
    fixture.model.id,
    fixture.nodes.person.id,
    'label',
  );
  const roleConflict: AttributeCreationAdvice = advisor.adviseAttributeCreation(
    fixture.model.id,
    fixture.nodes.person.id,
    relation.role,
  );
  const available: AttributeCreationAdvice = advisor.adviseAttributeCreation(
    fixture.model.id,
    fixture.nodes.person.id,
    'occupation',
  );

  assert.deepEqual(attributeConflict, { allowed: false, conflicts: ['attribute'] });
  assert.deepEqual(roleConflict, { allowed: false, conflicts: ['relationRole'] });
  assert.deepEqual(available, { allowed: true, conflicts: [] });
});

void test('rejects edits of unknown local elements with stable messages', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();

  assert.throws((): RamenChange<Node> => fixture.project.updateNode('unknownNode00001', { name: 'Missing' }), /Node not found/);
  assert.throws(
    (): RamenChange<Attribute> =>
      fixture.project.updateAttribute(fixture.nodes.person.id, 'unknownAttr00001', { name: 'Missing' }),
    /Attribute not found/,
  );
  assert.throws((): RamenChange<Relation> => fixture.project.removeRelation('unknownRelation1'), /Relation not found/);
});
