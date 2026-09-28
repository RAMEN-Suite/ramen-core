import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFactory } from '../../dist/ramen-core/model/index.js';
import type {
  Attribute,
  Classifier,
  Model,
  ModelInstanceGraph,
  Diagnostic,
  Node,
  Owned,
  Relation,
} from '../../dist/ramen-core/model/index.js';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenFiles, RamenModel } from '../../dist/ramen-core/ramen/index.js';
import type { AnnotationRelation, AnnotationSuggestion, RamenAnnotation, RamenFile } from '../../dist/ramen-core/ramen/index.js';

interface Media {
  readonly project: RamenModel;
  readonly text: Node;
  readonly image: Node;
  readonly owner: string;
  readonly textLink: Relation;
  readonly imageLink: Relation;
}

function media(refined: boolean): Media {
  const project: RamenModel = RamenModel.create('Media');
  const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
  const image: Node = project.createNode({ name: 'Image', refines: RAMEN_ELEMENT.CONTENT }).element;
  const owner: string = refined
    ? project.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element.id
    : `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.ANNOTATION}`;
  const textLink: Relation = project.hasAnnotation(text, owner).element;
  const imageLink: Relation = project.hasAnnotation(image, owner).element;
  const width: Attribute = ModelFactory.createAttribute({
    name: 'width',
    typeId: 'Integer',
    bounds: { lowerBound: 1, upperBound: 1 },
  });
  project.createAnnotation({
    annotationId: owner,
    type: 'caption',
    relations: [{ relationId: textLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  project.createAnnotation({
    annotationId: owner,
    type: 'region',
    properties: [width],
    relations: [{ relationId: imageLink.id, direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  return { project, text, image, owner, textLink, imageLink };
}

function roundTrip(project: RamenModel): RamenModel {
  const file: RamenFile = project.export();
  const restored: RamenModel = RamenModel.import(JSON.parse(JSON.stringify(file)) as unknown);
  assert.deepEqual(restored.getModels(), project.getModels());
  assert.deepEqual(restored.export(), file);
  assert.equal('origin' in file, false);
  assert.equal('rootModelId' in file, false);
  return restored;
}

function types(project: RamenModel, carrier: Node, owner: string): readonly string[] {
  return project
    .suggestAnnotationsForNode(carrier, owner)
    .map((item: AnnotationSuggestion): string => item.type)
    .sort();
}

void test('a shared graph supports unchanged Annotation and separate Text and Image type choices', (): void => {
  const fixture: Media = media(false);
  const restored: RamenModel = roundTrip(fixture.project);
  const file: RamenFile = fixture.project.export();
  assert.deepEqual(types(restored, fixture.text, fixture.owner), ['caption']);
  assert.deepEqual(types(restored, fixture.image, fixture.owner), ['region']);
  assert.equal(file.annotations.length, 2);
  assert.equal(file.annotations[0]?.modelId, fixture.project.getModel().id);
  assert.equal(file.annotations[0]?.annotationId, fixture.owner);
  assert.equal(file.classifiers.filter((item: Owned<Classifier>): boolean => item.id === RAMEN_ELEMENT.ANNOTATION).length, 1);
});

void test('refined Annotation keeps inheritance without copying properties or type declarations', (): void => {
  const fixture: Media = media(true);
  const label: Attribute = fixture.project.createAttribute(fixture.owner, { name: 'label', typeId: 'String' }).element;
  const caption: RamenAnnotation | undefined = fixture.project
    .getAnnotations()
    .find((item: RamenAnnotation): boolean => item.type === 'caption');
  assert.ok(caption);
  fixture.project.updateAnnotation(caption.id, {
    properties: [{ attributeId: label.id, bounds: { lowerBound: 1, upperBound: 1 } }],
  });
  const next: RamenModel = fixture.project.createNextLevel('Edition');
  const owner: Node = next.createNode({ name: 'EditionAnnotation', refines: fixture.owner }).element;
  next.hasAnnotation(fixture.text, owner);
  const restored: RamenModel = roundTrip(next);
  const declaration: Owned<Classifier> | undefined = next
    .export()
    .classifiers.find((item: Owned<Classifier>): boolean => item.id === owner.id);
  assert.ok(declaration?.kind === 'Node');
  assert.deepEqual(declaration.attributes, []);
  assert.deepEqual(declaration.superTypes, owner.superTypes);
  assert.equal(next.export().annotations.length, 2);
  assert.deepEqual(restored.getAttributesForAnnotation(owner, 'caption')[0]?.suggestedBounds, {
    lowerBound: 1,
    upperBound: 1,
  });
  assert.deepEqual(types(restored, fixture.image, owner.id), []);
  assert.deepEqual(types(restored, fixture.text, owner.id), ['caption']);
});

void test('editing a shared declaration changes exactly its original model after import', (): void => {
  const fixture: Media = media(false);
  const file: RamenFile = fixture.project.export();
  const edited: RamenFile = {
    ...file,
    annotations: file.annotations.map((item: Owned<RamenAnnotation>): Owned<RamenAnnotation> =>
      item.type === 'caption' ? { ...item, type: 'heading' } : item,
    ),
  };
  const restored: RamenModel = RamenModel.import(edited);
  assert.deepEqual(types(restored, fixture.text, fixture.owner), ['heading']);
  assert.deepEqual(
    restored.getModels().find((model: Model): boolean => model.id === RAMEN_MODEL.id),
    RAMEN_MODEL,
  );
  assert.deepEqual(types(fixture.project, fixture.text, fixture.owner), ['caption']);
});

void test('alternative carriers retain one shared cardinality rule through import', (): void => {
  const fixture: Media = media(false);
  fixture.project.createAnnotation({
    annotationId: fixture.owner,
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
  const restored: RamenModel = roundTrip(fixture.project);
  assert.deepEqual(types(restored, fixture.text, fixture.owner), ['caption', 'comment']);
  assert.deepEqual(types(restored, fixture.image, fixture.owner), ['comment', 'region']);
  assert.deepEqual(restored.getAnnotations(), fixture.project.getAnnotations());
});

void test('annotation declarations reject unknown owners, generic owners and unresolved relations', (): void => {
  const fixture: Media = media(false);
  const file: RamenFile = fixture.project.export();
  for (const owner of ['unknownOwner00001', RAMEN_MODEL.id]) {
    const broken: RamenFile = {
      ...file,
      annotations: file.annotations.map((item: Owned<RamenAnnotation>): Owned<RamenAnnotation> => ({ ...item, modelId: owner })),
    };
    assert.throws((): RamenModel => RamenModel.import(broken), /Invalid annotation owner/);
  }
  const dangling: RamenFile = { ...file, relations: [] };
  assert.throws((): RamenModel => RamenModel.import(dangling), /Invalid model file/);
});

void test('file readers return detached annotation properties and preserve data validation', (): void => {
  const fixture: Media = media(false);
  const file: RamenFile = fixture.project.export();
  const models: readonly Model[] = RamenFiles.read(file);
  const restored: RamenModel = roundTrip(fixture.project);
  const values: readonly unknown[] = [5, 'wide', undefined];
  for (const width of values) {
    const data: ModelInstanceGraph = {
      modelId: fixture.project.getModel().id,
      nodes: [
        {
          id: 'annotationData01',
          typeId: fixture.owner,
          properties: { uuid: 'abac88bd-b3e3-418a-8afe-6ac14409b9a1', type: 'region', ...(width === undefined ? {} : { width }) },
        },
        { id: 'imageData0000001', typeId: fixture.image.id, properties: { uuid: 'b9c07998-641b-4b6e-8b48-f039d67d9ced' } },
      ],
      relations: [{ id: 'imageAttach00001', typeId: fixture.imageLink.id, fromId: 'imageData0000001', toId: 'annotationData01' }],
    };
    assert.equal(restored.validateInstances(data).hasErrors, width !== 5);
    assert.deepEqual(restored.validateInstances(data), fixture.project.validateInstances(data));
  }
  const property: RamenAnnotation['properties'][number] | undefined = file.annotations[1]?.properties[0];
  assert.ok(property && 'name' in property);
  property.name = 'changedOutside';
  const readProject: Model | undefined = models.find((item: Model): boolean => item.id === file.id);
  assert.ok(readProject);
  assert.equal(JSON.stringify(readProject).includes('changedOutside'), false);
});

void test('removing declarations cleans qualified local references after graph import', (): void => {
  const fixture: Media = media(true);
  const label: Attribute = fixture.project.createAttribute(fixture.owner, { name: 'label', typeId: 'String' }).element;
  const file: RamenFile = fixture.project.export();
  const edited: RamenFile = {
    ...file,
    annotations: file.annotations.map((item: Owned<RamenAnnotation>): Owned<RamenAnnotation> => ({
      ...item,
      annotationId: `${file.id}:${fixture.owner}`,
      properties: [{ attributeId: `${file.id}:${label.id}` }],
      relations: item.relations.map((relation: AnnotationRelation): AnnotationRelation => ({
        ...relation,
        relationId: `${file.id}:${relation.relationId}`,
      })),
    })),
    relations: file.relations.map((item: Owned<Relation>): Owned<Relation> =>
      item.modelId !== file.id
        ? item
        : {
            ...item,
            from: { ...item.from, nodeId: `${file.id}:${item.from.nodeId}` },
            to: { ...item.to, nodeId: `${file.id}:${item.to.nodeId}` },
          },
    ),
  };
  const restored: RamenModel = RamenModel.import(edited);
  assert.equal(restored.removeAttribute(fixture.owner, label.id).validation.valid, true);
  assert.deepEqual(restored.getAnnotations()[0]?.properties, []);
  assert.equal(restored.removeNode(fixture.text.id).validation.valid, true);
  assert.deepEqual(restored.getAnnotations()[0]?.relations, []);
  assert.equal(restored.removeNode(fixture.owner).validation.valid, true);
  assert.deepEqual(restored.getAnnotations(), []);
  assert.deepEqual(restored.getModel().relations, []);
});

void test('overlapping alternative relations are rejected in either ancestor order', (): void => {
  const fixture: Media = media(false);
  const narrower: Relation = fixture.project.createRelation({
    refines: fixture.textLink,
    fromNode: fixture.text,
    toNodeId: fixture.owner,
  }).element;
  const original: RamenAnnotation | undefined = fixture.project
    .getAnnotations()
    .find((item: RamenAnnotation): boolean => item.type === 'caption');
  assert.ok(original);
  const orders: readonly (readonly Relation[])[] = [
    [fixture.textLink, narrower],
    [narrower, fixture.textLink],
  ];
  for (const order of orders) {
    const first: Relation | undefined = order[0];
    const second: Relation | undefined = order[1];
    assert.ok(first && second);
    const changed: ReturnType<RamenModel['updateAnnotation']> = fixture.project.updateAnnotation(original.id, {
      relations: [
        { relationId: first.id, alternatives: [second.id], direction: 'incoming', bounds: { lowerBound: 1, upperBound: 1 } },
      ],
    });
    assert.ok(
      changed.validation.diagnostics.some((item: Diagnostic): boolean => item.code === 'RAMEN_ANNOTATION_RELATION_INVALID'),
    );
  }
});
