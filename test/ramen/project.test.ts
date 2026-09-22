import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RAMEN_ELEMENT,
  RAMEN_MODEL,
  RAMEN_SCHEMA_URI,
  RamenAdvisor,
  RamenInstanceValidator,
  RamenProject,
  RamenSchemaValidator,
  createModelBundle,
  splitModelBundle,
} from '../../dist/index.js';
import type {
  DataTypeSuggestion,
  GModel,
  GNode,
  GRelation,
  ModelInstanceNode,
  NodeRefinementSuggestion,
  RamenAnnotation,
  RelationRefinementSuggestion,
} from '../../dist/index.js';

function project(): RamenProject {
  return RamenProject.create({
    uri: 'https://example.org/models/editorial',
    id: 'editorialModel01',
    name: 'Editorial',
    version: '1.0.0',
  });
}

void test('RAMEN provides reusable standard string datatypes', () => {
  const names: readonly string[] = RAMEN_MODEL.classifiers
    .filter((classifier) => classifier.kind === 'GDataType')
    .map((classifier) => classifier.name);
  assert.deepEqual(names, ['UUID', 'Date', 'DateTime', 'URI', 'Email']);
});

void test('publishes a versioned JSON Schema for the RAMEN extension', () => {
  assert.equal(RamenSchemaValidator.getSchemaNode().$id, RAMEN_SCHEMA_URI);
  assert.equal(RamenSchemaValidator.isValid({ annotations: [] }), true);
  assert.equal(RamenSchemaValidator.isValid({ annotations: [{ id: 'incomplete' }] }), false);
  assert.equal(RamenSchemaValidator.isValid({ annotations: [], unknown: true }), false);
});

void test('creates and validates a RAMEN project after every model change', () => {
  const ramenProject: RamenProject = project();
  assert.equal(ramenProject.validate().valid, true);

  const person = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  });
  assert.equal(person.element.id.length, 16);
  assert.equal(person.validation.valid, true);

  const birthDate = ramenProject.createAttribute(person.element.id, {
    name: 'birthDate',
    typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`,
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  assert.equal(birthDate.validation.valid, true);
});

void test('suggests node refinements and available data types from a valid graph', () => {
  const advisor: RamenAdvisor | undefined = project().createAdvisor();
  assert.ok(advisor);
  const nodeNames: readonly string[] = advisor
    .suggestNodeRefinements('editorialModel01')
    .map((item: NodeRefinementSuggestion): string => item.name);
  assert.deepEqual(nodeNames, ['Annotation', 'Collection', 'Content', 'Entity']);

  const dataTypeNames: readonly string[] = advisor
    .suggestDataTypes('editorialModel01')
    .map((item: DataTypeSuggestion): string => item.name);
  assert.ok(dataTypeNames.includes('String'));
  assert.ok(dataTypeNames.includes('DateTime'));
});

void test('advises inherited attributes, conflicts, and possible relations', () => {
  const ramenProject: RamenProject = project();
  const person: GNode = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  }).element;
  const annotation: GNode = ramenProject.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  const advisor: RamenAdvisor | undefined = ramenProject.createAdvisor();
  assert.ok(advisor);
  const advice = advisor.adviseNode('editorialModel01', person.id);
  assert.ok(advice);
  assert.deepEqual(
    advice.lineage.map((item) => item.name),
    ['Entity', 'Person'],
  );
  assert.deepEqual(
    advice.attributes.map((item) => [item.name, item.inherited]),
    [
      ['uuid', true],
      ['label', true],
    ],
  );
  assert.deepEqual(advisor.adviseAttributeCreation('editorialModel01', person.id, 'label').conflicts, ['attribute']);
  assert.equal(advisor.adviseAttributeCreation('editorialModel01', person.id, 'birthDate').allowed, true);
  assert.ok(
    advice.relations.some(
      (relation) => relation.name === 'HAS_ANNOTATION' && relation.compatibleTargetNodeIds.includes(annotation.id),
    ),
  );
});

void test('suggests compatible relation reuse and refinement', () => {
  const ramenProject: RamenProject = project();
  const person: GNode = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  }).element;
  const annotation: GNode = ramenProject.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  const advisor: RamenAdvisor | undefined = ramenProject.createAdvisor();
  assert.ok(advisor);
  const suggestions: readonly RelationRefinementSuggestion[] = advisor.suggestRelations(
    'editorialModel01',
    annotation.id,
    person.id,
  );
  assert.ok(suggestions.some((item: RelationRefinementSuggestion): boolean => item.name === 'REFERS_TO'));
});

void test('returns semantic diagnostics for an invalid modeling change', () => {
  const ramenProject: RamenProject = project();
  const person: GNode = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  }).element;
  const duplicate = ramenProject.createAttribute(person.id, {
    name: 'label',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  });
  assert.equal(duplicate.validation.valid, false);
  assert.ok(duplicate.validation.diagnostics.some((diagnostic) => diagnostic.code === 'ATTRIBUTE_NAME_SHADOWS_SUPERTYPE'));
});

interface AnnotationFixture {
  readonly model: GModel;
  readonly person: GNode;
  readonly annotationNode: GNode;
  readonly annotation: RamenAnnotation;
  readonly relation: GRelation;
}

function annotationFixture(): AnnotationFixture {
  const ramenProject: RamenProject = project();
  const person: GNode = ramenProject.createNode({
    name: 'Person',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ENTITY },
  }).element;
  const annotationNode: GNode = ramenProject.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  const advisor: RamenAdvisor | undefined = ramenProject.createAdvisor();
  assert.ok(advisor);
  const suggestion: RelationRefinementSuggestion | undefined = advisor
    .suggestRelations('editorialModel01', annotationNode.id, person.id)
    .find((item: RelationRefinementSuggestion): boolean => item.name === 'REFERS_TO');
  assert.ok(suggestion);
  const relation: GRelation = ramenProject.createRelation({
    refines: { modelId: suggestion.modelId, elementId: suggestion.relationId },
    fromNodeId: annotationNode.id,
    toNodeId: person.id,
  }).element;
  const annotation = ramenProject.createAnnotation({
    annotationId: annotationNode.id,
    type: 'persName',
    relations: [{ relationId: relation.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  assert.equal(annotation.validation.valid, true, JSON.stringify(annotation.validation.diagnostics));
  return { model: ramenProject.getModel(), person, annotationNode, annotation: annotation.element, relation };
}

function annotationNodes(
  fixture: AnnotationFixture,
  type: string,
  extra: Readonly<Record<string, unknown>> = {},
): readonly ModelInstanceNode[] {
  return [
    {
      id: 'annotationInst01',
      typeId: fixture.annotationNode.id,
      properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: type, ...extra },
    },
    {
      id: 'personInstance01',
      typeId: fixture.person.id,
      properties: { uuid: '550e8400-e29b-41d4-a716-446655440000', label: 'Ada' },
    },
  ];
}

void test('stores annotation variants separately from GCore nodes', () => {
  const fixture: AnnotationFixture = annotationFixture();
  assert.equal(fixture.model.classifiers.filter((item) => item.kind === 'GNode').length, 2);
  assert.deepEqual(fixture.model.ext?.ramen, { annotations: [fixture.annotation] });
  assert.equal(fixture.annotation.type, 'persName');
  assert.equal(fixture.annotation.annotationId, fixture.annotationNode.id);
});

void test('preserves annotations when models are bundled and separated again', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const result = createModelBundle(fixture.model.id, [fixture.model, RAMEN_MODEL]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const restored: readonly GModel[] = splitModelBundle(result.bundle);
  const projectModel: GModel | undefined = restored.find((model: GModel): boolean => model.id === fixture.model.id);
  assert.ok(projectModel);
  assert.deepEqual(projectModel.ext?.ramen, fixture.model.ext?.ramen);
});

void test('suggests annotations for their owning Annotation node', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const ramenProject: RamenProject = RamenProject.load(fixture.model);
  const advisor: RamenAdvisor | undefined = ramenProject.createAdvisor();
  assert.ok(advisor);
  assert.deepEqual(
    advisor.suggestAnnotations(fixture.model.id, fixture.annotationNode.id).map((item) => item.type),
    ['persName'],
  );
});

void test('suggests annotation properties, relations, targets, and cardinalities', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const ramenProject: RamenProject = RamenProject.load(fixture.model);
  const url = ramenProject.createAttribute(fixture.annotationNode.id, {
    name: 'url',
    typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.URI}`,
    bounds: { lowerBound: 0, upperBound: 1 },
  }).element;
  const advice = ramenProject.createAdvisor()?.adviseAnnotation(fixture.model.id, fixture.annotationNode.id);
  assert.ok(advice);
  const property = advice.properties.find((item) => item.attributeId === url.id);
  assert.ok(property);
  assert.deepEqual(property.cardinalityOptions, [
    { lowerBound: 0, upperBound: 1 },
    { lowerBound: 1, upperBound: 1 },
  ]);
  const relation = advice.relations.find((item) => item.relationId === fixture.relation.id && item.direction === 'outgoing');
  assert.ok(relation);
  assert.equal(relation.targetName, 'Person');
  assert.ok(relation.compatibleTargetNodeIds.includes(fixture.person.id));
});

void test('rejects an unknown annotation type and missing required annotation relation', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const unknown = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], {
    modelId: fixture.model.id,
    nodes: annotationNodes(fixture, 'placeName'),
    relations: [],
  });
  assert.ok(unknown.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_UNKNOWN'));

  const missing = validator.validate(fixture.model.id, [fixture.model, RAMEN_MODEL], {
    modelId: fixture.model.id,
    nodes: annotationNodes(fixture, 'persName'),
    relations: [],
  });
  assert.ok(missing.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY'));
});

void test('accepts a valid annotation and its declared relation', () => {
  const fixture: AnnotationFixture = annotationFixture();
  const result = new RamenInstanceValidator().validate(fixture.model.id, [fixture.model, RAMEN_MODEL], {
    modelId: fixture.model.id,
    nodes: annotationNodes(fixture, 'persName'),
    relations: [{ id: 'refersInstance01', typeId: fixture.relation.id, fromId: 'annotationInst01', toId: 'personInstance01' }],
  });
  assert.deepEqual(result.diagnostics, []);
});

function annotationPropertyFixture(): { readonly model: GModel; readonly annotationNode: GNode } {
  const ramenProject: RamenProject = project();
  const annotationNode: GNode = ramenProject.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  const url = ramenProject.createAttribute(annotationNode.id, {
    name: 'url',
    typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.URI}`,
    bounds: { lowerBound: 0, upperBound: 1 },
  }).element;
  ramenProject.createAnnotation({ annotationId: annotationNode.id, type: 'persName' });
  ramenProject.createAnnotation({
    annotationId: annotationNode.id,
    type: 'externalReference',
    properties: [{ attributeId: url.id, bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  return { model: ramenProject.getModel(), annotationNode: annotationNode };
}

void test('allows only properties selected by the annotation definition', () => {
  const { model, annotationNode } = annotationPropertyFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const persName = validator.validate(model.id, [model, RAMEN_MODEL], {
    modelId: model.id,
    nodes: [
      {
        id: 'annotationInst01',
        typeId: annotationNode.id,
        properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: 'persName', url: 'https://example.org' },
      },
    ],
    relations: [],
  });
  assert.ok(persName.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_NOT_ALLOWED'));

  const reference = validator.validate(model.id, [model, RAMEN_MODEL], {
    modelId: model.id,
    nodes: [
      {
        id: 'annotationInst02',
        typeId: annotationNode.id,
        properties: {
          uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
          type: 'externalReference',
          url: 'https://example.org',
        },
      },
    ],
    relations: [],
  });
  assert.deepEqual(reference.diagnostics, []);
});

void test('enforces annotation-specific property cardinality', () => {
  const { model, annotationNode } = annotationPropertyFixture();
  const validator: RamenInstanceValidator = new RamenInstanceValidator();
  const missingUrl = validator.validate(model.id, [model, RAMEN_MODEL], {
    modelId: model.id,
    nodes: [
      {
        id: 'annotationInst03',
        typeId: annotationNode.id,
        properties: { uuid: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', type: 'externalReference' },
      },
    ],
    relations: [],
  });
  assert.ok(missingUrl.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_INSTANCE_ANNOTATION_PROPERTY_CARDINALITY'));
});

void test('inherits annotations when their Annotation node is refined', () => {
  const base: AnnotationFixture = annotationFixture();
  const ramenProject: RamenProject = RamenProject.createLevel(base.model, {
    uri: 'https://example.org/models/scholarly',
    id: 'scholarlyModel01',
    name: 'Scholarly',
    version: '1.0.0',
  });
  const detailed: GNode = ramenProject.createNode({
    name: 'DetailedTextAnnotation',
    refines: { modelId: base.model.id, elementId: base.annotationNode.id },
  }).element;
  assert.deepEqual(
    ramenProject
      .createAdvisor()
      ?.suggestAnnotations('scholarlyModel01', detailed.id)
      .map((item) => item.type),
    ['persName'],
  );
});

void test('carries the complete dependency chain through arbitrary model levels', () => {
  const levelOne: RamenProject = project();
  const firstNode: GNode = levelOne.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  levelOne.createAnnotation({ annotationId: firstNode.id, type: 'persName' });
  const levelTwo: RamenProject = levelOne.createNextLevel({
    uri: 'https://example.org/models/level-two',
    id: 'refinementLevel02',
    name: 'Level Two',
    version: '1.0.0',
  });
  const secondNode: GNode = levelTwo.createNode({
    name: 'ScholarlyAnnotation',
    refines: { modelId: levelOne.getModel().id, elementId: firstNode.id },
  }).element;
  const levelThree: RamenProject = levelTwo.createNextLevel({
    uri: 'https://example.org/models/level-three',
    id: 'refinementLevel03',
    name: 'Level Three',
    version: '1.0.0',
  });
  const thirdNode: GNode = levelThree.createNode({
    name: 'DetailedAnnotation',
    refines: { modelId: levelTwo.getModel().id, elementId: secondNode.id },
  }).element;
  assert.equal(levelThree.validate().valid, true);
  assert.equal(levelThree.getModels().length, 4);
  assert.deepEqual(
    levelThree
      .createAdvisor()
      ?.suggestAnnotations('refinementLevel03', thirdNode.id)
      .map((item) => item.type),
    ['persName'],
  );
});

void test('limits refinement advice to inherited annotation relations and bounds', () => {
  const base: AnnotationFixture = annotationFixture();
  const child: RamenProject = RamenProject.load(base.model).createNextLevel({
    uri: 'https://example.org/models/advice-level',
    id: 'adviceLevelModel01',
    name: 'Advice Level',
    version: '1.0.0',
  });
  const person: GNode = child.createNode({
    name: 'HistoricalPerson',
    refines: { modelId: base.model.id, elementId: base.person.id },
  }).element;
  const annotation: GNode = child.createNode({
    name: 'ScholarlyAnnotation',
    refines: { modelId: base.model.id, elementId: base.annotationNode.id },
  }).element;
  const advice = child
    .createAdvisor()
    ?.adviseAnnotation('adviceLevelModel01', annotation.id, `${base.model.id}:${base.annotation.id}`);
  assert.ok(advice);
  const relation = advice.relations.find((item) => item.relationId === base.relation.id && item.direction === 'outgoing');
  assert.ok(relation);
  assert.deepEqual(relation.inheritedBounds, { lowerBound: 1, upperBound: 1 });
  assert.deepEqual(relation.cardinalityOptions, [{ lowerBound: 1, upperBound: 1 }]);
  assert.ok(relation.compatibleTargetNodeIds.includes(person.id));
  assert.ok(advice.relations.every((item) => item.inherited));
});

void test('refines an inherited annotation explicitly and narrows its cardinality', () => {
  const base: AnnotationFixture = annotationFixture();
  const ramenProject: RamenProject = RamenProject.createLevel(base.model, {
    uri: 'https://example.org/models/scholarly',
    id: 'scholarlyModel01',
    name: 'Scholarly',
    version: '1.0.0',
  });
  const detailed: GNode = ramenProject.createNode({
    name: 'DetailedTextAnnotation',
    refines: { modelId: base.model.id, elementId: base.annotationNode.id },
  }).element;
  const refined = ramenProject.refineAnnotation({
    annotationId: detailed.id,
    refines: { modelId: base.model.id, elementId: base.annotation.id },
    relations: [
      {
        relationId: `${base.model.id}:${base.relation.id}`,
        direction: 'outgoing',
        bounds: { lowerBound: 1, upperBound: 1 },
      },
    ],
  });
  assert.equal(refined.element.type, 'persName');
  assert.equal(refined.validation.valid, true, JSON.stringify(refined.validation.diagnostics));
});

void test('rejects cardinality widening in an annotation refinement', () => {
  const base: AnnotationFixture = annotationFixture();
  const child: RamenProject = RamenProject.createLevel(base.model, {
    uri: 'https://example.org/models/scholarly',
    id: 'scholarlyModel01',
    name: 'Scholarly',
    version: '1.0.0',
  });
  const detailed: GNode = child.createNode({
    name: 'DetailedTextAnnotation',
    refines: { modelId: base.model.id, elementId: base.annotationNode.id },
  }).element;
  const refined = child.refineAnnotation({
    annotationId: detailed.id,
    refines: { modelId: base.model.id, elementId: base.annotation.id },
    relations: [
      {
        relationId: `${base.model.id}:${base.relation.id}`,
        direction: 'outgoing',
        bounds: { lowerBound: 0, upperBound: 1 },
      },
    ],
  });
  assert.equal(refined.validation.valid, false);
  assert.ok(refined.validation.diagnostics.some((item) => item.code === 'RAMEN_ANNOTATION_BOUNDS_INVALID'));
});

void test('requires explicit refinement instead of silently replacing an inherited annotation', () => {
  const base: AnnotationFixture = annotationFixture();
  const ramenProject: RamenProject = RamenProject.createLevel(base.model, {
    uri: 'https://example.org/models/scholarly',
    id: 'scholarlyModel01',
    name: 'Scholarly',
    version: '1.0.0',
  });
  const detailed: GNode = ramenProject.createNode({
    name: 'DetailedTextAnnotation',
    refines: { modelId: base.model.id, elementId: base.annotationNode.id },
  }).element;
  const replacement = ramenProject.createAnnotation({ annotationId: detailed.id, type: 'persName' });
  assert.equal(replacement.validation.valid, false);
  assert.ok(replacement.validation.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_ANNOTATION_REFINEMENT_REQUIRED'));
});

void test('rejects duplicate annotation types on the same Annotation node', () => {
  const ramenProject: RamenProject = project();
  const annotationNode: GNode = ramenProject.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  ramenProject.createAnnotation({ annotationId: annotationNode.id, type: 'name' });
  const duplicate = ramenProject.createAnnotation({ annotationId: annotationNode.id, type: 'name' });
  assert.equal(duplicate.validation.valid, false);
  assert.ok(duplicate.validation.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_ANNOTATION_TYPE_DUPLICATE'));
});

void test('updates and removes annotations through the public project API', () => {
  const ramenProject: RamenProject = project();
  const annotationNode: GNode = ramenProject.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  const created: RamenAnnotation = ramenProject.createAnnotation({ annotationId: annotationNode.id, type: 'name' }).element;
  const updated = ramenProject.updateAnnotation(created.id, { type: 'persName' });
  assert.equal(updated.validation.valid, true);
  assert.equal(ramenProject.getAnnotations()[0]?.type, 'persName');
  const removed = ramenProject.removeAnnotation(created.id);
  assert.equal(removed.validation.valid, true);
  assert.deepEqual(ramenProject.getAnnotations(), []);
});

void test('rejects malformed serialized annotation sections', () => {
  const malformed: GModel = {
    ...project().getModel(),
    ext: { ramen: { annotations: [{ id: 'incomplete' }] } },
  };
  const validation = RamenProject.load(malformed).validate();
  assert.equal(validation.valid, false);
  assert.ok(validation.diagnostics.some((diagnostic) => diagnostic.code === 'RAMEN_ANNOTATIONS_INVALID'));
});

void test('rejects new relations introduced by an annotation refinement', () => {
  const base: AnnotationFixture = annotationFixture();
  const child: RamenProject = RamenProject.createLevel(base.model, {
    uri: 'https://example.org/models/scholarly',
    id: 'scholarlyModel01',
    name: 'Scholarly',
    version: '1.0.0',
  });
  const detailed: GNode = child.createNode({
    name: 'DetailedTextAnnotation',
    refines: { modelId: base.model.id, elementId: base.annotationNode.id },
  }).element;
  const suggestion = child
    .createAdvisor()
    ?.suggestRelations('scholarlyModel01', detailed.id, detailed.id)
    .find((item) => item.name === 'HAS_ANNOTATION');
  assert.ok(suggestion);
  const relation: GRelation = child.createRelation({
    refines: { modelId: suggestion.modelId, elementId: suggestion.relationId },
    fromNodeId: detailed.id,
    toNodeId: detailed.id,
  }).element;
  const refined = child.refineAnnotation({
    annotationId: detailed.id,
    refines: { modelId: base.model.id, elementId: base.annotation.id },
    relations: [{ relationId: relation.id, direction: 'outgoing', bounds: { lowerBound: 0, upperBound: 1 } }],
  });
  assert.equal(refined.validation.valid, false);
  assert.ok(refined.validation.diagnostics.some((item) => item.code === 'RAMEN_ANNOTATION_RELATION_EXTENSION'));
});

void test('models annotation-on-annotation without creating annotation nodes per type', () => {
  const ramenProject: RamenProject = project();
  const node: GNode = ramenProject.createNode({
    name: 'TextAnnotation',
    refines: { modelId: RAMEN_MODEL.id, elementId: RAMEN_ELEMENT.ANNOTATION },
  }).element;
  const relationSuggestion = ramenProject
    .createAdvisor()
    ?.suggestRelations('editorialModel01', node.id, node.id)
    .find((item) => item.name === 'HAS_ANNOTATION');
  assert.ok(relationSuggestion);
  const relation: GRelation = ramenProject.createRelation({
    refines: { modelId: relationSuggestion.modelId, elementId: relationSuggestion.relationId },
    fromNodeId: node.id,
    toNodeId: node.id,
  }).element;
  const comment = ramenProject.createAnnotation({
    annotationId: node.id,
    type: 'comment',
    relations: [{ relationId: relation.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  assert.equal(comment.validation.valid, true, JSON.stringify(comment.validation.diagnostics));
  assert.equal(ramenProject.getModel().classifiers.filter((item) => item.kind === 'GNode').length, 1);
});
