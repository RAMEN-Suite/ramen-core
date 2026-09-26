import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelFactory } from '../../dist/model/index.js';
import type { Attribute, Classifier, DataType, Node, Relation } from '../../dist/model/index.js';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '../../dist/ramen/index.js';
import type { AnnotationSuggestion, RamenAnnotation } from '../../dist/ramen/index.js';
import { resolve, restore, schema } from '../../examples/export/resolve.ts';
import type { Export, RelationView } from '../../examples/export/resolve.ts';
import type { AnnotationView, Group } from '../../examples/export/annotations.ts';

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
  const size: DataType = project.createDataType({ name: 'Size', baseType: 'Integer' }).element;
  const width: Attribute = ModelFactory.createAttribute({
    name: 'width',
    typeId: size.id,
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

// A consumer uses only the resolved model; there is no inheritance or origin traversal here.
function forCarrier(output: Export, carrier: string, owner: string): readonly string[] {
  return output.model.annotations
    .filter(
      (annotation: AnnotationView): boolean =>
        annotation.nodeId === owner &&
        annotation.relations.some(
          (group: Group): boolean =>
            group.direction === 'incoming' &&
            group.bounds.upperBound !== 0 &&
            output.model.relations.some(
              (relation: RelationView): boolean =>
                group.relations.includes(relation.ref) &&
                relation.from.accepts.includes(carrier) &&
                relation.to.accepts.includes(owner),
            ),
        ),
    )
    .map((annotation: AnnotationView): string => annotation.type)
    .sort();
}

function checkCarriers(fixture: Media, project: RamenModel, owner: string): void {
  const output: Export = resolve(project);
  const nodeRef: string = owner.includes(':') ? owner : `${project.getModel().id}:${owner}`;
  const restored: RamenModel = restore(JSON.parse(JSON.stringify(output)) as unknown);
  assert.deepEqual(restored.getModels(), project.getModels());
  for (const carrier of [fixture.text, fixture.image]) {
    const expected: readonly string[] = project
      .suggestAnnotationsForNode(carrier, owner)
      .map((item: AnnotationSuggestion): string => item.type)
      .sort();
    assert.deepEqual(forCarrier(output, `${fixture.project.getModel().id}:${carrier.id}`, nodeRef), expected);
    assert.deepEqual(restored.suggestAnnotationsForNode(carrier, owner), project.suggestAnnotationsForNode(carrier, owner));
  }
  assert.equal(schema.validate(output).valid, true);
  assert.deepEqual(resolve(restored), output);
}

void test('resolved export supports the original Annotation node and closed type-owned properties', (): void => {
  const fixture: Media = media(false);
  const output: Export = resolve(fixture.project);
  const region: AnnotationView | undefined = output.model.annotations.find(
    (item: AnnotationView): boolean => item.type === 'region',
  );
  const caption: AnnotationView | undefined = output.model.annotations.find(
    (item: AnnotationView): boolean => item.type === 'caption',
  );
  assert.deepEqual(
    region?.properties.map((item: Attribute): string => item.name),
    ['uuid', 'type', 'width'],
  );
  assert.deepEqual(
    caption?.properties.map((item: Attribute): string => item.name),
    ['uuid', 'type'],
  );
  assert.ok(
    region?.properties
      .find((item: Attribute): boolean => item.name === 'width')
      ?.typeId.startsWith(`${fixture.project.getModel().id}:`),
  );
  assert.equal(
    fixture.project
      .getModel()
      .classifiers.some((item: Classifier): boolean => item.kind === 'Node' && item.name === 'Annotation'),
    false,
  );
  checkCarriers(fixture, fixture.project, fixture.owner);
});

void test('refined Annotation nodes resolve selected inherited properties with narrowed bounds', (): void => {
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
  const output: Export = resolve(next);
  const inherited: AnnotationView | undefined = output.model.annotations.find(
    (item: AnnotationView): boolean => item.type === 'caption' && item.nodeId.endsWith(`:${owner.id}`),
  );
  assert.deepEqual(inherited?.properties.find((item: Attribute): boolean => item.name === 'label')?.bounds, {
    lowerBound: 1,
    upperBound: 1,
  });
  assert.equal(output.origin.annotations.length, 2);
  assert.deepEqual(next.getAnnotations(), []);
  checkCarriers(fixture, next, owner.id);
});

void test('inherited type rules do not restore excluded image relations', (): void => {
  const fixture: Media = media(false);
  const next: RamenModel = fixture.project.createNextLevel('Text edition');
  const owner: Node = next.createNode({ name: 'TextAnnotation', refines: fixture.owner }).element;
  next.hasAnnotation(fixture.text, owner);
  const output: Export = resolve(next);
  const region: AnnotationView | undefined = output.model.annotations.find(
    (item: AnnotationView): boolean => item.type === 'region' && item.nodeId.endsWith(`:${owner.id}`),
  );
  assert.deepEqual(region?.relations[0]?.relations, []);
  assert.deepEqual(region?.relations[0]?.bounds, { lowerBound: 1, upperBound: 1 });
  assert.equal(output.model.relations.length, 1);
  checkCarriers(fixture, next, owner.id);
});

void test('alternative carriers retain a shared cardinality group and reject export tampering', (): void => {
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
  const output: Export = resolve(fixture.project);
  const comment: AnnotationView | undefined = output.model.annotations.find(
    (item: AnnotationView): boolean => item.type === 'comment',
  );
  assert.ok(comment);
  assert.equal(comment.relations.length, 1);
  assert.equal(comment.relations[0]?.relations.length, 2);
  assert.deepEqual(comment.relations[0]?.bounds, { lowerBound: 1, upperBound: 1 });
  const edited: Export = { ...output, model: { ...output.model, annotations: [] } };
  assert.throws((): RamenModel => restore(edited), /Effective model and origin disagree/);
  assert.equal(
    schema.validate({ ...output, model: { ...output.model, annotations: [{ ...comment, nodeId: 'missing' }] } }).valid,
    false,
  );
  checkCarriers(fixture, fixture.project, fixture.owner);
});
