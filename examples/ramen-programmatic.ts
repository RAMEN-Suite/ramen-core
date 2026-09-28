import assert from 'node:assert/strict';
import { ModelFactory } from '../dist/ramen-core/model/index.js';
import type { Attribute, Node, Relation } from '../dist/ramen-core/model/index.js';
import { RAMEN_ELEMENT, RAMEN_MODEL, RamenModel } from '../dist/ramen-core/ramen/index.js';
import type { RamenAnnotation, RamenFile } from '../dist/ramen-core/ramen/index.js';

// One complete project model: collections, entities, content, annotations, and their relations.
const correspondence: RamenModel = RamenModel.create('Correspondence');

const letter: Node = correspondence.createNode({ name: 'Letter', refines: RAMEN_ELEMENT.COLLECTION }).element;
const witness: Node = correspondence.createNode({ name: 'Witness', refines: RAMEN_ELEMENT.COLLECTION }).element;
const person: Node = correspondence.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = correspondence.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
const text: Node = correspondence.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const annotation: Node = correspondence.createNode({ name: 'TextAnnotation', refines: RAMEN_ELEMENT.ANNOTATION }).element;

const url: Attribute = correspondence.createAttribute(annotation.id, {
  name: 'url',
  typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.URI}`,
  bounds: { lowerBound: 0, upperBound: 1 },
}).element;

correspondence.partOf(witness, letter);
correspondence.partOf(text, witness);
correspondence.hasAnnotation(text, annotation);
correspondence.hasAnnotation(person, annotation);

const personReference: Relation = correspondence.refersTo(annotation, person).element;
const placeReference: Relation = correspondence.refersTo(annotation, place).element;
const annotationReference: Relation = correspondence.hasAnnotation(annotation, annotation).element;

const annotations: readonly RamenAnnotation[] = [
  correspondence.createAnnotation({
    annotationId: annotation.id,
    type: 'person',
    relations: [{ relationId: personReference.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element,
  correspondence.createAnnotation({
    annotationId: annotation.id,
    type: 'place',
    relations: [{ relationId: placeReference.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element,
  correspondence.createAnnotation({
    annotationId: annotation.id,
    type: 'date',
    properties: [
      ModelFactory.createAttribute({
        name: 'value',
        typeId: `${RAMEN_MODEL.id}:${RAMEN_ELEMENT.DATE}`,
        bounds: { lowerBound: 1, upperBound: 1 },
      }),
    ],
  }).element,
  correspondence.createAnnotation({
    annotationId: annotation.id,
    type: 'comment',
    relations: [{ relationId: annotationReference.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element,
  correspondence.createAnnotation({
    annotationId: annotation.id,
    type: 'externalReference',
    properties: [{ attributeId: url.id, bounds: { lowerBound: 1, upperBound: 1 } }],
  }).element,
];

assert.equal(correspondence.validate().valid, true);
assert.equal(annotations.length, 5);

const exported: RamenFile = correspondence.export();
const restored: RamenModel = RamenModel.import(JSON.parse(JSON.stringify(exported)) as unknown);
assert.equal(restored.getAnnotations().length, 5);
console.log(`Created ${restored.getModel().name} with ${restored.getModel().classifiers.length} node types.`);
