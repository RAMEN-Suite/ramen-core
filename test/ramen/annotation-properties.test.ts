import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFactory, RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '../../dist/index.js';
import type {
  AnnotationPropertyAdvice,
  AnnotationSuggestion,
  Attribute,
  DataType,
  AnnotationRelation,
  AttributeSuggestion,
  Diagnostic,
  ModelInstanceGraph,
  ModelInstanceNode,
  ModelInstanceRelation,
  Node,
  RamenAnnotation,
  RamenChange,
  Relation,
} from '../../dist/index.js';

interface MediaModel {
  readonly project: RamenModel;
  readonly text: Node;
  readonly image: Node;
  readonly textLink: Relation;
  readonly imageLink: Relation;
}

function mediaModel(): MediaModel {
  const project: RamenModel = RamenModel.create({
    id: 'mediaProject010000',
    uri: 'https://example.org/media',
    name: 'Media',
    version: '1.0.0',
  });
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const image: Node = project.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
  const textLink: Relation = project.hasAnnotation(text, RAMEN_ELEMENT.ANNOTATION).element;
  const imageLink: Relation = project.hasAnnotation(image, RAMEN_ELEMENT.ANNOTATION).element;
  return { project, text, image, textLink, imageLink };
}

function width(): Attribute {
  return ModelFactory.createAttribute({ name: 'width', typeId: 'Integer', bounds: { lowerBound: 1, upperBound: 1 } });
}

function annotationData(project: RamenModel, properties: Readonly<Record<string, unknown>>): ModelInstanceGraph {
  return {
    modelId: project.getModel().id,
    nodes: [
      {
        id: 'mediaAnnotation010',
        typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
        properties: { uuid: 'abac88bd-b3e3-418a-8afe-6ac14409b9a1', ...properties },
      },
    ],
    relations: [],
  };
}

void test('type-owned properties remain separate from the shared Annotation node and other types', (): void => {
  const fixture: MediaModel = mediaModel();
  const property: Attribute = width();
  const created: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'imageRegion',
    properties: [property],
  });
  fixture.project.createAnnotation({ annotationId: RAMEN_ELEMENT.ANNOTATION, type: 'emphasis' });

  assert.equal(created.validation.valid, true, JSON.stringify(created.validation.diagnostics));
  assert.deepEqual(
    fixture.project
      .suggestAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'imageRegion')
      .map((item: AnnotationPropertyAdvice): string => item.name),
    ['width'],
  );
  assert.deepEqual(fixture.project.suggestAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'emphasis'), []);
  assert.equal(
    fixture.project
      .suggestAttributes(RAMEN_ELEMENT.ANNOTATION)
      .some((item: AttributeSuggestion): boolean => item.name === 'width'),
    false,
  );
  assert.equal(
    fixture.project.validateInstances(annotationData(fixture.project, { type: 'imageRegion', width: 3 })).hasErrors,
    false,
  );

  for (const properties of [{ type: 'imageRegion' }, { type: 'imageRegion', width: 'wide' }, { type: 'emphasis', width: 3 }]) {
    assert.equal(fixture.project.validateInstances(annotationData(fixture.project, properties)).hasErrors, true);
  }
  const exported: ReturnType<RamenModel['exportBundle']> = fixture.project.exportBundle();
  assert.ok(exported.ok);
  const restored: RamenModel = RamenModel.importBundle(JSON.parse(JSON.stringify(exported.bundle)) as unknown);
  assert.deepEqual(restored.getAnnotations(), fixture.project.getAnnotations());
});

void test('own properties coexist with selected attributes and reject unresolved references or data types', (): void => {
  const fixture: MediaModel = mediaModel();
  const owner: Node = fixture.project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const selected: Attribute = fixture.project.createAttribute(owner.id, {
    name: 'label',
    typeId: 'String',
    bounds: { lowerBound: 0, upperBound: 1 },
  }).element;
  const valid: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: owner.id,
    type: 'region',
    properties: [{ attributeId: selected.id }, width()],
  });

  assert.equal(valid.validation.valid, true);
  assert.deepEqual(
    fixture.project.suggestAttributesForAnnotation(owner.id, 'region').map((item: AnnotationPropertyAdvice): string => item.name),
    ['label', 'width'],
  );
  const invalid: RamenChange<RamenAnnotation> = fixture.project.updateAnnotation(valid.element.id, {
    ...valid.element,
    properties: [{ attributeId: `${RAMEN_MODEL.id}:${selected.id}` }, { ...width(), typeId: 'missingDataType010' }],
  });
  assert.equal(invalid.validation.valid, false);
  assert.equal(
    invalid.validation.diagnostics.filter((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_PROPERTY_INVALID')
      .length,
    2,
  );
});

function mediaData(fixture: MediaModel, links: readonly Relation[]): ModelInstanceGraph {
  const base: ModelInstanceGraph = annotationData(fixture.project, { type: 'comment' });
  const nodes: readonly ModelInstanceNode[] = [
    ...base.nodes,
    { id: 'mediaText010000000', typeId: fixture.text.id, properties: { uuid: 'b9c07998-641b-4b6e-8b48-f039d67d9ced' } },
    { id: 'mediaImage01000000', typeId: fixture.image.id, properties: { uuid: '8e8d2ab0-1079-4fbe-9c6c-0d3b952905e9' } },
  ];
  const relations: readonly ModelInstanceRelation[] = links.map((link: Relation, index: number): ModelInstanceRelation => ({
    id: `mediaLink00000000${index}`,
    typeId: link.id,
    fromId: link.id === fixture.textLink.id ? 'mediaText010000000' : 'mediaImage01000000',
    toId: 'mediaAnnotation010',
  }));
  return { ...base, nodes, relations };
}

void test('alternative carriers count together: exactly one Text or Image attachment', (): void => {
  const fixture: MediaModel = mediaModel();
  const created: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
    relations: [
      {
        relationId: fixture.textLink.id,
        alternatives: [fixture.imageLink.id],
        direction: 'incoming',
        bounds: { lowerBound: 1, upperBound: 1 },
      },
    ],
  });
  assert.equal(created.validation.valid, true, JSON.stringify(created.validation.diagnostics));

  for (const carrier of [fixture.text, fixture.image]) {
    const types: readonly string[] = fixture.project
      .createAdvisor()
      .suggestAnnotationsForNode(fixture.project.getModel().id, carrier.id)
      .map((item: AnnotationSuggestion): string => item.type);
    assert.deepEqual(types, ['comment']);
  }
  for (const links of [[fixture.textLink], [fixture.imageLink]]) {
    const result: ReturnType<RamenModel['validateInstances']> = fixture.project.validateInstances(mediaData(fixture, links));
    assert.equal(result.hasErrors, false, JSON.stringify(result.diagnostics));
  }
  for (const links of [[], [fixture.textLink, fixture.imageLink]]) {
    const diagnostics: readonly Diagnostic[] = fixture.project.validateInstances(mediaData(fixture, links)).diagnostics;
    assert.ok(diagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY'));
  }
  fixture.project.removeRelation(fixture.textLink.id);
  assert.equal(fixture.project.getAnnotations()[0]?.relations[0]?.relationId, fixture.imageLink.id);
  assert.equal(fixture.project.validate().valid, true);
});

void test('properties keep their datatype and advice through a refined Annotation node and another level', (): void => {
  const fixture: MediaModel = mediaModel();
  const dataType: DataType = fixture.project.createDataType({ name: 'Caption', baseType: 'String' }).element;
  const property: Attribute = ModelFactory.createAttribute({
    name: 'caption',
    typeId: dataType.id,
    bounds: { lowerBound: 1, upperBound: 1 },
  });
  fixture.project.createAnnotation({ annotationId: RAMEN_ELEMENT.ANNOTATION, type: 'caption', properties: [property] });
  const next: RamenModel = fixture.project.createNextLevel({
    id: 'mediaRefinedLevel001',
    uri: 'https://example.org/media-next',
    name: 'Edition',
    version: '1.0.0',
  });
  const owner: Node = next.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const advice: readonly AnnotationPropertyAdvice[] = next.suggestAttributesForAnnotation(owner.id, 'caption');

  assert.equal(next.validate().valid, true);
  assert.equal(advice[0]?.ref, `${fixture.project.getModel().id}:${property.id}`);
  const base: ModelInstanceGraph = annotationData(next, { type: 'caption', caption: 'Heading' });
  const original: ModelInstanceNode | undefined = base.nodes[0];
  assert.ok(original);
  const data: ModelInstanceGraph = { ...base, nodes: [{ ...original, typeId: owner.id }] };
  assert.deepEqual(next.validateInstances(data).diagnostics, []);
  assert.equal(
    next.validateInstances({
      ...data,
      nodes: [{ ...original, typeId: owner.id, properties: { ...original.properties, caption: 10 } }],
    }).hasErrors,
    true,
  );
});

void test('annotation property declarations reject duplicate names, invalid bounds and node collisions', (): void => {
  const fixture: MediaModel = mediaModel();
  const property: Attribute = width();
  const cases: readonly (readonly Attribute[])[] = [
    [property, { ...width(), name: property.name }],
    [{ ...property, bounds: { lowerBound: 2, upperBound: 1 } }],
    [{ ...property, name: 'type' }],
    [{ ...property, isKey: true, bounds: { lowerBound: 0, upperBound: 1 } }],
  ];
  const annotation: RamenAnnotation = fixture.project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'region',
  }).element;

  for (const properties of cases) {
    const result: RamenChange<RamenAnnotation> = fixture.project.updateAnnotation(annotation.id, { ...annotation, properties });
    assert.equal(result.validation.valid, false, JSON.stringify(properties));
  }
});

void test('alternative groups reject duplicate relations, invalid endpoints and impossible cardinality', (): void => {
  const fixture: MediaModel = mediaModel();
  const annotation: RamenAnnotation = fixture.project.createAnnotation({
    annotationId: RAMEN_ELEMENT.ANNOTATION,
    type: 'comment',
  }).element;
  const unrelated: Relation = fixture.project.partOf(
    fixture.text,
    fixture.project.createNode({ name: 'Page', refines: RAMEN_ELEMENT.COLLECTION }).element,
  ).element;
  const variants: readonly AnnotationRelation[] = [
    {
      relationId: fixture.textLink.id,
      alternatives: [fixture.textLink.id],
      direction: 'incoming',
      bounds: { lowerBound: 1, upperBound: 1 },
    },
    {
      relationId: fixture.textLink.id,
      alternatives: [unrelated.id],
      direction: 'incoming',
      bounds: { lowerBound: 1, upperBound: 1 },
    },
    {
      relationId: fixture.textLink.id,
      alternatives: [fixture.imageLink.id],
      direction: 'incoming',
      bounds: { lowerBound: 2, upperBound: 1 },
    },
  ];

  for (const requirement of variants) {
    const result: RamenChange<RamenAnnotation> = fixture.project.updateAnnotation(annotation.id, {
      ...annotation,
      relations: [requirement],
    });
    assert.equal(result.validation.valid, false);
  }
});
