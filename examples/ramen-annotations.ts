import assert from 'node:assert/strict';
import type { Node, Relation } from '../dist/model/index.js';
import { RAMEN_ELEMENT, RamenModel } from '../dist/ramen/index.js';
import type { AnnotationRelation, AnnotationSuggestion } from '../dist/ramen/index.js';

// Reuse RAMEN's Annotation node. Its uuid and type properties already exist.
const project: RamenModel = RamenModel.create('Text annotations');
const annotation: string = RAMEN_ELEMENT.ANNOTATION;
const text: Node = project.createNode({ name: 'Text', refines: RAMEN_ELEMENT.CONTENT }).element;
const person: Node = project.createNode({ name: 'Person', refines: RAMEN_ELEMENT.ENTITY }).element;
const place: Node = project.createNode({ name: 'Place', refines: RAMEN_ELEMENT.ENTITY }).element;
const attachment: Relation = project.hasAnnotation(text, annotation).element;
const personLink: Relation = project.refersTo(annotation, person).element;
const placeLink: Relation = project.refersTo(annotation, place).element;

// Every type below attaches to exactly one Text. Incoming means Text → Annotation.
const onText: AnnotationRelation = {
  relationId: attachment.id,
  direction: 'incoming',
  bounds: { lowerBound: 1, upperBound: 1 },
};

// TEI-inspired project names: highlight, addition and deletion. This is not a TEI schema.
const textTypes: readonly string[] = ['hi', 'add', 'del'];
for (const type of textTypes) {
  project.createAnnotation({ annotationId: annotation, type, relations: [onText] });
}

// Person and place additionally require exactly one reference to the respective entity.
project.createAnnotation({
  annotationId: annotation,
  type: 'person',
  relations: [onText, { relationId: personLink.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
});
project.createAnnotation({
  annotationId: annotation,
  type: 'place',
  relations: [onText, { relationId: placeLink.id, direction: 'outgoing', bounds: { lowerBound: 1, upperBound: 1 } }],
});

// Result for a type picker: ["add", "del", "hi", "person", "place"].
const choices: readonly AnnotationSuggestion[] = project.suggestAnnotationsForNode(text);
const names: readonly string[] = choices.map((choice: AnnotationSuggestion): string => choice.type);
assert.deepEqual(names, ['add', 'del', 'hi', 'person', 'place']);
assert.equal(project.validate().valid, true);
console.log('Types for Text:', names);
console.log('Stored annotation definitions:', JSON.stringify(project.getAnnotations(), null, 2));
