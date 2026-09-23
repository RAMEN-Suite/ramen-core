import assert from 'node:assert/strict';
import test from 'node:test';
import { RamenProject } from '../../dist/index.js';
import type {
  Attribute,
  AttributeCreationAdvice,
  AttributeSuggestion,
  CreateBundleResult,
  DataType,
  Node,
  NodeRelationSuggestion,
  RamenAdvisor,
  RamenAnnotation,
  RamenChange,
  Relation,
} from '../../dist/index.js';
import { createCorrespondenceFixture } from './fixtures.ts';
import type { CorrespondenceFixture } from './fixtures.ts';

void test('updates and removes local model elements through the RAMEN project API', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const project: RamenProject = fixture.project;
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
  const exported: CreateBundleResult = fixture.project.exportBundle();

  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const imported: RamenProject = RamenProject.importBundle(exported.bundle);

  assert.equal(imported.validate().valid, true);
  assert.equal(imported.getModel().id, fixture.model.id);
  assert.equal(imported.getModels().length, 2);
  assert.deepEqual(imported.getAnnotations(), fixture.project.getAnnotations());
});

void test('suggests inherited attributes and rejects conflicting attribute names', (): void => {
  const fixture: CorrespondenceFixture = createCorrespondenceFixture();
  const local: RamenChange<Attribute> = fixture.project.createAttribute(fixture.nodes.person.id, {
    name: 'authorityId',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  const advisor: RamenAdvisor | undefined = fixture.project.createAdvisor();

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
