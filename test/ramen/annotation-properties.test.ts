import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFactory, RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '../../dist/ramen-core/index.js';
import type {
  AnnotationOptions,
  RelationOption,
  PropertyOption,
  AnnotationSuggestion,
  Attribute,
  DataType,
  AnnotationRelation,
  AttributeInfo,
  Diagnostic,
  ModelInstanceGraph,
  ModelInstanceNode,
  ModelInstanceRelation,
  Node,
  RamenAnnotation,
  RamenChange,
  Relation,
} from '../../dist/ramen-core/index.js';

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

function annotationData(properties: Readonly<Record<string, unknown>>): ModelInstanceGraph {
  return {
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
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'imageRegion',
    properties: [property],
  });
  fixture.project.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'emphasis' });

  assert.equal(created.validation.valid, true, JSON.stringify(created.validation.diagnostics));
  assert.deepEqual(
    fixture.project
      .getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'imageRegion')
      .map((item: PropertyOption): string => item.name),
    ['width'],
  );
  assert.deepEqual(fixture.project.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'emphasis'), []);
  assert.equal(
    fixture.project.getAttributes(RAMEN_ELEMENT.ANNOTATION).some((item: AttributeInfo): boolean => item.name === 'width'),
    false,
  );
  assert.equal(fixture.project.validateInstances(annotationData({ type: 'imageRegion', width: 3 })).hasErrors, false);

  for (const properties of [{ type: 'imageRegion' }, { type: 'imageRegion', width: 'wide' }, { type: 'emphasis', width: 3 }]) {
    assert.equal(fixture.project.validateInstances(annotationData(properties)).hasErrors, true);
  }
  const exported: ReturnType<RamenModel['export']> = fixture.project.export();
  const restored: RamenModel = RamenModel.import(JSON.parse(JSON.stringify(exported)) as unknown);
  assert.deepEqual(restored.getAnnotations(), fixture.project.getAnnotations());
});

void test('annotation types can use one property name with different data types', (): void => {
  const fixture: MediaModel = mediaModel();
  const note: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'note',
    properties: [{ name: 'place', typeId: 'String' }],
  });
  const region: RamenChange<RamenAnnotation> = fixture.project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'region',
    properties: [{ name: 'place', typeId: 'Integer' }],
  });

  assert.equal(note.validation.valid, true);
  assert.equal(region.validation.valid, true);
  assert.equal(fixture.project.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'note')[0]?.typeId, 'String');
  assert.equal(fixture.project.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'region')[0]?.typeId, 'Integer');
  assert.equal(fixture.project.validateInstances(annotationData({ type: 'note', place: 'foot' })).hasErrors, false);
  assert.equal(fixture.project.validateInstances(annotationData({ type: 'note', place: 2 })).hasErrors, true);
  assert.equal(fixture.project.validateInstances(annotationData({ type: 'region', place: 2 })).hasErrors, false);
  assert.equal(fixture.project.validateInstances(annotationData({ type: 'region', place: 'foot' })).hasErrors, true);
});

void test('RAMEN annotations accept one optional typed selector on the shared Annotation node', (): void => {
  const fixture: MediaModel = mediaModel();

  fixture.project.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'person' });

  const valid: ModelInstanceGraph = annotationData({
    type: 'person',
    selector: { type: 'TextPositionSelector', start: 2, end: 8 },
  });
  const wholeTarget: ModelInstanceGraph = annotationData({ type: 'person' });
  const invalidType: ModelInstanceGraph = annotationData({ type: 'person', selector: { start: 2 } });
  const invalidValue: ModelInstanceGraph = annotationData({ type: 'person', selector: '[2,8]' });

  assert.equal(fixture.project.validateInstances(valid).hasErrors, false);
  assert.equal(fixture.project.validateInstances(wholeTarget).hasErrors, false);
  assert.ok(
    fixture.project
      .validateInstances(invalidType)
      .diagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_INSTANCE_SELECTOR_TYPE_REQUIRED'),
  );
  assert.ok(
    fixture.project
      .validateInstances(invalidValue)
      .diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_PROPERTY_TYPE_INVALID'),
  );
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
    nodeId: owner.id,
    type: 'region',
    properties: [{ attributeId: selected.id }, width()],
  });

  assert.equal(valid.validation.valid, true);
  assert.deepEqual(
    fixture.project.getAttributesForAnnotation(owner.id, 'region').map((item: PropertyOption): string => item.name),
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
  const base: ModelInstanceGraph = annotationData({ type: 'comment' });
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
    nodeId: RAMEN_ELEMENT.ANNOTATION,
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
      .getAdvisor()
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

void test('properties keep their datatype and options through a refined Annotation node and another level', (): void => {
  const fixture: MediaModel = mediaModel();
  const dataType: DataType = fixture.project.createDataType({ name: 'Caption', baseType: 'String' }).element;
  const property: Attribute = ModelFactory.createAttribute({
    name: 'caption',
    typeId: dataType.id,
    bounds: { lowerBound: 1, upperBound: 1 },
  });
  fixture.project.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'caption', properties: [property] });
  const next: RamenModel = fixture.project.createNextLevel({
    id: 'mediaRefinedLevel001',
    uri: 'https://example.org/media-next',
    name: 'Edition',
    version: '1.0.0',
  });
  const owner: Node = next.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const options: readonly PropertyOption[] = next.getAttributesForAnnotation(owner.id, 'caption');

  assert.equal(next.validate().valid, true);
  assert.equal(options[0]?.ref, `${fixture.project.getModel().id}:${property.id}`);
  const base: ModelInstanceGraph = annotationData({ type: 'caption', caption: 'Heading' });
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

void test('refined Annotation nodes suggest inherited and newly added node attributes', (): void => {
  const project: RamenModel = RamenModel.create('Edition');
  const annotation: Node = project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const place: Attribute = project.createAttribute(annotation, { name: 'place', typeId: 'String' }).element;
  project.createAnnotation({ node: annotation, type: 'note', properties: [{ attribute: place }] });

  const next: RamenModel = project.createNextLevel('Publication');
  const review: Node = next.createNode({ name: 'ReviewAnnotation', refines: annotation }).element;

  assert.equal(next.validateAttributeName(review, 'place').allowed, false);
  assert.equal(next.validateAttributeName(review, 'n').allowed, true);

  next.createAttribute(review, { name: 'n', typeId: 'String' });

  const options: AnnotationOptions | undefined = next.suggestAnnotationOptions(review);
  assert.deepEqual(
    options?.properties.map((property: PropertyOption): string => property.name),
    ['n', 'place'],
  );
  assert.deepEqual(
    next.getAttributesForAnnotation(review, 'note').map((property: PropertyOption): string => property.name),
    ['place'],
  );
  assert.equal(next.validate().valid, true);
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
    nodeId: RAMEN_ELEMENT.ANNOTATION,
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
    nodeId: RAMEN_ELEMENT.ANNOTATION,
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

void test('annotation options exposes selected properties, carrier relations and cardinality presets through the model API', (): void => {
  const fixture: MediaModel = mediaModel();
  const owner: Node = fixture.project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;
  const label: Attribute = fixture.project.createAttribute(owner, { name: 'label', typeId: 'String' }).element;
  const options: AnnotationOptions | undefined = fixture.project.suggestAnnotationOptions(owner);
  assert.ok(options);
  assert.deepEqual(
    options.properties.map((item: PropertyOption): string => item.name),
    ['label'],
  );
  assert.equal(fixture.project.suggestAnnotationOptions(fixture.text), undefined);

  fixture.project.createAnnotation({
    node: owner,
    type: 'caption',
    properties: [{ attributeId: label.id, bounds: { lowerBound: 1, upperBound: 1 } }],
    relations: [{ relationId: fixture.textLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  const properties: readonly PropertyOption[] = fixture.project.getAttributesForAnnotation(owner, 'caption');
  const relations: readonly RelationOption[] = fixture.project.getRelationsForAnnotation(owner, 'caption');
  assert.deepEqual(properties[0]?.suggestedBounds, { lowerBound: 1, upperBound: 1 });
  assert.deepEqual(properties[0]?.cardinalityOptions, [{ lowerBound: 1, upperBound: 1 }]);
  assert.deepEqual(
    relations.map((item: RelationOption): string => item.targetName),
    ['Text'],
  );
  assert.deepEqual(relations[0]?.cardinalityOptions, [{ lowerBound: 1, upperBound: 1 }]);
  assert.deepEqual(fixture.project.getRelationsForAnnotation(owner, 'unknown'), []);

  const next: RamenModel = fixture.project.createNextLevel('Edition');
  const refined: Node = next.createNode({ name: 'EditionAnnotation', refines: owner }).element;
  assert.deepEqual(next.getRelationsForAnnotation(refined, 'caption'), []);
  next.hasAnnotation(fixture.text, refined);
  assert.deepEqual(
    next.getRelationsForAnnotation(refined, 'caption').map((item: RelationOption): string => item.targetName),
    ['Text'],
  );
  assert.deepEqual(next.suggestAnnotationsForNode(fixture.image, refined), []);
  assert.equal(next.validate().valid, true);
});

void test('changing returned annotation options cannot change later options or validation', (): void => {
  const fixture: MediaModel = mediaModel();
  fixture.project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'region',
    properties: [width()],
    relations: [{ relationId: fixture.imageLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  const property: PropertyOption | undefined = fixture.project.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'region')[0];
  const relation: RelationOption | undefined = fixture.project.getRelationsForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'region')[0];
  assert.ok(property);
  assert.ok(relation);
  property.suggestedBounds.lowerBound = 99;
  relation.suggestedBounds.lowerBound = 99;

  assert.equal(fixture.project.getAttributesForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'region')[0]?.suggestedBounds.lowerBound, 1);
  assert.equal(fixture.project.getRelationsForAnnotation(RAMEN_ELEMENT.ANNOTATION, 'region')[0]?.suggestedBounds.lowerBound, 1);
  assert.equal(fixture.project.validate().valid, true);
});

function manyAnnotations(fixture: MediaModel, count: number): ModelInstanceGraph {
  const nodes: ModelInstanceNode[] = [
    { id: 'imageRecord00001', typeId: fixture.image.id, properties: { uuid: 'abac88bd-b3e3-418a-8afe-6ac14409b9a1' } },
  ];
  const relations: ModelInstanceRelation[] = [];
  for (let index: number = 0; index < count; index += 1) {
    const id: string = `annotation${String(index).padStart(16, '0')}`;
    nodes.push({
      id,
      typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`,
      properties: { uuid: `abac88bd-b3e3-418a-8afe-${String(index).padStart(12, '0')}`, type: 'region', width: 20 },
    });
    relations.push({
      id: `link${String(index).padStart(16, '0')}`,
      typeId: fixture.imageLink.id,
      fromId: 'imageRecord00001',
      toId: id,
    });
  }
  return { nodes, relations };
}

void test('1000 annotations on an unchanged Annotation node retain carrier and property checks after exchange', (): void => {
  const fixture: MediaModel = mediaModel();
  fixture.project.createAnnotation({
    nodeId: RAMEN_ELEMENT.ANNOTATION,
    type: 'region',
    properties: [width()],
    relations: [{ relationId: fixture.imageLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  const restored: RamenModel = RamenModel.import(fixture.project.export());
  const data: ModelInstanceGraph = manyAnnotations(fixture, 1000);
  assert.equal(restored.validateInstances(data).hasErrors, false);
  assert.deepEqual(restored.suggestAnnotationsForNode(fixture.text), []);
  assert.equal(restored.suggestAnnotationsForNode(fixture.image)[0]?.type, 'region');

  const missing: ModelInstanceGraph = { ...data, relations: data.relations.slice(1) };
  assert.ok(
    restored
      .validateInstances(missing)
      .diagnostics.some(
        (item: Diagnostic): boolean =>
          item.code === 'RAMEN_INSTANCE_ANNOTATION_RELATION_CARDINALITY' && item.ref === data.nodes[1]?.id,
      ),
  );
});

void test('a type-owned custom datatype resolves in the project when Annotation is reused unchanged', (): void => {
  const project: RamenModel = RamenModel.create('Media');
  const count: DataType = project.createDataType({ name: 'Count', baseType: 'Integer' }).element;
  const property: Attribute = ModelFactory.createAttribute({
    name: 'width',
    typeId: count.id,
    bounds: { lowerBound: 1, upperBound: 1 },
  });
  project.createAnnotation({ nodeId: RAMEN_ELEMENT.ANNOTATION, type: 'region', properties: [property] });
  const restored: RamenModel = RamenModel.import(project.export());
  assert.equal(restored.validate().valid, true);
  assert.equal(restored.validateInstances(annotationData({ type: 'region', width: 2 })).hasErrors, false);
  assert.ok(
    restored
      .validateInstances(annotationData({ type: 'region', width: 'wrong' }))
      .diagnostics.some((item: Diagnostic): boolean => item.code === 'INSTANCE_PROPERTY_TYPE_INVALID'),
  );
});
